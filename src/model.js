import { createDirector, updateEncounter } from './encounters.js';

export const WIDTH = 480;
export const HEIGHT = 800;
export const ARENA = Object.freeze({ left: 30, right: 450, top: 132, bottom: 658 });

export const GUNS = Object.freeze({
  side: Object.freeze({ name: '弧光侧炮', color: 0x72f4e0, range: 172, half: 0.48, angles: [-Math.PI / 2, Math.PI / 2], damage: 10, volley: 34, period: 0.94 }),
  front: Object.freeze({ name: '穿岩前炮', color: 0xffc064, range: 209, half: 0.48, angles: [0], damage: 18, volley: 55, period: 1.20 }),
  rear: Object.freeze({ name: '霜火尾炮', color: 0xadadff, range: 179, half: 0.61, angles: [Math.PI], damage: 13, volley: 40, period: 0.87 }),
});

const ENEMY = Object.freeze({
  slime: { hp: 26, r: 13, speed: 31, damage: 9 },
  runner: { hp: 38, r: 12, speed: 70, damage: 11 },
  tank: { hp: 115, r: 21, speed: 25, damage: 16 },
  gunner: { hp: 48, r: 15, speed: 34, damage: 10 },
  boss: { hp: 950, r: 40, speed: 36, damage: 24 },
  weakpoint: { hp: 18, r: 11, speed: 0, damage: 0 },
});

const CAR_SPACING = 68;
const TRACK_STEP = 3;
const TRACK_CAPACITY = 220;
const MAX_CARS = 4;
const MAX_ENEMIES = 84;
const MAX_LEVEL = 5;
const CROSS_ANGLE = Math.PI / 6;
const VOLLEY_TIME = 8;
const GOLD = 0xffd282;
const PINK = 0xff719e;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const angleDelta = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const distance2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const exposedBoss = e => e.kind === 'boss' && e.damageScale >= 1;

class TimedPool {
  constructor(capacity) {
    this.active = [];
    this.free = Array.from({ length: capacity }, () => ({}));
  }

  acquire() {
    const record = this.free.pop() ?? this.active.shift();
    this.active.push(record);
    return record;
  }

  remove(i) {
    this.free.push(this.active[i]);
    this.active.splice(i, 1);
  }

  tick(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      this.active[i].ttl -= dt;
      if (this.active[i].ttl <= 0) this.remove(i);
    }
  }

  clear() {
    this.free.push(...this.active);
    this.active.length = 0;
  }
}

function covers(aim, enemy) {
  const dx = enemy.x - aim.x;
  const dy = enemy.y - aim.y;
  const d2 = dx * dx + dy * dy;
  if (d2 > aim.range2) return false;
  const along = dx * aim.nx + dy * aim.ny;
  return along > 0 && along * along >= d2 * aim.cos2;
}

// A distance-indexed trail keeps every car on the path the driver actually took.
class Trail {
  constructor() {
    this.x = new Float32Array(TRACK_CAPACITY);
    this.y = new Float32Array(TRACK_CAPACITY);
    this.angle = new Float32Array(TRACK_CAPACITY);
    this.distance = new Float64Array(TRACK_CAPACITY);
    this.head = -1;
    this.count = 0;
    this.total = 0;
  }

  push(x, y, heading, distance) {
    const i = this.head = (this.head + 1) % TRACK_CAPACITY;
    this.x[i] = x;
    this.y[i] = y;
    this.angle[i] = heading;
    this.distance[i] = distance;
    this.count = Math.min(this.count + 1, TRACK_CAPACITY);
  }

  prime(x, y, radius) {
    this.head = -1;
    this.count = 0;
    this.total = 0;
    for (let d = -TRACK_STEP * 110; d <= 0; d += TRACK_STEP) {
      const theta = Math.PI / 2 + d / radius;
      this.push(x + Math.cos(theta) * radius, y + Math.sin(theta) * radius,
        theta + Math.PI / 2, d);
    }
  }

