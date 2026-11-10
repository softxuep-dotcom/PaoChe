import Phaser from 'phaser';
import { WIDTH, HEIGHT, GUNS, Run } from './model.js';
import { createBattleScene } from './BattleScene.js';
import { MEDALS, normalizeSave, recordBattle } from './records.js';
import { Sounds } from './sound.js';
import './style.css';

const get = id => document.getElementById(id);
const ui = {
  frame: get('frame'), menu: get('menu'), hud: get('hud'), controls: get('controls'),
  notice: get('notice'), hint: get('hint'), clock: get('clock'), wave: get('wave'),
  health: get('health-value'), healthFill: get('health-fill'), cars: get('cars'),
  carCount: get('cars-count'), bossHud: get('boss-hud'), bossState: get('boss-state'), bossFill: get('boss-fill'),
  stick: get('stick'), thumb: get('stick-thumb'), volley: get('volley'), caption: get('volley-caption'),
  modal: get('modal'), title: get('modal-title'), eyebrow: get('modal-eyebrow'),
  desc: get('modal-desc'), body: get('modal-body'), actions: get('modal-actions'), record: get('record'),
};
const SAVE_KEY = 'tow-cannon-squad-local-v1';
const directions = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1],
};
const gunColors = { side: '#83d6b4', front: '#f0c274', rear: '#9bbfe8' };
const gunGlyphs = { side: '↔', front: '➤', rear: '↶', repair: '+' };
const damageLabels = { head: '车头基础炮', crossfire: '夹击爆破' };
const bossLabels = { stalk: '护甲闭合', windup: '冲锋预警', charge: '冲锋', recover: '弱点亮起', exposed: '核心暴露' };
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const elapsed = seconds => {
  const s = Math.max(0, Math.floor(seconds || 0));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

function loadSave(fallback = normalizeSave(null)) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : fallback;
  } catch {
    return fallback;
  }
}

let save = loadSave();
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
}

const run = new Run();
const sounds = new Sounds();
sounds.enabled = !save.muted;
const controls = { move: { x: 0, y: 0 } };
const keys = new Set();
let drag = null;
let page = null;
let previousPhase = null;
let currentSupply = null;
let result = null;
let lastPaint = -Infinity;
let lastHP = 0;
let lastDurability = 0;
let lastRecovered = 0;
let lastReady = true;
let lastTailAim = false;
let lastBossState = '';
let lastNotice = null;
let noticeUntil = 0;

const carStatus = Array.from({ length: 4 }, () => {
  const slot = document.createElement('div');
  slot.className = 'car-status';
  const pips = Array.from({ length: 3 }, () => {
    const pip = document.createElement('i');
    slot.appendChild(pip);
    return pip;
  });
  ui.cars.appendChild(slot);
  return { slot, pips };
});

function setMove(x, y) {
  const length = Math.hypot(x, y);
  const denominator = Math.max(1, length);
  controls.move.x = x / denominator;
  controls.move.y = y / denominator;
  ui.thumb.style.transform = 'translate(' + (controls.move.x * 67) + '%, ' + (controls.move.y * 67) + '%)';
}

function readKeys() {
  if (drag) return;
  let x = 0, y = 0;
  if (run.phase === 'playing') {
    for (const key of keys) {
      x += directions[key][0];
      y += directions[key][1];
    }
  }
  setMove(x, y);
}

function endDrag() {
  if (!drag) return;
  const { id } = drag;
  drag = null;
  if (ui.frame.hasPointerCapture(id)) ui.frame.releasePointerCapture(id);
  ui.stick.classList.remove('active');
  ui.stick.removeAttribute('style');
  readKeys();
}

function clearInput() {
  keys.clear();
  endDrag();
  setMove(0, 0);
}

function updateRecord() {
  const { full, quick } = save.records;
  const items = [];
  if (quick.bestTime) items.push('试打 ' + elapsed(quick.bestTime));
  if (full.bestTime) items.push('完整战 ' + elapsed(full.bestTime));
  if (save.medals.length) items.push('徽章 ' + save.medals.length + '/' + MEDALS.length);
  ui.record.textContent = items.length ? items.join(' · ') : '荒野战线 · 单指驾驶';
}

