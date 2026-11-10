const TAU = Math.PI * 2;

export const ART = Object.freeze({
  ground: 'tow-ground',
  engine: 'tow-engine',
  side: 'tow-side',
  front: 'tow-front',
  rear: 'tow-rear',
  slime: 'tow-slime',
  brute: 'tow-brute',
  runner: 'tow-runner',
  shooter: 'tow-shooter',
  boss: 'tow-boss',
  salvage: 'tow-salvage',
});

function randomFrom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function texture(scene, key, width, height, draw, scale = 1) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, width * scale, height * scale);
  const ctx = tex.getContext();
  ctx.save();
  ctx.scale(scale, scale);
  draw(ctx);
  ctx.restore();
  tex.refresh();
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function box(ctx, x, y, w, h, r, fill, stroke, lineWidth = 1) {
  rounded(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function poly(ctx, points, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function ellipse(ctx, x, y, rx, ry, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function line(ctx, x0, y0, x1, y1, color, width = 1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function gradient(ctx, x0, y0, x1, y1, colors) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < colors.length; i++) g.addColorStop(i / (colors.length - 1), colors[i]);
  return g;
}

function glow(ctx, x, y, radius, center) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, center);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ellipse(ctx, x, y, radius, radius, g);
}

function ground(ctx) {
  const rand = randomFrom(24917);
  const dust = ['#46504b', '#172b2b', '#42504a', '#50544b', '#252e2a', '#4e5148'];
  ctx.fillStyle = gradient(ctx, 0, 0, 440, 800, ['#141b20', '#26312e', '#1b2426']);
  ctx.fillRect(0, 0, 480, 800);
  const lamp = ctx.createRadialGradient(222, 367, 18, 228, 405, 310);
  lamp.addColorStop(0, '#38443b');
  lamp.addColorStop(.7, '#293530');
  lamp.addColorStop(1, '#192327');
  box(ctx, 19, 119, 442, 555, 22, lamp, '#0c1418', 6);
  box(ctx, 26, 126, 428, 541, 18, 'rgba(0,0,0,0)', '#5a6256', 1.3);

  ctx.save();
  rounded(ctx, 27, 128, 426, 537, 17);
  ctx.clip();
  for (let i = 0; i < 135; i++) {
    const x = 24 + rand() * 434, y = 130 + rand() * 530;
    const r = 7 + rand() * 32;
    ctx.globalAlpha = .035 + rand() * .085;
    ellipse(ctx, x, y, r * (1.2 + rand()), r * .53, dust[i % dust.length]);
  }
  for (let i = 0; i < 2200; i++) {
    const x = 24 + rand() * 434, y = 130 + rand() * 530;
    ctx.globalAlpha = .08 + rand() * .18;
    line(ctx, x, y, x + 1 + rand() * 9, y + rand() * 3 - 1.5, dust[i % dust.length], .5 + rand() * 1.4);
  }
  ctx.globalAlpha = .62;
  for (const x of [75, 405]) {
    for (let y = 139; y < 661; y += 19) {
      const skipped = rand() < .21;
      if (!skipped) {
        box(ctx, x - 13, y, 26, 4, 1.2, '#433f34', '#232825', .7);
        line(ctx, x - 10, y + 1, x + 9, y + 1, '#67604b', .7);
      }
    }
    for (const railX of [x - 8, x + 8]) {
      line(ctx, railX, 130, railX, 658, '#181e1e', 3.8);
      line(ctx, railX, 130, railX, 658, '#65706a', 1.3);
    }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < 38; i++) {
    const x = 48 + rand() * 385, y = 140 + rand() * 513;
    const size = 1 + rand() * 2.1;
    ellipse(ctx, x + 1, y + 1.5, size * 1.5, size * .72, '#212a27');
    poly(ctx, [[x - size,y],[x - size * .2,y - size],[x + size,y - size * .3],[x + size * .6,y + size * .53]],
      '#575b4e');
  }
  for (let i = 0; i < 22; i++) {
    const x = rand() < .5 ? 29 + rand() * 37 : 414 + rand() * 37;
    const y = 141 + rand() * 513;
    for (let j = 0; j < 4; j++) line(ctx, x, y, x + (rand() - .5) * 8, y - rand() * 7, '#5b6450', .6);
  }
  for (let i = 0; i < 14; i++) {
    const x = 92 + rand() * 296, y = 154 + rand() * 480;
    line(ctx, x, y, x + 9, y + 2, '#202c29', 1);
    line(ctx, x + 9, y + 2, x + 13, y + 6, '#202c29', 1);
    line(ctx, x + 13, y + 6, x + 20, y + 7, '#202c29', .7);
  }
  ctx.restore();

  for (const y of [133, 659]) {
    for (const x of [36, 444]) {
      glow(ctx, x, y, 27, 'rgba(249,166,69,0.20)');
      box(ctx, x - 6, y - 5, 12, 10, 2, '#1c2221', '#4f5144');
      box(ctx, x - 4, y - 2, 8, 4, 1, '#dca75a');
    }
  }
  for (const y of [118, 675]) {
    box(ctx, 45, y - 3, 390, 6, 2, '#10191b', '#444c45', .7);
    for (let x = 63; x < 422; x += 24) {
      poly(ctx, [[x,y - 2],[x + 8,y - 2],[x + 5,y + 2],[x - 3,y + 2]], '#8e7148');
    }
  }
  const vignette = ctx.createRadialGradient(240, 393, 164, 240, 393, 473);
  vignette.addColorStop(0, 'rgba(10,15,20,0)');
  vignette.addColorStop(1, 'rgba(10,15,20,.57)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, 480, 800);
}

function treads(ctx, x, y, width) {
  box(ctx, x, y, width, 7, 3, '#111b20', '#5b6b62', 1);
  for (let xx = x + 3; xx <= x + width - 3; xx += 4) line(ctx, xx, y + 1.3, xx - 1, y + 5.8, '#53645f', .8);
}

function rivet(ctx, x, y, color = '#d1b37b') {
  ellipse(ctx, x, y, 1.15, 1.15, color, '#28372f', .45);
}

function engine(ctx) {
  glow(ctx, 52, 23, 17, 'rgba(255,214,114,0.24)');
  ellipse(ctx, 31, 25, 26, 16, 'rgba(7,12,15,.5)');
  treads(ctx, 12, 8, 35);
  treads(ctx, 12, 32, 35);
  poly(ctx, [[12,13],[43,13],[53,18],[57,23],[53,29],[43,34],[12,34],[7,29],[7,18]],
    gradient(ctx, 6, 13, 54, 36, ['#77978b','#355e5b','#283d3c']), '#142727', 1.7);
  box(ctx, 13, 15, 15, 17, 3, gradient(ctx, 13, 15, 27, 32, ['#4a7774','#224645']), '#172f31');
  box(ctx, 16, 18, 8, 10, 1.6, gradient(ctx, 15, 18, 25, 28, ['#c5eddf','#5db9ba','#3c797e']), '#24474a', .9);
  box(ctx, 30, 17, 16, 13, 2.3, gradient(ctx, 31, 15, 46, 30, ['#ddbd76','#a78148','#695032']), '#58452e');
  for (let x = 33; x < 45; x += 3) line(ctx, x, 19, x, 28, '#493d31', 1);
  poly(ctx, [[45,16],[54,19],[59,23],[54,28],[45,31],[47,23]], '#bc9558', '#574935');
  line(ctx, 50, 21, 57, 23, '#ffe5a0', 2);
  line(ctx, 50, 25, 57, 23, '#ffe5a0', 2);
  box(ctx, 27, 22, 20, 4, 1.5, '#273536', '#e3b678', 1);
  box(ctx, 42, 21, 8, 5.6, 1.3, '#5e776d', '#c8ab71');
  for (const x of [12, 29, 42]) {
    rivet(ctx, x, 14);
    rivet(ctx, x, 33);
  }
  line(ctx, 3, 23, 10, 23, '#b9a77a', 2.8);
  line(ctx, 5, 21.4, 5, 24.6, '#f1d8a4', 1.1);
}

function carriage(ctx, kind) {
  const scheme = {
    side: ['#719d9b', '#386b6e', '#26474e', '#8de8dc'],
    front: ['#b89462', '#8e653e', '#4f4438', '#ffcb7a'],
    rear: ['#8790a5', '#596b8d', '#333d50', '#c6c7f7'],
  }[kind];
  const [light, mid, dark, signal] = scheme;
  ellipse(ctx, 26, 24, 22, 14, 'rgba(7,12,15,.46)');
  treads(ctx, 10, 9, 30);
  treads(ctx, 10, 29, 30);
  line(ctx, 4, 22, 47, 22, '#72715d', 3);
  poly(ctx, [[11,12],[37,12],[43,17],[43,27],[37,33],[11,33],[7,27],[7,17]],
    gradient(ctx, 9, 12, 38, 32, [light, mid, dark]), '#172628', 1.6);
  box(ctx, 12, 14, 25, 16, 2.4, dark, light, .8);
  ellipse(ctx, 24, 22, 9, 7, mid, '#1d2928', 1.2);
  if (kind === 'side') {
    for (const [a, b] of [[5, 19], [25, 39]]) {
      box(ctx, 20, a, 8, b - a, 1.6, light, '#263637', 1.2);
      line(ctx, 22, a + 1, 22, b - 1, signal, 1.4);
      box(ctx, 19, a < 10 ? 4 : 36, 10, 4, .9, '#2c4b4d', light);
    }
  } else {
    const x = kind === 'front' ? 24 : 4;
    box(ctx, x, 18, 23, 8, 1.7, light, '#2a3433', 1.2);
    line(ctx, x + 2, 20, x + 21, 20, signal, 1.7);
    box(ctx, kind === 'front' ? 43 : 3, 17, 5, 10, 1.3, dark, light);
  }
  ellipse(ctx, 24, 22, 5.6, 4.6, gradient(ctx, 19, 18, 29, 25, [light, mid, dark]), '#283738');
  for (const x of [12, 37]) {
    rivet(ctx, x, 14, signal);
    rivet(ctx, x, 30, signal);
  }
  line(ctx, 13, 27, 16, 27, signal, 1.4);
}

function slime(ctx) {
  ellipse(ctx, 21, 25, 17, 8, 'rgba(9,12,17,.52)');
  poly(ctx, [[5,25],[5,17],[9,10],[16,7],[26,8],[34,13],[37,22],[32,29],[23,31],[15,29],[8,31]],
    gradient(ctx, 7, 9, 31, 32, ['#e39879','#b85954','#652e44']), '#3a2633', 1.9);
  ellipse(ctx, 17, 13, 7, 3.8, 'rgba(255,199,156,.33)');
  line(ctx, 20, 16, 24, 19, '#502738', 2);
  line(ctx, 29, 17, 32, 17.5, '#502738', 2);
  ellipse(ctx, 24, 21, 2.4, 1.7, '#ffdf9e');
  ellipse(ctx, 31, 20, 2.1, 1.5, '#ffdf9e');
  ellipse(ctx, 33, 25, 1.8, 1.3, '#d58b77');
}

function runner(ctx) {
  ellipse(ctx, 22, 22, 19, 11, 'rgba(9,12,17,.48)');
  for (const y of [10, 27]) {
    poly(ctx, [[17,18],[9,y],[3,y + 1],[10,y - 4],[26,16 + (y - 10) * .44]], '#7a3b49', '#392834', 1.2);
  }
  poly(ctx, [[8,19],[15,12],[29,12],[41,20],[29,27],[16,28]],
    gradient(ctx, 13, 11, 28, 28, ['#e38d73','#ad4d52','#723341']), '#392834', 1.6);
  poly(ctx, [[21,16],[30,15],[37,19],[32,22],[23,22]], '#503447');
  line(ctx, 28, 17, 34, 20, '#ffdd8d', 1.8);
  line(ctx, 11, 20, 18, 21, '#ffc478', 1.5);
  line(ctx, 8, 18, 11, 15, '#ef8d70', 1.1);
}

function brute(ctx) {
  ellipse(ctx, 26, 29, 23, 17, 'rgba(9,12,17,.55)');
  poly(ctx, [[4,14],[15,6],[29,7],[45,15],[49,28],[42,38],[26,44],[11,39],[4,30]],
    gradient(ctx, 7, 7, 48, 41, ['#bc8582','#80505d','#4e3243']), '#2c2631', 2.2);
  for (const y of [11, 29]) {
    poly(ctx, [[10,y + 1],[25,y - 2],[30,y + 5],[18,y + 10],[9,y + 7]], '#925d66', '#4c3544');
    line(ctx, 11, y + 3, 24, y + 1, '#d39a8e', 1.3);
  }
  poly(ctx, [[26,15],[38,14],[46,20],[45,30],[37,36],[24,32],[21,23]], '#6a4353', '#3d2d3c', 1.8);
  poly(ctx, [[29,19],[38,18],[43,22],[41,28],[35,32],[28,28]], '#3c3140', '#ab7380');
  line(ctx, 34, 21, 41, 24, '#ffe3a0', 2);
  line(ctx, 34, 28, 41, 24, '#ff966b', 2);
}

function shooter(ctx) {
  ellipse(ctx, 24, 25, 21, 13, 'rgba(9,12,17,.52)');
  treads(ctx, 9, 9, 26);
  treads(ctx, 9, 29, 26);
  box(ctx, 7, 13, 32, 19, 5, gradient(ctx, 10, 13, 34, 32, ['#bd8b94','#754b61','#4d364a']), '#34283a', 1.7);
  box(ctx, 13, 16, 20, 12, 4, '#573548', '#9e6575');
  ellipse(ctx, 23, 22, 7, 5, '#c48c87', '#472e42');
  box(ctx, 23, 19, 22, 6, 1.4, '#765665', '#d79a9b');
  box(ctx, 41, 18, 5.5, 8, 1, '#522d45', '#dba0a1');
  line(ctx, 32, 21, 44, 21, '#ffc986', 1.6);
  for (const x of [11, 34]) rivet(ctx, x, 15, '#e5a8a3');
}

function boss(ctx) {
  ellipse(ctx, 50, 48, 43, 31, 'rgba(7,10,14,.56)');
  for (const y of [18, 54]) {
    box(ctx, 15, y, 65, 18, 7, '#29232d', '#866873', 2);
    for (let x = 21; x < 80; x += 6) line(ctx, x, y + 2, x - 2, y + 15, '#5d4d59', 1.6);
  }
  poly(ctx, [[17,23],[45,14],[70,16],[86,27],[94,45],[86,63],[70,73],[44,74],[18,66],[7,51],[7,39]],
    gradient(ctx, 9, 14, 80, 74, ['#c38c85','#855866','#433644']), '#282431', 2.8);
  for (const y of [23, 57]) {
    poly(ctx, [[16,y + 3],[43,y - 5],[58,y],[53,y + 10],[26,y + 12]], '#8b626c', '#493948', 1.5);
    line(ctx, 19, y + 2, 41, y - 3, '#e3a798', 1.7);
  }
  poly(ctx, [[52,23],[74,23],[87,35],[87,55],[75,67],[52,65],[40,53],[40,36]],
    gradient(ctx, 46, 24, 82, 65, ['#ac7a82','#70465b','#503749']), '#322734', 2.3);
  glow(ctx, 63, 45, 24, 'rgba(246,92,155,0.33)');
  poly(ctx, [[64,31],[77,44],[64,59],[51,45]], '#e45c89', '#4f3246', 2);
  poly(ctx, [[64,35],[72,44],[64,54],[55,45]], '#ffd293', '#f58fa1', 1.3);
  box(ctx, 78, 38, 16, 14, 3, '#402e40', '#a87678', 1.4);
  for (const y of [41, 46, 50]) line(ctx, 83, y, 93, y, '#d59a83', 1.5);
  for (const x of [18, 38, 54, 78]) {
    rivet(ctx, x, 24, '#eab0a7');
    rivet(ctx, x, 64, '#eab0a7');
  }
}

function salvage(ctx) {
  glow(ctx, 18, 18, 17, 'rgba(243,197,111,.37)');
  poly(ctx, [[18,4],[30,11],[30,23],[18,32],[6,23],[6,11]], '#4d4c38', '#f2c46e', 1.6);
  poly(ctx, [[18,8],[25,13],[25,22],[18,27],[11,22],[11,13]],
    gradient(ctx, 10, 8, 25, 28, ['#cabc78','#6d8e79','#455c50']), '#283633', 1.2);
  line(ctx, 13, 18, 23, 18, '#fff0ab', 2);
  line(ctx, 18, 13, 18, 23, '#fff0ab', 2);
}

export function installArt(scene) {
  texture(scene, ART.ground, 480, 800, ground);
  texture(scene, ART.engine, 62, 46, engine, 2);
  for (const kind of ['front', 'side', 'rear']) texture(scene, ART[kind], 50, 44, ctx => carriage(ctx, kind), 2);
  texture(scene, ART.slime, 42, 38, slime, 2);
  texture(scene, ART.runner, 46, 38, runner, 2);
  texture(scene, ART.brute, 54, 49, brute, 2);
  texture(scene, ART.shooter, 49, 42, shooter, 2);
  texture(scene, ART.boss, 100, 90, boss, 2);
  texture(scene, ART.salvage, 36, 36, salvage, 2);
}
