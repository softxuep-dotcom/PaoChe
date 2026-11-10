import test from 'node:test';
import assert from 'node:assert/strict';
import { GUNS, Run } from '../src/model.js';
import { normalizeSave, recordBattle } from '../src/records.js';

test('the first charge previews and performs a real opening crossfire', () => {
  const run = new Run();
  run.start('quick');
  assert.equal(run.enemies.length, 7);
  assert.ok(run.volley.mark);
  assert.equal(run.fireVolley(), true);
  assert.deepEqual([run.stats.kills, run.stats.crossfires, run.stats.volleys], [7, 1, 1]);
  assert.equal(run.fireVolley(), false);
});

test('the second practice pack rewards following the bend with real movement', () => {
  const run = new Run();
  run.start('quick');
  run.fireVolley();
  while (run.time < 12 && run.director.coach.stage !== 'curve') run.update(1 / 60);
  const coach = run.director.coach;
  assert.equal(coach.stage, 'curve');
  assert.equal(coach.ids.includes(run.volley.mark?.id), false);
  const route = run.guide.slice();
  let index = 1;
  for (let frame = 0; frame < 300 && !coach.ids.includes(run.volley.mark?.id); frame++) {
    const distanceTo = point => Math.hypot(point.x - run.train.x, point.y - run.train.y);
    while (index < route.length - 1 && distanceTo(route[index]) < 10) index++;
    const target = route[index];
    const d = distanceTo(target);
    run.update(1 / 60, { x: (target.x - run.train.x) / d, y: (target.y - run.train.y) / d });
  }
  assert.ok(coach.ids.includes(run.volley.mark?.id));
  assert.equal(run.fireVolley(), true);
  run.update(1 / 60);
  assert.deepEqual([run.stats.crossfires, run.stats.lastVolleyKills, coach.stage], [2, 5, 'done']);
});

test('straight parallel shots can hit without earning a crossfire', () => {
  const run = new Run();
  run.start();
  run.fireVolley();
  run.volley.charge = 1;
  const [a, b] = run.train.cars;
  Object.assign(a, { x: 208, y: 350, heading: 0 });
  Object.assign(b, { x: 272, y: 350, heading: 0 });
  const enemy = run.spawnEnemy('tank', 240, 450);
  run.prepareVolley();
  assert.equal(run.volleyPlan.length, 2);
  assert.equal(run.volley.mark, null);
  a.heading = Math.atan2(100, 32) - Math.PI / 2;
  b.heading = Math.atan2(100, -32) - Math.PI / 2;
  run.prepareVolley();
  assert.equal(run.volley.mark?.id, enemy.id);
  assert.equal(run.fireVolley(), true);
  assert.equal(run.stats.crossfires, 2);
});

test('supply choices alter count, cannon strength and durability separately', () => {
  const run = new Run();
  run.start();
  assert.equal(run.openSupply('front'), true);
  assert.equal(run.choose('attach'), true);
  assert.equal(run.train.cars.length, 3);
  assert.equal(run.train.cars.at(-1).type, 'front');
  run.openSupply('side');
  run.choose('merge');
  assert.equal(run.train.cars.length, 3);
  assert.equal(run.train.cars[0].level, 2);
  run.train.hp = 40;
  run.train.cars[0].hp = 1;
  run.volley.charge = .1;
  run.openSupply('rear');
  run.choose('repair');
  assert.equal(run.train.hp, 72);
  assert.equal(run.train.cars[0].hp, 3);
  assert.equal(run.volley.charge, 1);
});

test('an empty shot preserves charge and pauses freeze the live run', () => {
  const run = new Run();
  run.start();
  run.fireVolley();
  run.volley.charge = 1;
  assert.equal(run.fireVolley(), false);
  assert.equal(run.volley.charge, 1);
  run.togglePause();
  const { time } = run;
  const { x, y } = run.train;
  const lifetime = run.effects[0].ttl;
  for (let i = 0; i < 120; i++) run.update(1 / 60, { x: 1, y: 1 });
  assert.deepEqual([run.time, run.train.x, run.train.y, run.effects[0].ttl], [time, x, y, lifetime]);
  run.togglePause();
  run.update(1 / 60, { x: -1, y: 0 });
  assert.ok(run.train.x < x);
});

test('a broken tail can be recovered once, at one point of durability', () => {
  const run = new Run();
  run.start();
  const tail = run.train.cars.at(-1);
  for (let i = 0; i < 3; i++) {
    run.train.hitT = 0;
    assert.equal(run.hitTrain(1, tail), true);
    assert.equal(run.hitTrain(1, tail), false, 'one immediate collision cannot hit twice');
  }
  assert.equal(run.train.cars.length, 1);
  assert.equal(run.train.hp, 100);
  const salvage = run.debris[0];
  Object.assign(run.train, { x: salvage.x, y: salvage.y });
  run.recoverDebris();
  const recovered = run.train.cars.at(-1);
  assert.deepEqual([run.train.cars.length, recovered.hp, run.stats.recovered, run.debris.length], [2, 1, 1, 0]);
  run.train.hitT = 0;
  run.hitTrain(1, recovered);
  assert.equal(run.debris.length, 0);
});

