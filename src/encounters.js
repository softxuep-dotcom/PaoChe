// Local, deterministic wave and boss rules. Coordinates are in arena space.
const BOUNDS = { left: 30, right: 450, top: 132, bottom: 658 };
const SUPPLIES = {
  quick: [[23, 'front'], [48, 'rear']],
  full: [[28, 'front'], [80, 'rear'], [145, 'side'], [228, 'front']],
};
const SPAWNS = [
  ['slime', 'slime', 'slime', 'slime'],
  ['slime', 'slime', 'runner', 'slime'],
  ['runner', 'slime', 'tank', 'slime', 'slime'],
  ['runner', 'gunner', 'slime', 'slime', 'tank'],
  ['tank', 'runner', 'slime', 'gunner', 'runner', 'slime'],
];
const COLORS = { danger: 0xff547a, flame: 0xff9462, amber: 0xffce6c, ice: 0x8af6dd };

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }
function clampX(x, r = 0) { return clamp(x, BOUNDS.left + r, BOUNDS.right - r); }
function clampY(y, r = 0) { return clamp(y, BOUNDS.top + r, BOUNDS.bottom - r); }
function dist2(x1, y1, x2, y2) { return (x1 - x2) ** 2 + (y1 - y2) ** 2; }

function segmentDist2(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((x - x0) * dx + (y - y0) * dy) / len2, 0, 1) : 0;
  return dist2(x, y, x0 + dx * t, y0 + dy * t);
}

export function createDirector() {
  return {
    seeded: false,
    supplyIndex: 0,
    nextWaveAt: 7,
    nextStrikeAt: null,
    nextTailAt: 0,
    tailIntroduced: false,
    wave: 0,
    boss: null,
    weakpoints: [],
    weakBroken: 0,
    dualUntil: 0,
    charge: null,
    pool: Array.from({ length: 28 }, () => ({
      active: false, kind: '', x: 0, y: 0, x0: 0, y0: 0, x1: 0, y1: 0,
      r: 0, ttl: 0, life: 0, vx: 0, vy: 0, damage: 0, dashed: false, owner: null, ownerId: 0,
    })),
  };
}

function hazard(run, kind, life, data) {
  const h = run.director.pool.find(slot => !slot.active);
  if (!h) return null;
  h.active = true;
  h.kind = kind;
  h.ttl = h.life = life;
  h.x = h.y = h.x0 = h.y0 = h.x1 = h.y1 = h.vx = h.vy = h.damage = 0;
  h.r = 0;
  h.dashed = false;
  h.owner = null;
  h.ownerId = 0;
  Object.assign(h, data);
  run.hazards.push(h);
  return h;
}

function retire(run, index) {
  const h = run.hazards[index];
  h.active = false;
  h.owner = null;
  run.hazards.splice(index, 1);
}

function spawnTeachingPack(run) {
  run.director.seeded = true;
  run.hint = '沿浅青弧线拐弯 · 双环亮起就按齐射';
  for (const [dx, dy] of [[0, 0], [-22, -11], [24, -9], [-12, -31], [12, 21], [-22, 23], [26, 20]]) {
    run.spawnEnemy('slime', 240 + dx, 390 + dy, {
      hp: 31, introUntil: 4.8, direction: 1, attackCd: 0,
    });
  }
}

function edgeSpawn(run, kind, edge, elite = false, tailHunter = false) {
  const rand = () => run.random();
  let x = 0, y = 0;
  const tail = tailHunter && run.mode === 'full' ? run.train.cars.at(-1) : null;
  for (let i = 0; i < 6; i++) {
    const side = (edge + (i > 1 ? i - 1 : 0)) % 4;
    if (side === 0 || side === 2) {
      x = 52 + rand() * 376;
      y = side === 0 ? BOUNDS.top + 24 : BOUNDS.bottom - 22;
    } else {
      x = side === 1 ? BOUNDS.right - 22 : BOUNDS.left + 22;
      y = 168 + rand() * 452;
    }
    if (dist2(x, y, run.train.x, run.train.y) >= 117 ** 2 &&
        (!tail || dist2(x, y, tail.x, tail.y) >= 102 ** 2)) break;
  }
  if (tail && dist2(x, y, tail.x, tail.y) < 94 ** 2) return null;
  const stage = run.stage;
  const hp = kind === 'tank' ? 72 + stage * 8
    : kind === 'gunner' ? 35 + stage * 4
      : kind === 'runner' ? 25 + stage * 3 : 25 + stage * 2;
  const enemy = run.spawnEnemy(kind, x, y, {
    hp: elite ? Math.round(hp * 1.6) : hp,
    elite, attackCd: 0.6 + rand() * 1.1, introUntil: 0, spawnGrace: 0.38,
    tailHunter,
  });
  if (enemy) run.effect(x, y, 'spawn', COLORS.danger, enemy.r + 10, 0.44);
  return enemy;
}

