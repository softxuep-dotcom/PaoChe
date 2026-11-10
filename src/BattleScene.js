import Phaser from 'phaser';
import { ART, installArt, loadedEnemySheets, preloadEnemySheets } from './art.js';

const TAU = Math.PI * 2;
const GOLD = 0xf4c571;
const CREAM = 0xffefb9;
const TEAL = 0x80dcd2;
const DANGER = 0xf080a7;
const DANGER_LIGHT = 0xffd2df;
const DARK = 0x142021;
const ENEMY_LIMIT = 84;
const CAR_LIMIT = 4;
const DEBRIS_LIMIT = 8;
const MENU_X = 243;
const MENU_Y = 338;
const MENU_RADIUS = 138;
const menuFormation = [2.56, 1.92, 1.28, .64].map(angle => Object.freeze({
  x: MENU_X + Math.cos(angle) * MENU_RADIUS,
  y: MENU_Y + Math.sin(angle) * MENU_RADIUS,
  heading: angle + Math.PI / 2,
}));
const textureFor = Object.freeze({
  slime: ART.slime,
  tank: ART.brute,
  brute: ART.brute,
  runner: ART.runner,
  gunner: ART.shooter,
  shooter: ART.shooter,
  boss: ART.boss,
  weakpoint: ART.salvage,
});
const sizeFor = Object.freeze({
  slime: [42, 38],
  tank: [54, 49],
  brute: [54, 49],
  runner: [46, 38],
  gunner: [49, 42],
  shooter: [49, 42],
  boss: [100, 90],
  weakpoint: [36, 36],
});

function numericColor(value, fallback) {
  if (Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^#[\da-f]{6}$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  return fallback;
}

function pointAlong(x, y, angle, distance) {
  return { x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance };
}

function tickRing(g, x, y, radius, count, size, angle, color, alpha) {
  g.lineStyle(1.4, color, alpha);
  for (let i = 0; i < count; i++) {
    const a = angle + i * TAU / count;
    const cx = Math.cos(a), cy = Math.sin(a);
    g.lineBetween(x + cx * radius, y + cy * radius, x + cx * (radius + size), y + cy * (radius + size));
  }
}

function arrow(g, x, y, direction, length, color, alpha) {
  const a = direction + .63, b = direction - .63;
  g.lineStyle(1.9, color, alpha);
  g.lineBetween(x, y, x - Math.cos(a) * length, y - Math.sin(a) * length);
  g.lineBetween(x, y, x - Math.cos(b) * length, y - Math.sin(b) * length);
}

function bar(g, x, y, w, h, fraction, color) {
  g.fillStyle(0x0e1519, .93).fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle(0x332b30, .96).fillRect(x, y, w, h);
  if (fraction > 0) g.fillStyle(color, .96).fillRect(x, y, w * Math.min(1, fraction), h);
}

function markDiamond(g, x, y, r, color, alpha) {
  g.lineStyle(1.7, color, alpha).beginPath();
  g.moveTo(x, y - r).lineTo(x + r, y).lineTo(x, y + r).lineTo(x - r, y).closePath().strokePath();
}

function lockCorners(g, x, y, radius, color, alpha) {
  g.lineStyle(2, color, alpha);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = x + sx * radius, cy = y + sy * radius;
      g.beginPath().moveTo(cx - sx * 6, cy).lineTo(cx, cy).lineTo(cx, cy - sy * 6).strokePath();
    }
  }
}

function lineDash(g, x0, y0, x1, y1, dash = 8, gap = 7) {
  const dx = x1 - x0, dy = y1 - y0, length = Math.hypot(dx, dy);
  if (length < .001) return;
  const vx = dx / length, vy = dy / length;
  for (let s = 0; s < length; s += dash + gap) {
    const end = Math.min(s + dash, length);
    g.lineBetween(x0 + vx * s, y0 + vy * s, x0 + vx * end, y0 + vy * end);
  }
}

function visibleRay(x, y, dx, dy, maxLength) {
  const xLimit = dx > .001 ? (447 - x) / dx : dx < -.001 ? (33 - x) / dx : Infinity;
  const yLimit = dy > .001 ? (654 - y) / dy : dy < -.001 ? (136 - y) / dy : Infinity;
  return Math.max(0, Math.min(xLimit, yLimit, maxLength));
}

function distanceToLine2(x, y, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
  return (x - x0 - dx * t) ** 2 + (y - y0 - dy * t) ** 2;
}