  move(x0, y0, x, y, heading) {
    const distance = Math.hypot(x - x0, y - y0);
    if (distance < 0.0001) return;
    const old = this.total;
    this.total += distance;
    let next = this.distance[this.head] + TRACK_STEP;
    while (next <= this.total + 0.000001) {
      const t = clamp((next - old) / distance, 0, 1);
      this.push(x0 + (x - x0) * t, y0 + (y - y0) * t, heading, next);
      next += TRACK_STEP;
    }
  }

  place(entity, distanceBehind, head) {
    const wanted = this.total - distanceBehind;
    let x = head.x;
    let y = head.y;
    let heading = head.heading;
    let distance = this.total;
    for (let n = 0; n < this.count; n++) {
      const i = (this.head - n + TRACK_CAPACITY) % TRACK_CAPACITY;
      const step = this.distance[i];
      if (step <= wanted && distance > step) {
        const t = (wanted - step) / (distance - step);
        entity.x = this.x[i] + (x - this.x[i]) * t;
        entity.y = this.y[i] + (y - this.y[i]) * t;
        entity.heading = this.angle[i] + angleDelta(heading, this.angle[i]) * t;
        return;
      }
      x = this.x[i];
      y = this.y[i];
      heading = this.angle[i];
      distance = step;
    }
    entity.x = x;
    entity.y = y;
    entity.heading = heading;
  }
}

export class Run {
  constructor({ seed = 0x4d592a83 } = {}) {
    this.seed = seed >>> 0;
    this.trail = new Trail();
    this.aimPool = Array.from({ length: MAX_CARS * 2 }, () => ({}));
    this.autoAim = {};
    this.volleyPlanPool = Array.from({ length: MAX_CARS }, () => ({}));
    this.markView = { x: 0, y: 0, id: 0 };
    this.enemyPool = Array.from({ length: MAX_ENEMIES - 3 }, () => ({}));
    this.freeEnemies = [];
    this.volleyPlan = [];
    this.shotPool = new TimedPool(72);
    this.effectPool = new TimedPool(96);
    this.debrisPool = new TimedPool(MAX_CARS);
    this.random = this.random.bind(this);
    this.rng = this.random;
    this.reset('full', 'menu');
  }

  reset(mode, phase) {
    this.mode = mode === 'quick' ? 'quick' : 'full';
    this.phase = phase;
    this.time = 0;
    this.limit = this.mode === 'quick' ? 115 : 360;
    this.stage = 1;
    this.reason = '';
    this.message = '';
    this.hint = '沿着弧线开车，让两门炮对准同一群怪。';
    this.supply = null;
    this.supplyTarget = null;
    this.nextId = 1;
    this.rngState = this.seed || 1;
    this.stats = { kills: 0, volleys: 0, crossfires: 0, recovered: 0, maxCars: 2 };
    this.enemies = [];
    this.freeEnemies.length = 0;
    for (const e of this.enemyPool) this.freeEnemies.push(e);
    this.shotPool.clear();
    this.effectPool.clear();
    this.debrisPool.clear();
    this.shots = this.shotPool.active;
    this.effects = this.effectPool.active;
    this.hazards = [];
    this.debris = this.debrisPool.active;
    this.volley = { charge: 1, mark: null, aim: [] };
    this.volleyPlan.length = 0;
    this.mark = null;
    this.director = createDirector(this.mode);
    this.train = {
      id: 0, x: 240, y: 518, heading: Math.PI, hp: 100, maxHp: 100, r: 19,
      hitT: 0, headHitT: 0, speedScale: 1, fireCd: 0.30, cars: [],
    };
    this.trail.prime(240, 390, 128);
    this.train.cars.push(this.newCar('side'), this.newCar('side'));
    this.placeCars();
    this.guide = Array.from({ length: 13 }, (_, i) => {
      const angle = Math.PI / 2 + i * 0.082;
      return { x: 240 + Math.cos(angle) * 128, y: 390 + Math.sin(angle) * 128 };
    });
  }

  random() {
    let n = this.rngState;
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    this.rngState = n >>> 0;
    return this.rngState / 4294967296;
  }

  start(mode = 'full') {
    this.reset(mode, 'playing');
    updateEncounter(this, 0);
    this.prepareVolley();
  }

  toMenu() { this.reset(this.mode, 'menu'); }

  togglePause() {
    if (this.phase === 'playing') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'playing';
  }