test('a real quick-run boss exposes its core and a win can restart cleanly', () => {
  const run = new Run();
  run.start('quick');
  run.fireVolley();
  // A quiet target fixture skips unrelated wave damage while exercising the director.
  for (let frames = 0; frames < 5000 && run.director.boss?.state !== 'recover'; frames++) {
    for (const enemy of run.enemies) if (enemy.kind !== 'boss' && enemy.kind !== 'weakpoint') enemy.hp = 0;
    if (run.phase === 'supply') run.choose('repair');
    run.update(1 / 60);
  }
  const boss = run.director.boss;
  assert.equal(boss?.state, 'recover');
  assert.equal(run.director.weakpoints.length, 2);
  for (const point of run.director.weakpoints) run.damageEnemy(point, point.hp + 1);
  run.update(1 / 60);
  assert.equal(boss.state, 'exposed');
  assert.equal(boss.damageScale, 1);
  assert.ok(boss.stateT > 3.6, 'dual break extends the exposed window');
  run.damageEnemy(boss, boss.hp + 1);
  assert.equal(run.phase, 'won');
  run.start('quick');
  assert.equal(run.director.boss, null);
  assert.equal(run.train.cars.length, 2);
  assert.equal(run.stats.crossfires, 0);
  assert.equal(run.time, 0);
});

test('damage and the deadline each finish the run cleanly', () => {
  const run = new Run();
  run.start();
  run.hitTrain(100);
  assert.equal(run.phase, 'lost');
  run.start();
  run.time = run.limit - .01;
  run.update(.02);
  assert.deepEqual([run.phase, run.time], ['lost', run.limit]);
});

test('a supply can preview and upgrade the selected wagon without replacing another', () => {
  const run = new Run();
  run.start();
  const [first, second] = run.train.cars;
  run.openSupply('side');
  const merge = run.supply.options.find(option => option.id === 'merge');
  const preview = merge.targets.find(target => target.id === second.id);
  assert.deepEqual([preview.level, preview.nextLevel, preview.volley], [1, 2, GUNS.side.volley]);
  assert.ok(preview.nextVolley > preview.volley);
  assert.equal(run.choose('merge', -1), false);
  assert.equal(run.phase, 'supply');
  assert.equal(run.choose('merge', second.id), true);
  assert.deepEqual([first.level, second.level, run.train.cars.length], [1, 2, 2]);
});

test('front and tail cannon roles apply to real shots and record actual damage', () => {
  const run = new Run();
  run.start();
  run.fireVolley();
  const tank = run.spawnEnemy('tank', 245, 350);
  run.shoot(205, 350, tank, GUNS.front.color, GUNS.front.damage, 'auto', 'front');
  assert.ok(tank.hp < tank.maxHp - GUNS.front.damage);
  assert.ok(Math.abs(run.stats.damageByType.front - (tank.maxHp - tank.hp)) < 1e-8);
  const runner = run.spawnEnemy('runner', 245, 380, { hp: 1000 });
  run.shoot(205, 380, runner, GUNS.rear.color, GUNS.rear.damage, 'volley', 'rear');
  assert.equal(runner.slowScale, GUNS.rear.slowScale);
  assert.equal(runner.slowT, GUNS.rear.volleySlowTime);
  run.shoot(205, 380, runner, GUNS.rear.color, GUNS.rear.damage, 'auto', 'rear');
  assert.equal(runner.slowT, GUNS.rear.volleySlowTime, 'weaker hits do not add duration or shorten the active slow');
  assert.equal(run.stats.bestVolleyKills, 7);
});

test('archive migration preserves old bests and records each mode independently', () => {
  const save = normalizeSave({ bestFull: 280, bestQuick: 91, wins: 2, maxCrossfires: 5, muted: true });
  assert.deepEqual([save.records.full.bestTime, save.records.quick.bestTime, save.legacyWins, save.legacyCrossfires, save.muted], [280, 91, 2, 5, true]);
  const run = new Run();
  run.start('quick');
  run.time = 85;
  run.stats.crossfires = 3;
  run.stats.bestVolleyKills = 8;
  run.finish(true);
  const first = recordBattle(save, run);
  assert.equal(first.bestTime, true);
  assert.deepEqual(first.medals.map(medal => medal.id), ['crossfire']);
  run.time = 100;
  run.stats.crossfires = 2;
  run.stats.bestVolleyKills = 4;
  const second = recordBattle(save, run);
  assert.deepEqual(second.medals, []);
  assert.deepEqual(save.records.quick, { runs: 2, wins: 2, bestTime: 85, bestCrossfires: 3, bestBarrage: 8 });
  assert.equal(save.records.full.bestTime, 280);
});