function displaySheetEnemy(sprite, sheet, x, y, radius, heading, time, phase, still) {
  const dx = Math.cos(heading), dy = Math.sin(heading);
  const front = sheet.tracks.front && Math.abs(dx) < .42;
  const diagonal = sheet.tracks.front_left && dy > .42 && Math.abs(dx) < .91;
  const track = front ? sheet.tracks.front : diagonal ? sheet.tracks.front_left : sheet.tracks.left;
  const frame = track[still ? 0 : Math.floor(time * sheet.fps + phase) % track.length];
  if (sprite.texture.key !== sheet.key) sprite.setTexture(sheet.key, frame);
  else if (sprite.frame.name !== frame) sprite.setFrame(frame);
  const width = (radius * 2 + sheet.padding) / sheet.coverage;
  sprite.setVisible(true).setPosition(x, y).setOrigin(.5, sheet.originY)
    .setFlipX(!front && dx > 0).setRotation(0).setDisplaySize(width, width * sheet.height / sheet.width);
}

export function createBattleScene(run, controls, onFrame) {
  return new class BattleScene extends Phaser.Scene {
    constructor() {
      super({ key: 'battle' });
    }

    preload() {
      preloadEnemySheets(this);
    }

    create() {
      installArt(this);
      this.enemySheets = loadedEnemySheets(this);
      this.add.image(240, 400, ART.ground).setDepth(0);
      this.floor = this.add.graphics().setDepth(1);
      this.danger = this.add.graphics().setDepth(13);
      this.guide = this.add.graphics().setDepth(3);
      this.couplers = this.add.graphics().setDepth(4);
      this.enemySprites = Array.from({ length: ENEMY_LIMIT }, () =>
        this.add.image(0, 0, ART.slime).setDepth(6).setVisible(false));
      this.carSprites = Array.from({ length: CAR_LIMIT }, () =>
        this.add.image(0, 0, ART.side).setDepth(8).setVisible(false));
      this.salvageSprites = Array.from({ length: DEBRIS_LIMIT }, () =>
        this.add.image(0, 0, ART.salvage).setDepth(5).setVisible(false));
      this.engineSprite = this.add.image(0, 0, ART.engine).setDepth(9).setVisible(false);
      this.tracers = this.add.graphics().setDepth(11);
      this.over = this.add.graphics().setDepth(12);
      this.flashText = this.add.text(0, 0, '', {
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
        fontSize: '20px', fontStyle: 'bold', color: '#ffeab8', stroke: '#211c23', strokeThickness: 4,
      }).setOrigin(.5).setDepth(14).setVisible(false);
      this.salvageText = this.add.text(0, 0, '', {
        fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif',
        fontSize: '13px', fontStyle: 'bold', color: '#ffdf96', stroke: '#182022', strokeThickness: 3,
      }).setOrigin(.5).setDepth(12).setVisible(false);
      this.renderWorld(0);
      onFrame?.(run);
    }

    update(time, delta) {
      run.update(Math.min(delta / 1000, .05), controls.move);
      this.renderWorld(time / 1000);
      onFrame?.(run);
    }

    renderWorld(realTime) {
      const time = run.time || 0;
      this.floor.clear();
      this.danger.clear();
      this.guide.clear();
      this.couplers.clear();
      this.tracers.clear();
      this.over.clear();
      this.flashText.setVisible(false);
      this.salvageText.setVisible(false);
      if (run.phase === 'menu') {
        this.drawMenuFormation(realTime);
        return;
      }
      this.drawHazards(time);
      this.drawGuide(time);
      this.drawTrain(time);
      this.drawEnemies(time);
      this.drawSalvage(time);
      this.drawFire();
      this.drawEffects();
    }

    drawMenuFormation(time) {
      const [head, first, second, rear] = menuFormation;
      const floor = this.floor, g = this.couplers, over = this.over;
      const pulse = .5 + .5 * Math.sin(time * 1.9);
      floor.fillStyle(0x6f8b71, .12).fillEllipse(MENU_X, MENU_Y + 81, 351, 252);
      floor.fillStyle(GOLD, .06 + pulse * .025).fillCircle(MENU_X, MENU_Y, 74);
      floor.lineStyle(1.6, GOLD, .33).strokeCircle(MENU_X, MENU_Y, 54);
      floor.lineStyle(.8, TEAL, .18).strokeCircle(MENU_X, MENU_Y, 69);
      tickRing(floor, MENU_X, MENU_Y, 67, 12, 5, time * .055, GOLD, .42);
      for (let i = 0; i < 24; i++) {
        const a = i * TAU / 24 + .07;
        const x = MENU_X + Math.cos(a) * 150;
        const y = MENU_Y + Math.sin(a) * 105;
        const drift = Math.sin(time * (1.3 + (i % 4) * .31) + i * .87);
        floor.fillStyle(i % 3 ? GOLD : TEAL, .14 + .12 * drift)
          .fillCircle(x + drift * 5, y - drift * 8, 1 + (i % 3) * .42);
      }
      for (let i = 1; i < menuFormation.length; i++) {
        const a = menuFormation[i - 1], b = menuFormation[i];
        g.lineStyle(9, DARK, .92).lineBetween(a.x, a.y, b.x, b.y);
        g.lineStyle(4.6, 0x8d8060, .93).lineBetween(a.x, a.y, b.x, b.y);
        g.fillStyle(0xd7bd87, .89).fillCircle((a.x + b.x) * .5, (a.y + b.y) * .5, 4);
      }
      this.engineSprite.setVisible(true).setPosition(head.x, head.y)
        .setRotation(head.heading).setDisplaySize(107, 79.4);
      for (let i = 0; i < this.carSprites.length; i++) {
        const sprite = this.carSprites[i], place = menuFormation[i + 1];
        if (!place) {
          sprite.setVisible(false);
          continue;
        }
        const key = i === 2 ? ART.front : ART.side;
        if (sprite.texture.key !== key) sprite.setTexture(key);
        sprite.setVisible(true).setPosition(place.x, place.y).setRotation(place.heading).setDisplaySize(79, 69.5);
      }
      for (let i = 0; i < this.salvageSprites.length; i++) this.salvageSprites[i].setVisible(false);
      for (let i = 0; i < this.enemySprites.length; i++) {
        const sprite = this.enemySprites[i];
        if (i >= 4) {
          sprite.setVisible(false);
          continue;
        }
        const a = i * 2.13;
        const x = MENU_X + (i ? Math.cos(a) * 31 : 0);
        const y = MENU_Y + (i ? Math.sin(a) * 26 : 0);
        const sheet = this.enemySheets[i ? 'slime' : 'tank'];
        if (sheet) {
          displaySheetEnemy(sprite, sheet, x, y, i ? 14.5 : 19, a + .3, time, i * 1.7, true);
        } else {
          const key = i ? ART.slime : ART.brute;
          if (sprite.texture.key !== key) sprite.setTexture(key);
          sprite.setVisible(true).setPosition(x, y).setOrigin(.5).setFlipX(false).setRotation(a + .3)
            .setDisplaySize(i ? 36 : 49, i ? 32.6 : 44.5);
        }
      }
      const tracer = this.tracers;
      for (const place of [first, second]) {
        const a = Math.atan2(MENU_Y - place.y, MENU_X - place.x);
        const start = pointAlong(place.x, place.y, a, 34);
        const finish = pointAlong(MENU_X, MENU_Y, a + Math.PI, 18);
        tracer.lineStyle(10, GOLD, .07 + pulse * .06).lineBetween(start.x, start.y, finish.x, finish.y);
        tracer.lineStyle(2.3, GOLD, .47 + pulse * .18).lineBetween(start.x, start.y, finish.x, finish.y);
        tracer.lineStyle(1.1, CREAM, .58 + pulse * .25);
        lineDash(tracer, start.x, start.y, finish.x, finish.y, 10, 6);
        tracer.fillStyle(CREAM, .65 + pulse * .25).fillCircle(start.x, start.y, 3);
      }
      const r = 25 + 3 * pulse;
      over.lineStyle(2.2, GOLD, .96).strokeCircle(MENU_X, MENU_Y, r);
      over.lineStyle(1.2, CREAM, .78).strokeCircle(MENU_X, MENU_Y, r - 5);
      tickRing(over, MENU_X, MENU_Y, r, 4, 8, Math.PI / 4, CREAM, .87);
      floor.fillStyle(TEAL, .12).fillCircle(rear.x, rear.y, 36);
    }

    drawHazards(time) {
      const g = this.danger;
      for (const h of run.hazards || []) {
        if (h.ttl <= 0 || h.dead) continue;
        const progress = 1 - Math.max(0, Math.min(1, h.ttl / Math.max(.001, h.life || h.ttl)));
        const x = h.x, y = h.y, radius = h.r || h.radius || 18;
        if (h.kind === 'hostile-shot' || h.kind === 'enemy-shot') {
          const x0 = h.x0 ?? x, y0 = h.y0 ?? y;
          g.lineStyle(radius * 1.7, 0x622f54, .55).lineBetween(x0, y0, x, y);
          g.fillStyle(0xe774a6, .19).fillCircle(x, y, radius * 1.85);
          g.fillStyle(0xf57da7, .98).fillCircle(x, y, radius);
          g.fillStyle(0xffe0d3, .96).fillCircle(x, y, radius * .48);
          continue;
        }
        if (h.kind === 'charge' || h.kind === 'aim') {
          const x0 = h.x0, y0 = h.y0, x1 = h.x1, y1 = h.y1;
          const aim = h.kind === 'aim', active = h.dashed;
          const tailAim = aim && (h.targetId > 0 || h.owner?.state === 'tail-aim');
          const angle = Math.atan2(y1 - y0, x1 - x0);
          const px = Math.sin(angle) * radius, py = -Math.cos(angle) * radius;
          this.floor.lineStyle(radius * 2 + 5, 0x301c32, aim ? .25 : .69).lineBetween(x0, y0, x1, y1);
          this.floor.lineStyle(radius * 2, DANGER, active ? .34 : aim ? .06 : .13 + progress * .12)
            .lineBetween(x0, y0, x1, y1);
          if (!aim) {
            g.lineStyle(4.6, 0x3d1c37, .86);
            g.lineBetween(x0 + px, y0 + py, x1 + px, y1 + py);
            g.lineBetween(x0 - px, y0 - py, x1 - px, y1 - py);
            g.lineStyle(1.9, active ? DANGER_LIGHT : DANGER, .76 + progress * .2);
            lineDash(g, x0 + px, y0 + py, x1 + px, y1 + py, 12, 5);
            lineDash(g, x0 - px, y0 - py, x1 - px, y1 - py, 12, 5);
            if (!active) {
              for (const car of run.train.cars) {
                if (distanceToLine2(car.x, car.y, x0, y0, x1, y1) < (radius + 11) ** 2) {
                  lockCorners(g, car.x, car.y, 26, DANGER_LIGHT, .85);
                }
              }
            }
          } else {
            g.lineStyle(tailAim ? 2 : 1.4, DANGER, tailAim ? .95 : .74);
            lineDash(g, x0, y0, x1, y1, 7, 6);
          }
          if (tailAim) {
            const impactRadius = h.impactR || 31;
            this.floor.fillStyle(DANGER, .1 + progress * .1).fillCircle(x1, y1, impactRadius);
            g.lineStyle(2, DANGER, .63 + progress * .35).strokeCircle(x1, y1, impactRadius);
            lockCorners(g, x1, y1, impactRadius * .6, DANGER_LIGHT, .91);
            const id = h.targetId ?? h.owner?.biteId;
            const threatened = run.train.cars.find(car => car.id === id);
            if (threatened && (threatened.x - x1) ** 2 + (threatened.y - y1) ** 2 <= impactRadius ** 2) {
              arrow(g, threatened.x, threatened.y - 26, Math.PI / 2, 10, DANGER_LIGHT, .95);
            }
          }
          const length = Math.hypot(x1 - x0, y1 - y0);
          for (let d = 22; d < length - 8; d += aim ? 53 : 37) {
            const p = pointAlong(x0, y0, angle, d);
            arrow(g, p.x, p.y, angle, aim ? 4 : 8, DANGER_LIGHT, aim ? .67 : .85);
          }
          continue;
        }
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const terrain = h.kind === 'lava' || h.kind === 'terrain' || h.kind === 'mud' || h.kind === 'oil';
        this.floor.fillStyle(terrain ? 0x4b2733 : 0x6f2f4c, terrain ? .65 : .12 + .17 * progress)
          .fillCircle(x, y, radius);
        g.lineStyle(3.8, DARK, .64).strokeCircle(x, y, radius);
        g.lineStyle(1.8, DANGER, terrain ? .69 : .78 + progress * .2).strokeCircle(x, y, radius);
        if (!terrain) g.lineStyle(1.1, 0xffb4c3, .75).strokeCircle(x, y, Math.max(2, radius * (1 - progress)));
        tickRing(g, x, y, radius, 6, 5, .3, DANGER, .84);
      }
    }

    drawGuide(time) {
      if (run.phase !== 'playing' && run.phase !== 'paused') return;
      const g = this.guide;
      const guide = run.guide;
      const points = Array.isArray(guide) ? guide : guide?.points;
      if (points?.length > 1) {
        const alpha = .27 + .1 * Math.sin(time * 3.4);
        g.lineStyle(2.1, TEAL, alpha);
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1], b = points[i];
          lineDash(g, a.x, a.y, b.x, b.y, 5, 7);
        }
        const last = points[points.length - 1], pre = points[points.length - 2];
        arrow(g, last.x, last.y, Math.atan2(last.y - pre.y, last.x - pre.x), 10, TEAL, .73);
      }
      const volley = run.volley;
      if (!volley || volley.charge < .995) return;
      const plan = run.volleyPlan || [];
      for (const aim of volley.aim || []) {
        if (plan.some(shot => shot.car === aim.car)) continue;
        const angle = aim.angle;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const reach = visibleRay(aim.x, aim.y, dx, dy, 34);
        if (reach < 20) continue;
        arrow(g, aim.x + dx * reach, aim.y + dy * reach, angle, 5, numericColor(aim.color, TEAL), .32);
      }
      // Draw only the paths that the current firing plan actually uses. A bright
      // bracket identifies each car taking part in the marked crossfire.
      for (const { car, target } of plan) {
        const selected = target.id === volley.mark?.id;
        const weakpoint = target.kind === 'weakpoint';
        const color = selected ? GOLD : numericColor(volley.aim.find(aim => aim.car === car)?.color, TEAL);
        const vx = target.x - car.x, vy = target.y - car.y;
        const distance = Math.hypot(vx, vy);
        if (selected) lockCorners(this.over, car.x, car.y, 23, GOLD, .96);
        if (distance <= 22) continue;
        const dx = vx / distance, dy = vy / distance;
        const reach = selected || weakpoint ? distance - Math.max(8, (target.r || 12) * .82) : Math.min(53, distance - 9);
        if (reach <= 20) continue;
        const x0 = car.x + dx * 18, y0 = car.y + dy * 18;
        const x1 = car.x + dx * reach, y1 = car.y + dy * reach;
        g.lineStyle(selected ? 5 : 3, DARK, .77).lineBetween(x0, y0, x1, y1);
        g.lineStyle(selected ? 2.2 : 1.5, color, selected ? .95 : weakpoint ? .73 : .48)
          .lineBetween(x0, y0, x1, y1);
        if (selected) g.lineStyle(.9, CREAM, .93).lineBetween(x0, y0, x1, y1);
        arrow(g, x1, y1, Math.atan2(vy, vx), selected ? 8 : 5, selected ? CREAM : color, selected ? .99 : .68);
      }
      if (volley.mark) {
        const { x, y } = volley.mark, r = volley.mark.r || 16;
        const radius = r + 7 + 2 * Math.sin(time * 7.5);
        this.floor.fillStyle(GOLD, .1).fillCircle(x, y, radius + 4);
        this.over.lineStyle(3.7, DARK, .86).strokeCircle(x, y, radius);
        this.over.lineStyle(2, GOLD, .99).strokeCircle(x, y, radius);
        this.over.lineStyle(1.1, CREAM, .89).strokeCircle(x, y, radius - 4);
        tickRing(this.over, x, y, radius, 4, 6, Math.PI / 4, CREAM, .91);
      }
    }

    drawTrain(time) {
      const train = run.train;
      if (!train) {
        this.engineSprite.setVisible(false);
        for (const car of this.carSprites) car.setVisible(false);
        return;
      }
      const { x, y, heading = 0 } = train;
      const cars = train.cars || [];
      const g = this.couplers;
      let prev = train;
      for (const car of cars) {
        g.lineStyle(5.4, 0x111b20, .92).lineBetween(prev.x, prev.y, car.x, car.y);
        g.lineStyle(2.4, 0x7b7762, .83).lineBetween(prev.x, prev.y, car.x, car.y);
        g.fillStyle(0xc8b588, .8).fillCircle((prev.x + car.x) * .5, (prev.y + car.y) * .5, 2.8);
        prev = car;
      }
      this.floor.fillStyle(TEAL, .07).fillCircle(x, y, 28);
      this.floor.lineStyle(2.3, TEAL, .86).strokeCircle(x, y, 23.5);
      tickRing(this.floor, x, y, 23.5, 4, 4, heading, TEAL, .84);
      this.engineSprite.setVisible(true).setPosition(x, y).setRotation(heading).setDisplaySize(63, 46.7);
      if (train.headHitT > 0) {
        this.over.lineStyle(2.5, DANGER, Math.min(1, .35 + train.headHitT * 1.6)).strokeCircle(x, y, 27);
      }
      for (let i = 0; i < this.carSprites.length; i++) {
        const sprite = this.carSprites[i], car = cars[i];
        if (!car) {
          sprite.setVisible(false);
          continue;
        }
        const key = ART[car.type] || ART.side;
        if (sprite.texture.key !== key) sprite.setTexture(key);
        sprite.setVisible(true).setPosition(car.x, car.y).setRotation(car.heading || 0).setDisplaySize(49, 43.1);
        if (car.hitT > 0) this.over.lineStyle(2.4, DANGER, .83).strokeCircle(car.x, car.y, 24);
        const health = car.hp ?? 3, maxHp = car.maxHp ?? 3;
        if (i === cars.length - 1 || health < maxHp) {
          const start = car.x - (maxHp * 7 + (maxHp - 1) * 2) * .5;
          for (let j = 0; j < maxHp; j++) {
            const bx = start + j * 9, by = car.y + 24;
            this.over.fillStyle(0x142022, .96).fillRoundedRect(bx - 1, by - 1, 9, 5.5, 1.5);
            this.over.fillStyle(j < health ? health === 1 ? DANGER : GOLD : 0x4d3a42, .95)
              .fillRoundedRect(bx, by, 7, 3.5, 1);
          }
        }
        if (car.level > 1) {
          this.over.fillStyle(GOLD, .82);
          for (let j = 0; j < Math.min(3, car.level - 1); j++) this.over.fillCircle(car.x - 4 + j * 4, car.y - 25, 1.3);
        }
      }
      if (cars.length) {
        const tail = cars[cars.length - 1];
        if (tail.hp === 1) {
          lockCorners(this.danger, tail.x, tail.y, 26, DANGER, .71 + .2 * Math.sin(time * 8));
        }
      }
    }

    drawEnemies(time) {
      const enemies = run.enemies || [];
      for (let i = 0; i < this.enemySprites.length; i++) {
        const sprite = this.enemySprites[i], enemy = enemies[i];
        if (!enemy || enemy.hp <= 0 || enemy.active === false) {
          sprite.setVisible(false);
          continue;
        }
        const { x, y, kind } = enemy;
        const r = enemy.r || 14;
        const heading = Number.isFinite(enemy.heading) ? enemy.heading : 0;
        const sheet = this.enemySheets[kind];
        if (sheet) {
          const still = enemy.stunT > 0 || enemy.introUntil > time || enemy.state === 'windup' ||
            enemy.state === 'recover' || enemy.state === 'exposed' || enemy.state === 'tail-aim';
          displaySheetEnemy(sprite, sheet, x, y, r, heading, time, enemy.id % 7, still);
          this.floor.fillStyle(0x12181e, .44).fillEllipse(x, y + r * .47, r * 1.75, r * .63);
          // A short hostile ground dash distinguishes animated enemies even
          // when their paint palette is close to a friendly cannon.
          this.floor.lineStyle(1.5, 0xcb708b, .59).lineBetween(x - r * .36, y + r + 2, x + r * .36, y + r + 2);
        } else {
          const key = textureFor[kind] || ART.slime;
          if (sprite.texture.key !== key) sprite.setTexture(key);
          const dims = sizeFor[kind] || sizeFor.slime;
          const scale = kind === 'boss' ? (r + 8) / 43 : kind === 'weakpoint' ? (r + 2) / 14 : (r + 4) / (dims[0] * .43);
          const pulse = kind === 'slime' ? .97 + .06 * Math.sin(time * 8.4 + enemy.id * 1.41) : 1;
          sprite.setVisible(kind !== 'weakpoint').setPosition(x, y).setOrigin(.5).setFlipX(false)
            .setRotation(heading).setDisplaySize(dims[0] * scale * pulse, dims[1] * scale / pulse);
        }
        const depth = kind === 'boss' ? 7 : 6;
        if (sprite.depth !== depth) sprite.setDepth(depth);
        if (kind === 'weakpoint') {
          this.floor.fillStyle(TEAL, .14).fillCircle(x, y, r + 8);
          this.over.fillStyle(0x254344, .9).fillCircle(x, y, r + 3);
          markDiamond(this.over, x, y, r + 3, TEAL, 1);
          markDiamond(this.over, x, y, r - 2, CREAM, .9);
          tickRing(this.over, x, y, r + 4, 4, 4, time * 1.9, TEAL, .95);
          bar(this.over, x - 13, y - r - 9, 26, 3, enemy.hp / (enemy.maxHp || enemy.hp), TEAL);
        } else if (kind === 'boss') {
          const exposed = enemy.state === 'exposed' || enemy.exposedT > 0 || enemy.exposed > 0;
          this.floor.fillStyle(exposed ? GOLD : DANGER, .11).fillCircle(x, y, r + 13);
          this.floor.lineStyle(2, exposed ? GOLD : DANGER, .74).strokeCircle(x, y, r + 8);
          tickRing(this.floor, x, y, r + 8, 8, 5, time * .22, exposed ? GOLD : DANGER, .77);
          if (exposed) markDiamond(this.over, x, y, r * .56, GOLD, .8);
          bar(this.over, x - 33, y - r - 13, 66, 5, enemy.hp / (enemy.maxHp || enemy.hp), exposed ? GOLD : DANGER);
        } else {
          if (enemy.slowT > 0) {
            const frost = 0xbce9fc;
            this.floor.fillStyle(frost, .11).fillCircle(x, y, r + 6);
            this.over.lineStyle(1.5, frost, .81);
            for (let n = 0; n < 3; n++) {
              const offset = (n - 1) * r * .7;
              this.over.lineBetween(x + offset - 2, y + r + 4, x + offset + 1, y + r - 2);
              this.over.lineBetween(x + offset, y + r + 2, x + offset + 4, y + r + 3);
            }
          }
          if (enemy.elite) {
            this.floor.lineStyle(1.7, DANGER, .72).strokeCircle(x, y, r + 5);
            tickRing(this.floor, x, y, r + 5, 4, 4, .65, DANGER, .7);
          }
          if (enemy.hp < enemy.maxHp) {
            bar(this.over, x - r * .77, y - r - 6, r * 1.54, 2.8, enemy.hp / enemy.maxHp, 0xf89aa4);
          }
        }
        if (enemy.hitT > 0) this.over.lineStyle(1.5, 0xffd9bd, .38 + Math.min(.46, enemy.hitT * 2)).strokeCircle(x, y, r + 2);
      }
    }

    drawSalvage(time) {
      const items = run.debris || [];
      let nearest = null, distance = Infinity;
      for (let i = 0; i < this.salvageSprites.length; i++) {
        const sprite = this.salvageSprites[i], item = items[i];
        if (!item || item.ttl <= 0 || item.active === false) {
          sprite.setVisible(false);
          continue;
        }
        const pulse = Math.sin(time * 6.6 + i * 2);
        const { x, y } = item;
        const d2 = (x - run.train.x) ** 2 + (y - run.train.y) ** 2;
        if (d2 < distance) {
          nearest = item;
          distance = d2;
        }
        sprite.setVisible(true).setPosition(x, y + pulse * 2).setDisplaySize(35, 35);
        this.floor.fillStyle(GOLD, .11).fillCircle(x, y, 25);
        this.floor.lineStyle(2.2, GOLD, .65 + pulse * .19).strokeCircle(x, y, 23);
        tickRing(this.floor, x, y, 23, 6, 4, time * 1.2, GOLD, .76);
        bar(this.over, x - 11, y + 28, 22, 2.6, item.ttl / (item.life || 8), GOLD);
      }
      if (nearest) this.salvageText.setVisible(true).setText('救援 ' + Math.ceil(nearest.ttl) + '秒')
        .setPosition(nearest.x, nearest.y - 29);
    }

    drawFire() {
      const g = this.tracers;
      for (const shot of run.shots || []) {
        if (shot.ttl <= 0 || shot.active === false) continue;
        const { x0, y0, x1, y1 } = shot;
        if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
        const power = shot.kind === 'volley' || shot.kind === 'crossfire';
        const fade = Math.min(1, shot.ttl / Math.max(.01, shot.life || shot.ttl));
        const color = numericColor(shot.color, power ? GOLD : TEAL);
        const width = shot.width || (power ? 4.2 : 2.1);
        const angle = Math.atan2(y1 - y0, x1 - x0);
        g.lineStyle(width * 3.6, color, fade * .14).lineBetween(x0, y0, x1, y1);
        g.lineStyle(width, color, .95 * fade).lineBetween(x0, y0, x1, y1);
        g.lineStyle(Math.max(.7, width * .32), CREAM, .91 * fade).lineBetween(x0, y0, x1, y1);
        g.fillStyle(color, .24 * fade).fillCircle(x0, y0, width * 3.1);
        g.fillStyle(CREAM, .91 * fade).fillCircle(x0, y0, width * 1.38);
        if (power) {
          const p = pointAlong(x0, y0, angle, 18);
          arrow(g, p.x, p.y, angle, 12, color, fade * .75);
          g.fillStyle(CREAM, fade * .83).fillCircle(x1, y1, width * 1.2);
        }
      }
    }

    drawEffects() {
      const g = this.tracers;
      let callout = null;
      for (const effect of run.effects || []) {
        if (effect.ttl <= 0 || effect.active === false) continue;
        const { x, y } = effect;
        const r = effect.r || 18;
        const alpha = Math.min(1, effect.ttl / Math.max(.001, effect.life || effect.ttl));
        const progress = 1 - alpha;
        const color = numericColor(effect.color, GOLD);
        const crossfire = effect.kind === 'crossfire';
        const rescue = effect.kind === 'rescue';
        const coreBreak = effect.kind === 'coreBreak' || effect.kind === 'dualBreak';
        const attach = effect.kind === 'attach';
        const merge = effect.kind === 'merge';
        const repair = effect.kind === 'repair';
        const large = crossfire || rescue || coreBreak || attach || merge || repair || effect.kind === 'supply' ||
          effect.kind === 'break' || effect.kind === 'burst' || effect.kind === 'impact';
        if (large) {
          const span = r * (.26 + progress * .84);
          this.floor.fillStyle(color, alpha * (crossfire ? .2 : .12)).fillCircle(x, y, span);
          g.lineStyle(crossfire ? 3.4 : 2.3, color, alpha * .91).strokeCircle(x, y, span);
          g.lineStyle(1.2, CREAM, alpha * .88).strokeCircle(x, y, Math.max(2, span * .72));
          if (crossfire) {
            const size = span * .57;
            g.lineStyle(4.7, GOLD, alpha * .69);
            g.lineBetween(x - size, y - size, x + size, y + size);
            g.lineBetween(x + size, y - size, x - size, y + size);
            g.lineStyle(1.6, CREAM, alpha * .91);
            g.lineBetween(x - size, y - size, x + size, y + size);
            g.lineBetween(x + size, y - size, x - size, y + size);
          }
          if (attach || rescue) lockCorners(this.over, x, y, 25 + 4 * progress, CREAM, alpha * .95);
          if (merge) {
            arrow(g, x - 13, y - 17 - progress * 14, -Math.PI / 2, 7, CREAM, alpha * .93);
            arrow(g, x + 13, y - 17 - progress * 14, -Math.PI / 2, 7, CREAM, alpha * .93);
          }
          if (repair) {
            g.lineStyle(2.3, 0xc4f5df, alpha * .91);
            g.lineBetween(x - 7, y, x + 7, y);
            g.lineBetween(x, y - 7, x, y + 7);
          }
          const count = crossfire ? 10 : 6;
          for (let i = 0; i < count; i++) {
            const angle = i * TAU / count + .14 * i + .08 * y;
            const start = pointAlong(x, y, angle, span * .72);
            const end = pointAlong(x, y, angle, span * (1 + (i % 3) * .08));
            g.lineStyle(i % 2 ? 1.4 : 2, i % 2 ? color : CREAM, alpha * .88)
              .lineBetween(start.x, start.y, end.x, end.y);
          }
        } else {
          const span = r * (.35 + progress * .65);
          g.fillStyle(color, alpha * .18).fillCircle(x, y, span);
          g.lineStyle(1.5, color, alpha * .86).strokeCircle(x, y, span);
          tickRing(g, x, y, span * .8, 4, 3.4, progress * 1.12 + x, CREAM, alpha * .82);
        }
        if (crossfire || rescue || coreBreak || attach || merge || repair || effect.kind === 'break') {
          const priority = coreBreak ? 5 : crossfire ? 4 : rescue ? 3 : effect.kind === 'break' ? 2 : 1;
          if (!callout || callout.priority <= priority) {
            callout = {
              x, y: y - (crossfire ? 39 : 33) - progress * 18,
              label: effect.kind === 'dualBreak' ? '双核击破！' : coreBreak ? '核心暴露' :
                crossfire ? '夹击！' : rescue ? '炮车归队' : attach ? '炮车接入' :
                  merge ? '火力强化' : repair ? '维修完毕' : '车节脱钩',
              color: crossfire || coreBreak || merge ? '#ffe7a3' :
                rescue || attach || repair ? '#a6f3d5' : '#f8b0c7',
              alpha: Math.min(1, alpha * 2.5), priority,
            };
          }
        }
      }
      if (callout) this.flashText.setVisible(true).setText(callout.label).setColor(callout.color)
        .setAlpha(callout.alpha).setPosition(callout.x, callout.y);
    }
  }();
}