function schedule(run) {
  const d = run.director;
  const quick = run.mode === 'quick';
  const bossAt = quick ? 65 : 240;
  const supply = SUPPLIES[quick ? 'quick' : 'full'][d.supplyIndex];
  if (supply && run.time >= supply[0]) {
    d.supplyIndex++;
    run.stage = d.supplyIndex + 1;
    run.openSupply(supply[1]);
    if (run.phase !== 'playing') return;
  }
  if (!d.boss && run.time >= bossAt) {
    spawnBoss(run, quick);
    return;
  }
  if (run.time >= d.nextWaveAt) {
    d.wave++;
    d.nextWaveAt = run.time + (d.boss ? 9 : quick ? 5.9 : 7.5 - Math.min(1.8, run.stage * 0.34));
    let count = 0;
    for (const enemy of run.enemies) if (enemy.hp > 0 && enemy.kind !== 'weakpoint') count++;
    const cap = d.boss ? (quick ? 11 : 9)
      : quick ? Math.min(33, 14 + run.stage * 4) : Math.min(25, 15 + run.stage * 2);
    if (count < cap) {
      // Early pressure moves from the front to the flank, then introduces
      // tail hunters and aimed fire in separate waves.
      const pattern = d.boss ? ['slime', 'runner', 'slime'] : SPAWNS[Math.min(4, run.stage - 1)];
      let tailAllowed = !quick && run.train.cars.length > 0 && d.nextTailAt <= run.time &&
        (!d.boss || d.wave % 2 === 0) &&
        !run.enemies.some(e => e.hp > 0 && e.tailHunter);
      let sentRunner = false;
      for (let i = 0; i < Math.min(pattern.length, cap - count); i++) {
        let kind = !d.boss && d.wave === 3 && i === 0 ? 'runner'
          : !d.boss && quick && d.wave === 7 && i === 0 ? 'gunner' : pattern[i];
        if (!quick && sentRunner && kind === 'runner') kind = 'slime';
        const isRunner = kind === 'runner';
        const hunter = isRunner && (quick || tailAllowed);
        const spawned = edgeSpawn(run, kind, (d.wave + (i > 1 ? 1 : 0)) % 4,
          kind === 'tank' && d.wave % 5 === 0, hunter);
        if (spawned && isRunner) sentRunner = true;
        if (spawned && hunter && !quick) {
          tailAllowed = false;
          d.nextTailAt = run.time + 18;
          if (!d.tailIntroduced) {
            d.tailIntroduced = true;
            run.hint = '截尾兵会锁定尾车 · 看到短预警就转弯离开';
          }
        }
      }
    }
  }
  const strikeAt = d.nextStrikeAt ?? (quick ? 54 : 114);
  if (!d.boss && run.time >= strikeAt) {
    d.nextStrikeAt = run.time + (quick ? 80 : 15);
    hazard(run, 'strike', 1.22, {
      x: run.train.x, y: run.train.y, r: 43, damage: quick ? 12 : 16,
    });
    run.hint = '危险圈会延迟落地，带着尾车一起离开';
  }
}

function touchingCar(run, x0, y0, x1, y1, width) {
  for (let i = run.train.cars.length - 1; i >= 0; i--) {
    const car = run.train.cars[i];
    if (segmentDist2(car.x, car.y, x0, y0, x1, y1) < (width + 11) ** 2) return car;
  }
  return null;
}

