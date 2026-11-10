import Phaser from 'phaser';
import { WIDTH, HEIGHT, GUNS, Run } from './model.js';
import { createBattleScene } from './BattleScene.js';
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
const bossLabels = { stalk: '护甲闭合', windup: '冲锋预警', charge: '冲锋', recover: '弱点亮起', exposed: '核心暴露' };
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const elapsed = seconds => {
  const s = Math.max(0, Math.floor(seconds || 0));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};

function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {};
    return {
      wins: Number.isFinite(data.wins) ? Math.max(0, data.wins) : 0,
      bestFull: Number.isFinite(data.bestFull) && data.bestFull > 0 ? data.bestFull : null,
      bestQuick: Number.isFinite(data.bestQuick) && data.bestQuick > 0 ? data.bestQuick : null,
      maxCrossfires: Number.isFinite(data.maxCrossfires) ? Math.max(0, data.maxCrossfires) : 0,
      muted: data.muted === true,
    };
  } catch {
    return { wins: 0, bestFull: null, bestQuick: null, maxCrossfires: 0, muted: false };
  }
}

const save = loadSave();
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
let settled = false;
let lastPaint = -Infinity;
let lastHP = 0;
let lastRecovered = 0;
let lastNotice = '';
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
  const best = save.bestFull ?? save.bestQuick;
  ui.record.textContent = best
    ? (save.bestFull ? '完整战斗' : '快速试打') + ' · 最快 ' + elapsed(best) + ' · 单局最多夹击 ' + save.maxCrossfires
    : '荒野战线 · 首次出击';
}

function start(mode) {
  sounds.unlock();
  sounds.play('click');
  clearInput();
  page = null;
  settled = false;
  lastNotice = '';
  noticeUntil = 0;
  run.start(mode);
  lastHP = run.train.hp;
  lastRecovered = 0;
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

function showSupply() {
  const supply = run.supply;
  if (!supply) return;
  showPanel('荒野补给', supply.title || '整备车队',
    supply.description || '接炮增加一个射界，合并加强当前火力。');
  supply.options.forEach((option, index) => {
    ui.body.appendChild(button(option.label, 'option', () => {
      if (run.phase !== 'supply' || run.supply !== supply) return;
      sounds.unlock();
      run.choose(option.id);
      sounds.play('click');
      paint(true);
    }, option.description || (String(index + 1) + '号方案')));
  });
}

function showResult() {
  const won = run.phase === 'won';
  if (!settled) {
    settled = true;
    if (won) {
      save.wins++;
      const key = run.mode === 'quick' ? 'bestQuick' : 'bestFull';
      save[key] = save[key] ? Math.min(save[key], run.time) : run.time;
    }
    save.maxCrossfires = Math.max(save.maxCrossfires, run.stats.crossfires);
    persist();
    updateRecord();
    sounds.play(won ? 'win' : 'loss');
  }
  showPanel(won ? '作战胜利' : '作战结束', won ? '守卫已击破' : '车队撤退',
    won ? '装甲小队打穿了荒野战线。' : (run.reason || run.resultReason || '整备火力，再出击一次。'));
  const grid = document.createElement('div');
  grid.className = 'result-grid';
  const stats = [
    ['战斗时间', elapsed(run.time)],
    ['击毁敌人', run.stats.kills],
    ['交叉爆破', run.stats.crossfires],
    ['救回炮车', run.stats.recovered],
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
    ui.menu.hidden = run.phase !== 'menu';
    ui.hud.hidden = run.phase === 'menu';
    ui.controls.hidden = run.phase !== 'playing';
    ui.modal.hidden = true;
    if (run.phase === 'supply') showSupply();
    else if (run.phase === 'won' || run.phase === 'lost') showResult();
    else if (run.phase === 'paused' && page === 'quit') showQuit();
    else if (run.phase === 'paused') showPause();
    else if (run.phase === 'menu' && page === 'help') showHelp();
  }
  if (!force && !changed && now - lastPaint < 55) return;
  lastPaint = now;
  if (run.phase === 'menu') { ui.notice.hidden = true; return; }
  const { train, stats, volley } = run;
  const hp = clamp(train.hp, 0, train.maxHp);
  if (hp < lastHP && run.phase === 'playing') sounds.play('damage');
  if (stats.recovered > lastRecovered) sounds.play('recover');
  lastHP = hp;
  lastRecovered = stats.recovered;
  ui.clock.textContent = elapsed(run.time);
  ui.wave.textContent = run.director?.boss?.hp > 0 ? '首领交战' : '第 ' + String(run.stage || 1).padStart(2, '0') + ' 段';
  ui.health.textContent = Math.ceil(hp) + ' / ' + train.maxHp;
  ui.healthFill.style.width = (hp / train.maxHp * 100) + '%';
  ui.healthFill.parentElement.classList.toggle('critical', hp <= train.maxHp * .3);
  ui.carCount.textContent = train.cars.length + ' / 4';
  carStatus.forEach(({ slot, pips }, index) => {
    const car = train.cars[index];
    slot.classList.toggle('empty', !car);
    slot.classList.toggle('tail', !!car && index === train.cars.length - 1);
    slot.style.setProperty('--car-color', gunColors[car?.type] || '#d0bd87');
    slot.title = car ? ((GUNS[car.type]?.name ?? '炮车') + ' · 耐久 ' + car.hp + '/' + car.maxHp) : '空炮位';
    pips.forEach((pip, j) => pip.classList.toggle('on', !!car && j < car.hp));
  });
  const boss = run.director?.boss;
  ui.bossHud.hidden = !boss || boss.hp <= 0;
  if (!ui.bossHud.hidden) {
    ui.bossFill.style.width = (clamp(boss.hp / boss.maxHp, 0, 1) * 100) + '%';
    ui.bossState.textContent = bossLabels[boss.state] || '交战';
  }
  const ready = volley.charge >= .999;
  ui.volley.classList.toggle('ready', ready);
  ui.volley.style.setProperty('--charge', (clamp(volley.charge, 0, 1) * 360) + 'deg');
  ui.caption.textContent = ready ? (volley.mark ? '夹击就绪' : '就绪 · 空格') : Math.floor(volley.charge * 100) + '%';
  ui.hint.textContent = run.hint || (ready && volley.mark ? '双环已锁定，点击齐射' : '沿怪群外侧开弯，找交叉火力');
  if (run.message && run.message !== lastNotice) {
    lastNotice = run.message;
    noticeUntil = now + 1800;
  }
  if (!run.message) lastNotice = '';
  ui.notice.hidden = run.phase !== 'playing' || now >= noticeUntil || !lastNotice;
  if (!ui.notice.hidden) ui.notice.textContent = lastNotice;
}

get('start').addEventListener('click', () => start('full'));
get('quick').addEventListener('click', () => start('quick'));
get('help').addEventListener('click', () => { page = 'help'; paint(true); });
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