  finish(victory, reason = '') {
    if (this.phase === 'won' || this.phase === 'lost') return;
    this.phase = victory ? 'won' : 'lost';
    this.reason = reason;
    this.volley.aim.length = 0;
    this.volley.mark = null;
  }

  newCar(type, level = 1, recovered = false) {
    return {
      id: this.nextId++, type, level, x: this.train.x, y: this.train.y,
      heading: this.train.heading, hp: recovered ? 1 : 3, maxHp: 3, hitT: 0,
      r: 18, fireCd: 0.18 + this.train.cars.length * 0.13, recovered,
    };
  }

  placeCars() {
    const train = this.train;
    for (let i = 0; i < train.cars.length; i++) {
      this.trail.place(train.cars[i], (i + 1) * CAR_SPACING, train);
    }
  }

  move(dt, input) {
    const magnitude = Math.hypot(input.x, input.y);
    if (!(magnitude > 0.05)) return;
    const train = this.train;
    const x0 = train.x;
    const y0 = train.y;
    const desired = Math.atan2(input.y, input.x);
    train.heading += clamp(angleDelta(desired, train.heading), -dt * 12, dt * 12);
    const speed = 164 * (train.speedScale ?? 1) * Math.min(1, magnitude);
    train.x = clamp(train.x + Math.cos(train.heading) * speed * dt, ARENA.left, ARENA.right);
    train.y = clamp(train.y + Math.sin(train.heading) * speed * dt, ARENA.top, ARENA.bottom);
    const actual = Math.atan2(train.y - y0, train.x - x0);
    this.trail.move(x0, y0, train.x, train.y, actual);
    this.placeCars();
  }

  spawnEnemy(kind, x, y, options = {}) {
    if (this.enemies.length >= MAX_ENEMIES) return null;
    const weakpoint = kind === 'weakpoint';
    const boss = kind === 'boss';
    const defaults = ENEMY[kind] ?? ENEMY.slime;
    let entity;
    // Long-lived director references must not alias a recycled ordinary enemy.
    if (weakpoint || boss) entity = {};
    else {
      entity = this.freeEnemies.pop();
      if (!entity) return null;
      for (const key of Object.keys(entity)) delete entity[key];
    }
    const hp = options.hp ?? options.maxHp ?? defaults.hp;
    Object.assign(entity, defaults, options, {
      id: this.nextId++, kind, x, y, hp, maxHp: options.maxHp ?? hp,
      heading: options.heading ?? 0, hitT: 0, pooled: !weakpoint && !boss,
    });
    this.enemies.push(entity);
    return entity;
  }

  damageEnemy(enemy, amount) {
    if (!enemy || enemy.hp <= 0 || !(amount > 0)) return false;
    const multiplier = enemy.damageScale ?? (enemy.shield ? 0.13 : 1);
    enemy.hp = Math.max(0, enemy.hp - amount * multiplier);
    enemy.hitT = 0.14;
    if (enemy.hp > 0) return false;
    if (enemy.kind === 'boss') {
      this.effect(enemy.x, enemy.y, 'burst', GOLD, 100, 0.85);
      this.finish(true, '赤风守卫已击破');
    } else if (enemy.kind === 'weakpoint') {
      this.effect(enemy.x, enemy.y, 'burst', GOLD, 24, 0.35);
    } else {
      this.stats.kills++;
      this.effect(enemy.x, enemy.y, 'burst', enemy.elite ? GOLD : 0x8ee2cf, enemy.r + 8, 0.26);
    }
    return true;
  }

  hitTrain(amount, car = null) {
    if (this.phase !== 'playing' || this.train.hitT > 0 || !(amount > 0)) return false;
    const train = this.train;
    const index = car ? train.cars.indexOf(car) : -1;
    if (car && index < 0) return false;
    train.hitT = 0.78;
    if (car) {
      car.hitT = 0.48;
      car.hp = Math.max(0, car.hp - 1);
      this.effect(car.x, car.y, 'damage', PINK, 24, 0.34);
      if (car.hp === 0) {
        train.cars.splice(index, 1);
        if (!car.recovered) {
          const drop = this.debrisPool.acquire();
          drop.x = car.x;
          drop.y = car.y;
          drop.type = car.type;
          drop.level = car.level;
          drop.ttl = drop.life = 8;
          this.message = '炮尾脱钩，绕回拾取零件可抢救一次';
        } else {
          this.message = '一节炮车损毁，车头还能继续战斗';
        }
        this.effect(car.x, car.y, 'break', GOLD, 42, 0.45);
        this.placeCars();
      }
    } else {
      train.hp = Math.max(0, train.hp - amount);
      train.headHitT = 0.48;
      this.effect(train.x, train.y, 'damage', PINK, 28, 0.35);
      if (train.hp === 0) this.finish(false, '车头损毁');
    }
    return true;
  }