function start(mode) {
  sounds.unlock();
  sounds.play('click');
  clearInput();
  page = null;
  result = null;
  lastNotice = null;
  noticeUntil = 0;
  run.seed = Math.floor(Math.random() * 0xffffffff);
  run.start(mode);
  lastHP = run.train.hp;
  lastDurability = run.train.cars.reduce((sum, car) => sum + car.hp, 0);
  lastRecovered = 0;
  lastReady = true;
  lastTailAim = false;
  lastBossState = '';
  paint(true);
}

function fire() {
  if (run.phase !== 'playing') return;
  sounds.unlock();
  const old = run.stats.volleys;
  const cross = run.stats.crossfires;
  run.fireVolley();
  if (run.stats.volleys > old) sounds.play(run.stats.crossfires > cross ? 'crossfire' : 'volley');
  paint(true);
}

function pause() {
  if (run.phase !== 'playing' && run.phase !== 'paused') return;
  run.togglePause();
  clearInput();
  paint(true);
}

function menu() {
  run.toMenu();
  page = null;
  clearInput();
  updateRecord();
  paint(true);
}

function button(label, kind, fn, subtitle) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = kind;
  const title = document.createElement('strong');
  title.textContent = label;
  element.appendChild(title);
  if (subtitle) {
    const span = document.createElement('span');
    span.textContent = subtitle;
    element.appendChild(span);
  }
  element.addEventListener('click', fn);
  return element;
}

function showPanel(eyebrow, title, desc) {
  ui.eyebrow.textContent = eyebrow;
  ui.title.textContent = title;
  ui.desc.textContent = desc;
  ui.body.replaceChildren();
  ui.actions.replaceChildren();
  ui.modal.hidden = false;
}

function showHelp() {
  showPanel('操作指南', '沿着怪群开弯', '车身经过的路线，会决定每节炮的发射方向。');
  const help = [
    ['移动', '在战场上拖动。键盘用 WASD 或方向键。'],
    ['齐射', '炮口亮线出现后，点击齐射或按空格。双环标记表示可以触发夹击。'],
    ['整备', '接炮扩大射界，合并加强一门炮。掉下的炮车可以绕回抢救。'],
    ['首领', '避开冲锋路线，等守卫两侧弱点亮起，再从侧面齐射。'],
  ];
  for (const [title, detail] of help) {
    const row = document.createElement('div');
    row.className = 'help-line';
    const strong = document.createElement('b');
    strong.textContent = title + '　';
    row.append(strong, detail);
    ui.body.appendChild(row);
  }
  ui.actions.appendChild(button('回到首页', 'primary', () => { page = null; paint(true); }));
}

function toggleSound() {
  save = loadSave(save);
  save.muted = !save.muted;
  sounds.enabled = !save.muted;
  persist();
  sounds.unlock();
  sounds.play('click');
  showPause();
}

function showPause() {
  showPanel('作战暂停', '车队待命', '继续之前，可以先确认车尾位置和炮口方向。');
  ui.actions.append(
    button('继续战斗', 'primary', pause),
    button(save.muted ? '开启音效' : '关闭音效', 'secondary', toggleSound),
    button('返回首页', 'text-button', () => { page = 'quit'; paint(true); }),
  );
}

function showQuit() {
  showPanel('撤离确认', '返回首页？', '离开后这次出击结束。');
  ui.actions.append(
    button('继续作战', 'primary', () => { page = null; pause(); }),
    button('结束出击', 'secondary', menu),
  );
}

function showArchive() {
  save = loadSave(save);
  updateRecord();
  showPanel('本机记录', '作战档案', '快速试打与完整战斗分别记下最快通关、夹击和齐射战绩。');
  const records = document.createElement('div');
  records.className = 'archive-records';
  for (const [mode, label] of [['quick', '快速试打'], ['full', '完整战斗']]) {
    const record = save.records[mode];
    const box = document.createElement('div');
    box.className = 'archive-mode';
    const title = document.createElement('strong');
    title.textContent = label;
    const best = document.createElement('span');
    best.textContent = record.bestTime ? '最快 ' + elapsed(record.bestTime) : '待通关';
    const detail = document.createElement('small');
    detail.textContent = '单局夹击 ' + record.bestCrossfires + ' · 单发击毁 ' + record.bestBarrage;
    box.append(title, best, detail);
    records.appendChild(box);
  }
  ui.body.appendChild(records);
  if (save.legacyCrossfires > 0 || save.legacyWins > 0) {
    const legacy = document.createElement('small');
    legacy.className = 'archive-legacy';
    legacy.textContent = '初版纪录 · 通关 ' + save.legacyWins + ' 局 · 单局夹击 ' + save.legacyCrossfires + ' 次';
    ui.body.appendChild(legacy);
  }
  const medals = document.createElement('div');
  medals.className = 'medals';
  for (const medal of MEDALS) {
    const earned = save.medals.includes(medal.id);
    const row = document.createElement('div');
    row.className = 'medal' + (earned ? ' earned' : '');
    const title = document.createElement('strong');
    title.textContent = (earned ? '◆ ' : '◇ ') + medal.name;
    const detail = document.createElement('small');
    detail.textContent = medal.goal;
    row.append(title, detail);
    medals.appendChild(row);
  }
  ui.body.appendChild(medals);
  ui.actions.appendChild(button('回到首页', 'primary', () => { page = null; paint(true); }));
}