function updateHazards(run, dt) {
  for (let i = run.hazards.length - 1; i >= 0; i--) {
    const h = run.hazards[i];
    h.ttl -= dt;
    if (h.owner && (h.owner.id !== h.ownerId || h.owner.hp <= 0 || h.owner.stunT > 0)) h.ttl = 0;
    if (h.kind === 'hostile-shot') {
      h.x0 = h.x;
      h.y0 = h.y;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      if (segmentDist2(run.train.x, run.train.y, h.x0, h.y0, h.x, h.y) < (h.r + 13) ** 2) {
        run.hitTrain(h.damage);
        h.ttl = 0;
      }
      if (h.x < BOUNDS.left - 12 || h.x > BOUNDS.right + 12 ||
          h.y < BOUNDS.top - 12 || h.y > BOUNDS.bottom + 12) h.ttl = 0;
    } else if (h.kind === 'strike' && h.ttl <= 0) {
      if (dist2(run.train.x, run.train.y, h.x, h.y) < (h.r + 8) ** 2) run.hitTrain(h.damage);
      else {
        const car = touchingCar(run, h.x, h.y, h.x, h.y, h.r);
        if (car) run.hitTrain(1, car);
      }
      run.effect(h.x, h.y, 'impact', COLORS.flame, h.r, 0.42);
    }
    if (h.ttl <= 0) retire(run, i);
    if (run.phase !== 'playing') return;
  }
}

function spawnBoss(run, quick) {
  const x = run.train.x < 240 ? 337 : 143;
  const y = run.train.y > 382 ? 216 : 574;
  const boss = run.spawnEnemy('boss', x, y, {
    hp: quick ? 295 : 575,
    r: 30, state: 'stalk', stateT: 2.25, damageScale: 0.22,
    heading: Math.atan2(run.train.y - y, run.train.x - x), elite: true,
  });
  if (!boss) return;
  run.director.boss = boss;
  run.director.nextWaveAt = run.time + 7;
  run.stage = 6;
  run.hint = '赤风守卫 · 躲过冲锋，再打两侧发光的护甲核心';
  run.message = '赤风守卫登场';
  run.effect(x, y, 'spawn', COLORS.danger, 66, 0.75);
}

function removeWeakpoints(d) {
  for (const point of d.weakpoints) if (point.hp > 0) point.hp = 0;
  d.weakpoints.length = 0;
}

function prepareCharge(run, boss) {
  const angle = Math.atan2(run.train.y - boss.y, run.train.x - boss.x);
  const reach = Math.max(116, Math.hypot(run.train.x - boss.x, run.train.y - boss.y) + 65);
  const dx = Math.cos(angle), dy = Math.sin(angle);
  // Clip the endpoint along the same ray. Clamping x and y independently
  // would make the final path disagree with the boss's facing.
  const xBound = dx >= 0 ? BOUNDS.right - 31 : BOUNDS.left + 31;
  const yBound = dy >= 0 ? BOUNDS.bottom - 31 : BOUNDS.top + 31;
  const stopX = Math.abs(dx) > 0.0001 ? (xBound - boss.x) / dx : Infinity;
  const stopY = Math.abs(dy) > 0.0001 ? (yBound - boss.y) / dy : Infinity;
  const length = Math.max(0, Math.min(reach, stopX, stopY));
  boss.heading = angle;
  boss.state = 'windup';
  boss.stateT = 1.1;
  run.director.charge = {
    x0: boss.x, y0: boss.y,
    x1: boss.x + dx * length, y1: boss.y + dy * length,
    duration: clamp(length / 680, 0.16, 0.56), elapsed: 0, hit: false,
  };
  const c = run.director.charge;
  hazard(run, 'charge', 1.1, { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, r: 23 });
}

function recoverBoss(run, boss) {
  const d = run.director;
  boss.state = 'recover';
  boss.stateT = 2.85;
  d.weakBroken = 0;
  d.dualUntil = 0;
  const nx = -Math.sin(boss.heading), ny = Math.cos(boss.heading);
  for (const side of [-1, 1]) {
    const x = clampX(boss.x + nx * 44 * side, 11);
    const y = clampY(boss.y + ny * 44 * side, 11);
    const point = run.spawnEnemy('weakpoint', x, y, {
      hp: run.mode === 'quick' ? 21 : 31, r: 11, heading: boss.heading,
      bossId: boss.id, side,
    });
    if (point) d.weakpoints.push(point);
  }
  run.hint = '发光核心可被击破 · 双破会延长输出窗口';
  run.effect(boss.x, boss.y, 'impact', COLORS.amber, 43, 0.32);
}