  recoverDebris() {
    if (this.train.cars.length >= MAX_CARS) return;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const drop = this.debris[i];
      if (distance2(drop.x, drop.y, this.train.x, this.train.y) > 29 ** 2) continue;
      const car = this.newCar(drop.type, drop.level, true);
      this.train.cars.push(car);
      this.debrisPool.remove(i);
      this.stats.recovered++;
      this.stats.maxCars = Math.max(this.stats.maxCars, this.train.cars.length);
      this.train.hitT = Math.max(this.train.hitT, 0.65);
      this.message = '抢救成功，炮车已复接';
      this.effect(drop.x, drop.y, 'rescue', 0x80ffe1, 42, 0.60);
      this.placeCars();
      if (this.train.cars.length >= MAX_CARS) return;
    }
  }

  effect(x, y, kind, color, r, life) {
    const fx = this.effectPool.acquire();
    fx.x = x;
    fx.y = y;
    fx.kind = kind;
    fx.color = color;
    fx.r = r;
    fx.ttl = fx.life = life;
  }

  shoot(x0, y0, enemy, color, damage, kind) {
    const life = kind === 'auto' ? 0.15 : 0.37;
    const shot = this.shotPool.acquire();
    shot.x0 = x0;
    shot.y0 = y0;
    shot.x1 = enemy.x;
    shot.y1 = enemy.y;
    shot.color = color;
    shot.ttl = shot.life = life;
    shot.width = kind === 'auto' ? 2.5 : 6;
    shot.kind = kind;
    if (kind !== 'auto') this.effect(enemy.x, enemy.y, 'hit', color, 19, 0.32);
    this.damageEnemy(enemy, damage);
  }

  aimAt(car, gun, offset, slot) {
    const angle = car.heading + offset;
    const range = gun.range + (car.level - 1) * 5;
    const c = Math.cos(gun.half);
    slot.x = car.x;
    slot.y = car.y;
    slot.angle = angle;
    slot.range = range;
    slot.half = gun.half;
    slot.color = gun.color;
    slot.car = car;
    slot.nx = Math.cos(angle);
    slot.ny = Math.sin(angle);
    slot.cos2 = c * c;
    slot.range2 = range * range;
    return slot;
  }

  prepareVolley() {
    const volley = this.volley;
    this.volleyPlan.length = 0;
    volley.aim.length = 0;
    volley.mark = null;
    this.mark = null;
    if (volley.charge < 1 || this.phase !== 'playing') return;

    const cars = this.train.cars;
    let aimCount = 0;
    for (const car of cars) {
      const gun = GUNS[car.type];
      for (const offset of gun.angles) {
        const aim = this.aimAt(car, gun, offset, this.aimPool[aimCount++]);
        volley.aim.push(aim);
      }
    }

    const weakpointLive = this.enemies.some(e => e.kind === 'weakpoint' && e.hp > 0);
    let bestMark = Infinity;
    // Parallel barrels still combine ordinary damage. Only a true angle
    // between two different cars earns the one burst shown by the double ring.
    if (!weakpointLive) for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      const score = distance2(e.x, e.y, this.train.x, this.train.y) - (exposedBoss(e) ? 1e6 : 0);
      if (score >= bestMark) continue;
      let crossed = false;
      for (let a = 0; a < aimCount && !crossed; a++) {
        const first = volley.aim[a];
        if (!covers(first, e)) continue;
        for (let b = a + 1; b < aimCount; b++) {
          const second = volley.aim[b];
          if (first.car === second.car || Math.abs(angleDelta(first.angle, second.angle)) < CROSS_ANGLE) continue;
          if (covers(second, e)) { crossed = true; break; }
        }
      }
      if (crossed) { this.mark = e; bestMark = score; }
    }
    if (this.mark) {
      const e = this.mark;
      this.markView.x = e.x;
      this.markView.y = e.y;
      this.markView.id = e.id;
      volley.mark = this.markView;
    }

    for (const car of cars) {
      let target = null;
      let score = Infinity;
      for (const aim of volley.aim) {
        if (aim.car !== car) continue;
        for (const e of this.enemies) {
          if (e.hp <= 0 || !covers(aim, e)) continue;
          let priority = distance2(e.x, e.y, car.x, car.y);
          if (e === this.mark) priority -= 2e6;
          if (e.kind === 'weakpoint') {
            priority -= this.volleyPlan.some(plan => plan.target === e) ? 2e6 : 3e6;
          } else if (exposedBoss(e)) priority -= 1e6;
          if (priority < score) { target = e; score = priority; }
        }
      }
      if (target) {
        const plan = this.volleyPlanPool[this.volleyPlan.length];
        plan.car = car;
        plan.target = target;
        this.volleyPlan.push(plan);
      }
    }
    return this.volleyPlan;
  }

  fireVolley() {
    if (this.phase !== 'playing' || this.volley.charge < 1) return false;
    this.prepareVolley();
    const head = this.nearest(this.train.x, this.train.y, 138);
    if (!this.volleyPlan.length && !head) {
      this.message = '射界里还没有目标，能量已保留';
      return false;
    }
    const mark = this.mark;
    const markedX = mark?.x;
    const markedY = mark?.y;
    this.volley.charge = 0;
    this.volley.aim.length = 0;
    this.volley.mark = null;
    this.stats.volleys++;
    for (const { car, target } of this.volleyPlan) {
      const gun = GUNS[car.type];
      this.shoot(car.x, car.y, target, gun.color, gun.volley * (1 + (car.level - 1) * 0.57), 'volley');
    }
    if (head) this.shoot(this.train.x, this.train.y, head, GOLD, 17, 'volley');
    if (mark) {
      this.stats.crossfires++;
      if (this.guide) this.guide.length = 0;
      this.message = '弯道夹击！';
      this.hint = '炮口交叉时齐射，威力更强';
      this.effect(markedX, markedY, 'crossfire', GOLD, 72, 0.65);
      for (const e of this.enemies) {
        if (e.hp <= 0 || e.kind === 'weakpoint') continue;
        if (distance2(markedX, markedY, e.x, e.y) <= (57 + e.r) ** 2) {
          this.damageEnemy(e, e === mark ? 46 : 32);
          if (e.hp > 0 && e.kind !== 'boss') e.stunT = Math.max(e.stunT ?? 0, 0.45);
        }
      }
    } else {
      this.message = '全列齐射！';
    }
    return true;
  }

  nearest(x, y, range) {
    let best = null;
    let score = Infinity;
    const r2 = range * range;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      let d = distance2(x, y, e.x, e.y);
      if (d > r2) continue;
      if (e.kind === 'weakpoint') d -= 2e6;
      else if (exposedBoss(e)) d -= 1e6;
      if (d < score) { score = d; best = e; }
    }
    return best;
  }

  autoFire(dt) {
    const train = this.train;
    train.fireCd -= dt;
    if (train.fireCd <= 0) {
      const target = this.nearest(train.x, train.y, 135);
      if (target) {
        train.fireCd = 0.62;
        this.shoot(train.x, train.y, target, GOLD, 8, 'auto');
      } else train.fireCd = 0;
    }
    for (const car of train.cars) {
      car.fireCd -= dt;
      if (car.fireCd > 0) continue;
      const gun = GUNS[car.type];
      let target = null;
      let score = Infinity;
      for (const offset of gun.angles) {
        const aim = this.aimAt(car, gun, offset, this.autoAim);
        for (const e of this.enemies) {
          if (e.hp <= 0 || !covers(aim, e)) continue;
          const priority = e.kind === 'weakpoint' ? 2e6 : exposedBoss(e) ? 1e6 : 0;
          const d = distance2(e.x, e.y, car.x, car.y) - priority;
          if (d < score) { target = e; score = d; }
        }
      }
      if (target) {
        car.fireCd = gun.period;
        this.shoot(car.x, car.y, target, gun.color, gun.damage * (1 + (car.level - 1) * 0.57), 'auto');
      } else car.fireCd = 0;
    }
  }

  openSupply(type = 'front') {
    if (this.phase !== 'playing') return false;
    const gunType = GUNS[type] ? type : 'front';
    const cars = this.train.cars;
    const gun = GUNS[gunType];
    let merge = cars.find(car => car.type === gunType && car.level < MAX_LEVEL);
    if (!merge) merge = cars.find(car => car.level < MAX_LEVEL);
    const options = [{
      id: 'attach', type: gunType,
      label: cars.length < MAX_CARS ? '接入' + gun.name : '换装' + gun.name,
      description: cars.length < MAX_CARS
        ? '增加一节炮车，拓宽射界。'
        : '用新炮替换当前尾车，维持四节编队。',
    }];
    if (merge) options.push({
      id: 'merge', type: merge.type, label: '合并强化',
      description: GUNS[merge.type].name + '升至 ' + (merge.level + 1) + ' 级，伤害提高。',
    });
    options.push({
      id: 'repair', type: 'repair', label: '战地维修',
      description: '恢复 32 点车头生命，修满车节，齐射立即就绪。',
    });
    this.supplyTarget = { type: gunType, merge };
    this.supply = {
      title: '战地补给',
      description: '每次补给至少恢复 18 点车头生命和一格炮车耐久。',
      options,
    };
    this.phase = 'supply';
    this.volley.aim.length = 0;
    this.volley.mark = null;
    return true;
  }

  choose(id) {
    if (this.phase !== 'supply' || !this.supply.options.some(option => option.id === id)) return false;
    const train = this.train;
    train.hp = Math.min(train.maxHp, train.hp + (id === 'repair' ? 32 : 18));
    for (const car of train.cars) {
      car.hp = id === 'repair' ? car.maxHp : Math.min(car.maxHp, car.hp + 1);
    }
    if (id === 'attach') {
      if (train.cars.length === MAX_CARS) train.cars.pop();
      train.cars.push(this.newCar(this.supplyTarget.type));
      this.stats.maxCars = Math.max(this.stats.maxCars, train.cars.length);
      this.message = GUNS[this.supplyTarget.type].name + '已接入';
      this.placeCars();
    } else if (id === 'merge') {
      const car = this.supplyTarget.merge;
      car.level++;
      this.message = GUNS[car.type].name + '已强化';
    } else {
      this.volley.charge = 1;
      this.message = '维修完毕，齐射就绪';
    }
    this.effect(train.x, train.y, 'supply', GOLD, 46, 0.55);
    this.supplyTarget = null;
    this.supply = null;
    this.phase = 'playing';
    this.prepareVolley();
    return true;
  }

  update(dt, input = { x: 0, y: 0 }) {
    if (this.phase !== 'playing') return;
    dt = clamp(Number(dt) || 0, 0, 0.06);
    this.time += dt;
    if (this.time >= this.limit) {
      this.time = this.limit;
      this.finish(false, '战斗时间耗尽');
      return;
    }
    this.shotPool.tick(dt);
    this.effectPool.tick(dt);
    this.debrisPool.tick(dt);
    this.train.hitT = Math.max(0, this.train.hitT - dt);
    this.train.headHitT = Math.max(0, this.train.headHitT - dt);
    for (const car of this.train.cars) car.hitT = Math.max(0, car.hitT - dt);
    for (const e of this.enemies) {
      e.hitT = Math.max(0, e.hitT - dt);
      if (e.stunT > 0) e.stunT = Math.max(0, e.stunT - dt);
    }
    this.volley.charge = Math.min(1, this.volley.charge + dt / VOLLEY_TIME);
    updateEncounter(this, dt);
    if (this.phase !== 'playing') return;
    this.move(dt, input);
    this.recoverDebris();
    this.autoFire(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hp > 0) continue;
      this.enemies.splice(i, 1);
      if (e.pooled) this.freeEnemies.push(e);
    }
    this.prepareVolley();
  }
}