function showSupply() {
  const supply = run.supply;
  if (!supply) return;
  showPanel('荒野补给', supply.title || '整备车队',
    supply.description || '接炮增加一个射界，合并加强当前火力。');
  const commit = (id, targetId) => {
    if (run.phase !== 'supply' || run.supply !== supply) return;
    sounds.unlock();
    if (run.choose(id, targetId)) sounds.play('click');
    paint(true);
  };
  for (const option of supply.options) {
    const preview = option.preview;
    const type = preview?.type || option.type;
    const glyph = gunGlyphs[type] || '◇';
    if (option.id !== 'merge' || !option.targets?.length) {
      const detail = option.id === 'attach' && preview
        ? preview.effect + ' · 齐射 ' + preview.volley
        : option.description;
      const action = button(glyph + '  ' + option.label, 'option', () => commit(option.id), detail);
      action.style.setProperty('--choice-color', gunColors[type] || '#97d6a2');
      ui.body.appendChild(action);
      continue;
    }

    const block = document.createElement('section');
    block.className = 'merge-block';
    const picker = document.createElement('div');
    picker.className = 'cannon-picker';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', '选择强化炮节');
    let target = option.targets.find(item => item.id === option.defaultTargetId) ?? option.targets[0];
    const action = button('合并强化', 'option', () => commit('merge', target.id), '提升选中炮节的伤害');
    const title = action.querySelector('strong');
    const detail = action.querySelector('span');
    const chips = [];
    const display = () => {
      title.textContent = (gunGlyphs[target.type] || '◇') + '  合并强化  ' + target.label;
      detail.textContent = '等级 ' + target.level + ' → ' + target.nextLevel + ' · 齐射 ' + target.volley + ' → ' + target.nextVolley;
      action.style.setProperty('--choice-color', gunColors[target.type] || '#f5c878');
      for (const chip of chips) chip.element.setAttribute('aria-pressed', String(chip.id === target.id));
    };
    if (option.targets.length > 1) {
      for (const entry of option.targets) {
        const chip = button(entry.label + ' · Lv.' + entry.level, 'cannon-chip', () => { target = entry; display(); });
        chip.style.setProperty('--choice-color', gunColors[entry.type]);
        picker.appendChild(chip);
        chips.push({ id: entry.id, element: chip });
      }
      block.appendChild(picker);
    }
    block.appendChild(action);
    display();
    ui.body.appendChild(block);
  }
}

function showResult() {
  const won = run.phase === 'won';
  if (!result) {
    save = loadSave(save);
    result = recordBattle(save, run);
    persist();
    updateRecord();
    sounds.play(won ? 'win' : 'loss');
  }
  const label = run.mode === 'quick' ? '快速试打' : '完整战斗';
  const newRecord = result.bestTime ? ' · 最快纪录' : result.bestCrossfires ? ' · 夹击纪录' : '';
  showPanel(label + newRecord, won ? '守卫已击破' : '车队撤退',
    won ? '装甲小队打穿了荒野战线。' : (run.reason || run.resultReason || '整备火力，再出击一次。'));
  const grid = document.createElement('div');
  grid.className = 'result-grid';
  const stats = [
    ['战斗时间', elapsed(run.time)],
    ['击毁敌人', run.stats.kills],
    ['交叉爆破', run.stats.crossfires],
    ['单次齐射击毁', run.stats.bestVolleyKills ?? 0],
    ['救回炮车', run.stats.recovered],
    ['双核击破', run.stats.dualBreaks ?? 0],
  ];
  for (const [label, value] of stats) {
    const cell = document.createElement('div');
    cell.className = 'result-stat';
    const small = document.createElement('small');
    const strong = document.createElement('strong');
    small.textContent = label;
    strong.textContent = value;
    cell.append(small, strong);
    grid.appendChild(cell);
  }
  ui.body.appendChild(grid);
  const [key, damage] = Object.entries(run.stats.damageByType || {}).sort((a, b) => b[1] - a[1])[0] || [];
  if (damage > 0 || result.medals.length) {
    const note = document.createElement('p');
    note.className = 'result-note';
    const parts = [];
    if (damage > 0) parts.push('主力 ' + (GUNS[key]?.name || damageLabels[key]));
    for (const medal of result.medals) parts.push('◆ ' + medal.name);
    note.textContent = parts.join(' · ');
    ui.body.appendChild(note);
  }
  const mode = run.mode;
  ui.actions.append(
    button('再出击一次', 'primary', () => start(mode)),
    button('返回首页', 'secondary', menu),
  );
}