function updateBoss(run, dt) {
  const d = run.director, boss = d.boss;
  if (!boss) return;
  if (boss.hp <= 0) {
    removeWeakpoints(d);
    run.finish(true, '赤风守卫已击破');
    return;
  }
  boss.stateT -= dt;
  if (boss.state === 'stalk') {
    const dx = run.train.x - boss.x, dy = run.train.y - boss.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.01) {
      boss.heading = Math.atan2(dy, dx);
      // Step away from point-blank range before telegraphing a meaningful lane.
      const step = (dist > 158 ? 37 : dist < 97 ? -29 : 0) * dt / dist;
      boss.x = clampX(boss.x + dx * step, 31);
      boss.y = clampY(boss.y + dy * step, 31);
    }
    if (boss.stateT <= 0) prepareCharge(run, boss);
  } else if (boss.state === 'windup') {
    if (boss.stateT > 0) return;
    const c = d.charge;
    boss.state = 'charge';
    hazard(run, 'charge', c.duration, {
      x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, r: 23, dashed: true,
    });
  } else if (boss.state === 'charge') {
    const c = d.charge;
    const x0 = boss.x, y0 = boss.y;
    c.elapsed = Math.min(c.duration, c.elapsed + dt);
    const u = c.elapsed / c.duration;
    boss.x = c.x0 + (c.x1 - c.x0) * u;
    boss.y = c.y0 + (c.y1 - c.y0) * u;
    if (!c.hit) {
      if (segmentDist2(run.train.x, run.train.y, x0, y0, boss.x, boss.y) < 35 ** 2) {
        c.hit = Boolean(run.hitTrain(run.mode === 'quick' ? 16 : 22));
      } else {
        const car = touchingCar(run, x0, y0, boss.x, boss.y, 23);
        if (car) c.hit = Boolean(run.hitTrain(1, car));
      }
    }
    if (u >= 1 && run.phase === 'playing') recoverBoss(run, boss);
  } else if (boss.state === 'recover' || boss.state === 'exposed') {
    const broken = d.weakpoints.reduce((n, p) => n + Number(p.hp <= 0), 0);
    if (broken > d.weakBroken) {
      const first = d.weakBroken === 0;
      d.weakBroken = broken;
      if (first) {
        boss.state = 'exposed';
        boss.stateT = 2.6;
        boss.damageScale = 1;
        d.dualUntil = run.time + 0.26;
        run.message = '核心暴露 · 集中输出';
        run.effect(boss.x, boss.y, 'coreBreak', COLORS.ice, 47, 0.42);
      }
      if (broken >= 2 && run.time <= d.dualUntil) {
        boss.stateT += 1.15;
        run.message = '双核击破 · 输出窗口延长';
        run.effect(boss.x, boss.y, 'dualBreak', COLORS.amber, 61, 0.55);
      }
    }
    if (boss.state === 'exposed' && run.time > d.dualUntil) removeWeakpoints(d);
    if (boss.stateT <= 0) {
      removeWeakpoints(d);
      boss.state = 'stalk';
      boss.stateT = 1.45;
      boss.damageScale = 0.22;
    }
  }
}

function updateGunner(run, enemy, dt, dist) {
  enemy.attackCd ??= 0.8;
  if (enemy.state === 'aim') {
    enemy.attackCd -= dt;
    if (enemy.attackCd <= 0) {
      const dx = Math.cos(enemy.heading), dy = Math.sin(enemy.heading);
      hazard(run, 'hostile-shot', 2.7, {
        x: enemy.x + dx * 13, y: enemy.y + dy * 13,
        x0: enemy.x, y0: enemy.y, vx: dx * 168, vy: dy * 168,
        damage: 6, r: 5,
      });
      enemy.state = 'walk';
      enemy.attackCd = 2.4 + run.random() * 0.9;
    }
    return true;
  }
  enemy.attackCd -= dt;
  if (enemy.attackCd <= 0 && dist < 276) {
    enemy.state = 'aim';
    enemy.attackCd = 0.68;
    hazard(run, 'aim', 0.68, {
      x0: enemy.x, y0: enemy.y, x1: run.train.x, y1: run.train.y,
      r: 2, owner: enemy, ownerId: enemy.id,
    });
    return true;
  }
  return false;
}