function paint(force = false) {
  const now = performance.now();
  const changed = run.phase !== previousPhase;
  const newSupply = run.phase === 'supply' && run.supply !== currentSupply;
  if (changed || newSupply || force) {
    if (changed) {
      clearInput();
      if (run.phase === 'supply') sounds.play('supply');
      previousPhase = run.phase;
    }
    currentSupply = run.supply;
    ui.frame.classList.toggle('playing', run.phase === 'playing');
    ui.menu.hidden = run.phase !== 'menu';
    ui.hud.hidden = run.phase === 'menu';
    ui.controls.hidden = run.phase !== 'playing';
    ui.modal.hidden = true;
    if (run.phase === 'supply') showSupply();
    else if (run.phase === 'won' || run.phase === 'lost') showResult();
    else if (run.phase === 'paused' && page === 'quit') showQuit();
    else if (run.phase === 'paused') showPause();
    else if (run.phase === 'menu' && page === 'help') showHelp();
    else if (run.phase === 'menu' && page === 'archive') showArchive();
  }
  if (!force && !changed && now - lastPaint < 55) return;
  lastPaint = now;
  if (run.phase === 'menu') { ui.notice.hidden = true; return; }
  const { train, stats, volley } = run;
  const hp = clamp(train.hp, 0, train.maxHp);
  const durability = train.cars.reduce((sum, car) => sum + car.hp, 0);
  const boss = run.director?.boss;
  const bossState = boss?.state || '';
  const ready = volley.charge >= .999;
  const tailAim = run.enemies.some(enemy => enemy.hp > 0 && enemy.state === 'tail-aim');
  if (run.phase === 'playing') {
    if (bossState === 'windup' && lastBossState !== bossState) sounds.play('warning');
    else if (bossState === 'exposed' && lastBossState !== bossState) sounds.play('core');
    else if (tailAim && !lastTailAim) sounds.play('tail');
    else if (stats.recovered > lastRecovered) sounds.play('recover');
    else if (hp < lastHP || durability < lastDurability) sounds.play('damage');
    else if (ready && !lastReady) sounds.play('ready');
  }
  lastHP = hp;
  lastDurability = durability;
  lastRecovered = stats.recovered;
  lastReady = ready;
  lastTailAim = tailAim;
  lastBossState = bossState;
  ui.clock.textContent = elapsed(run.time);
  const untilSupply = (run.director?.nextSupplyAt ?? Infinity) - run.time;
  ui.wave.textContent = boss?.hp > 0 ? '首领交战'
    : untilSupply > 0 && untilSupply <= 4 ? '补给 ' + Math.ceil(untilSupply) + ' 秒'
    : '第 ' + String(run.stage || 1).padStart(2, '0') + ' 段';
  ui.health.textContent = Math.ceil(hp) + ' / ' + train.maxHp;
  ui.healthFill.style.width = (hp / train.maxHp * 100) + '%';
  ui.healthFill.parentElement.classList.toggle('critical', hp <= train.maxHp * .3);
  ui.carCount.textContent = train.cars.length + ' / 4';
  carStatus.forEach(({ slot, pips }, index) => {
    const car = train.cars[index];
    slot.classList.toggle('empty', !car);
    slot.classList.toggle('tail', !!car && index === train.cars.length - 1);
    slot.classList.toggle('danger', tailAim && !!car && index === train.cars.length - 1);
    slot.style.setProperty('--car-color', gunColors[car?.type] || '#d0bd87');
    slot.title = car ? ((GUNS[car.type]?.name ?? '炮车') + ' Lv.' + car.level + ' · 耐久 ' + car.hp + '/' + car.maxHp) : '空炮位';
    pips.forEach((pip, j) => pip.classList.toggle('on', !!car && j < car.hp));
  });
  ui.bossHud.hidden = !boss || boss.hp <= 0;
  if (!ui.bossHud.hidden) {
    ui.bossFill.style.width = (clamp(boss.hp / boss.maxHp, 0, 1) * 100) + '%';
    ui.bossState.textContent = bossLabels[boss.state] || '交战';
  }
  ui.volley.classList.toggle('ready', ready);
  ui.volley.classList.toggle('crossfire', ready && !!volley.mark);
  ui.volley.style.setProperty('--charge', (clamp(volley.charge, 0, 1) * 360) + 'deg');
  ui.caption.textContent = ready ? (volley.mark ? '夹击就绪' : '已装填') : Math.floor(volley.charge * 100) + '%';
  const urgent = bossState === 'windup' || tailAim;
  ui.hint.dataset.tone = urgent ? 'danger' : ready && volley.mark ? 'combo' : '';
  ui.hint.textContent = bossState === 'windup' ? '守卫锁定冲锋 · 带着尾车离开红线'
    : tailAim ? '尾车被锁定 · 转弯让尾车离开预警'
    : ready && volley.mark ? '双环亮起 · 点齐射打出夹击'
    : run.hint || '沿怪群外侧开弯，找交叉火力';
  const notice = run.noticeId ?? run.message;
  if (run.message && notice !== lastNotice) {
    lastNotice = notice;
    noticeUntil = now + 1800;
  }
  ui.notice.hidden = run.phase !== 'playing' || now >= noticeUntil || !run.message;
  if (!ui.notice.hidden) ui.notice.textContent = run.message;
}

get('start').addEventListener('click', () => start('full'));
get('quick').addEventListener('click', () => start('quick'));
get('help').addEventListener('click', () => { page = 'help'; paint(true); });
get('archive').addEventListener('click', () => { page = 'archive'; paint(true); });
get('pause').addEventListener('click', pause);
ui.volley.addEventListener('click', fire);

ui.frame.addEventListener('pointerdown', event => {
  if (event.button !== 0 || drag || run.phase !== 'playing' || event.target.closest('button')) return;
  const bounds = ui.frame.getBoundingClientRect();
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, radius: Math.max(33, bounds.width * .123) };
  ui.frame.setPointerCapture(event.pointerId);
  ui.stick.classList.add('active');
  ui.stick.style.left = (event.clientX - bounds.left) + 'px';
  ui.stick.style.top = (event.clientY - bounds.top) + 'px';
  ui.stick.style.bottom = 'auto';
  ui.stick.style.transform = 'translate(-50%, -50%)';
  setMove(0, 0);
  event.preventDefault();
});
ui.frame.addEventListener('pointermove', event => {
  if (drag?.id !== event.pointerId) return;
  const x = (event.clientX - drag.x) / drag.radius;
  const y = (event.clientY - drag.y) / drag.radius;
  if (Math.hypot(x, y) < .13) setMove(0, 0);
  else setMove(x, y);
});
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  ui.frame.addEventListener(eventName, event => {
    if (drag?.id === event.pointerId) endDrag();
  });
}
window.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (directions[event.code] && run.phase === 'playing') {
    event.preventDefault();
    keys.add(event.code);
    readKeys();
  }
  if (event.repeat) return;
  if (event.code === 'Space' && run.phase === 'playing') {
    event.preventDefault();
    fire();
  }
  if (event.code === 'Escape') {
    if (page) { page = null; paint(true); }
    else pause();
  }
});
window.addEventListener('keyup', event => {
  if (keys.delete(event.code)) readKeys();
});
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && run.phase === 'playing') pause();
});

updateRecord();
paint(true);
const forceCanvas = new URLSearchParams(location.search).has('canvas');
const game = new Phaser.Game({
  type: forceCanvas ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#182222',
  antialias: true,
  antialiasGL: true,
  powerPreference: 'high-performance',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { keyboard: false, mouse: false, touch: false },
  audio: { noAudio: true },
  scene: [createBattleScene(run, controls, () => paint())],
});
if (import.meta.env.DEV) window.__tow = { game, run, controls };