function updateTailHunter(run, enemy, tail, dist) {
  if (enemy.state === 'tail-aim') {
    if (run.time < enemy.biteAt) return true;
    enemy.state = 'walk';
    enemy.nextBiteAt = run.time + 2.55;
    enemy.x = clampX(enemy.biteX, enemy.r);
    enemy.y = clampY(enemy.biteY, enemy.r);
    if (tail?.id === enemy.biteId && dist2(tail.x, tail.y, enemy.biteX, enemy.biteY) <= 31 ** 2) {
      run.hitTrain(1, tail);
    }
    run.effect(enemy.x, enemy.y, 'impact', COLORS.danger, 23, 0.29);
    return true;
  }
  if (!tail || dist > 48 || enemy.spawnGrace > 0 || (enemy.nextBiteAt ?? 0) > run.time) return false;
  enemy.state = 'tail-aim';
  enemy.biteX = tail.x;
  enemy.biteY = tail.y;
  enemy.biteId = tail.id;
  enemy.biteAt = run.time + 0.64;
  const warning = hazard(run, 'aim', 0.64, {
    x0: enemy.x, y0: enemy.y, x1: tail.x, y1: tail.y,
    r: 5, owner: enemy, ownerId: enemy.id,
  });
  if (!warning) {
    enemy.state = 'walk';
    enemy.nextBiteAt = run.time + 0.4;
    return false;
  }
  return true;
}

function updateEnemies(run, dt) {
  const t = run.train;
  for (const enemy of run.enemies) {
    if (enemy.hp <= 0 || enemy.kind === 'boss' || enemy.kind === 'weakpoint') continue;
    if (enemy.introUntil > run.time) continue;
    if (enemy.stunT > 0) {
      if (enemy.state === 'tail-aim') {
        enemy.state = 'walk';
        enemy.nextBiteAt = run.time + 1.1;
      }
      continue;
    }
    const tail = enemy.tailHunter ? t.cars.at(-1) : null;
    const target = tail ?? t;
    const dx = target.x - enemy.x, dy = target.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    enemy.spawnGrace = Math.max(0, (enemy.spawnGrace || 0) - dt);
    if (enemy.state !== 'aim' && enemy.state !== 'tail-aim' && dist > 0.1) enemy.heading = Math.atan2(dy, dx);
    const aimedBite = run.mode === 'full' && enemy.tailHunter && (tail || enemy.state === 'tail-aim');
    if (aimedBite && updateTailHunter(run, enemy, tail, dist)) continue;
    if (enemy.kind === 'gunner' && updateGunner(run, enemy, dt, dist)) continue;
    const baseSpeed = enemy.kind === 'runner' ? 91 : enemy.kind === 'tank' ? 34 :
      enemy.kind === 'gunner' ? (dist < 102 ? -42 : dist < 183 ? 0 : 43) : 44 + run.stage * 1.4;
    const speed = baseSpeed * (enemy.elite ? 1.05 : 1) * (enemy.spawnGrace > 0 ? 0.44 : 1);
    let pushX = 0, pushY = 0;
    for (const other of run.enemies) {
      if (other === enemy || other.hp <= 0 || other.kind === 'weakpoint') continue;
      const ox = enemy.x - other.x, oy = enemy.y - other.y, threshold = enemy.r + other.r + 3;
      const d2 = ox * ox + oy * oy;
      if (d2 > 0.001 && d2 < threshold * threshold) {
        const d = Math.sqrt(d2), factor = (threshold - d) * 2.35 / d;
        pushX += ox * factor;
        pushY += oy * factor;
      }
    }
    const move = dist > 0.01 ? speed / dist : 0;
    enemy.x = clampX(enemy.x + (dx * move + clamp(pushX, -32, 32)) * dt, enemy.r);
    enemy.y = clampY(enemy.y + (dy * move + clamp(pushY, -32, 32)) * dt, enemy.r);
    if (!aimedBite && enemy.spawnGrace <= 0 && dist2(enemy.x, enemy.y, target.x, target.y) < (enemy.r + 11) ** 2) {
      run.hitTrain(tail ? 1 : enemy.kind === 'tank' ? 9 : 5, tail);
      if (run.phase !== 'playing') return;
    }
  }
}

export function updateEncounter(run, dt) {
  if (run.phase !== 'playing') return;
  const d = run.director;
  if (!d.seeded) spawnTeachingPack(run);
  if (run.hint.startsWith('沿浅青弧线') && (run.stats.crossfires > 0 || run.time > 19)) {
    run.guide.length = 0;
    run.hint = '拐弯布炮 · 留住齐射，等到两道火线交汇';
  }
  schedule(run);
  if (run.phase !== 'playing') return;
  updateHazards(run, dt);
  if (run.phase !== 'playing') return;
  updateBoss(run, dt);
  if (run.phase !== 'playing') return;
  updateEnemies(run, dt);
}
