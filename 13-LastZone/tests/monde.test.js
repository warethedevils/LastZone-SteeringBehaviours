const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(53);
const { Tempete, Bus, Largage, Carte, Grille, Chemin, Balle, Mur, Arbre, Rocher, Batiment, Butin, CONFIG, resetConfig, createVector } = g;
const DT = 1 / 60;

test.beforeEach(() => { resetConfig(); g.seed(17); });

const island = { cx: 1600, cy: 1600, radius: 1400 };

function run(storm, seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) { storm.think(DT); storm.update(); } }

// ---------------------------------------------------------------- Tempête

test('tempête : attente puis réduction, durées exactes, rayon linéaire', () => {
  const storm = new Tempete(island);
  const phase = CONFIG.tempete.phases[0];
  assert.strictEqual(storm.state, 'attente');
  assert.strictEqual(storm.r, CONFIG.tempete.startRadius);
  run(storm, phase.wait - 0.5);
  assert.strictEqual(storm.state, 'attente');
  assert.strictEqual(storm.r, CONFIG.tempete.startRadius, 'le rayon ne bouge pas pendant l\'attente');
  run(storm, 0.6);
  assert.strictEqual(storm.state, 'reduction');
  const from = storm.fromRadius;
  run(storm, phase.shrink / 2);
  const expected = from + (storm.nextRadius - from) / 2;
  assert.ok(Math.abs(storm.r - expected) < 8, `${storm.r} vs ${expected}`);
  run(storm, phase.shrink / 2 + 0.1);
  assert.strictEqual(storm.phaseIndex, 1);
  assert.strictEqual(storm.state, 'attente');
  assert.ok(Math.abs(storm.r - phase.radius) < 1e-6);
});

test('tempête : timeLeft décroît ; dps de la phase ; vitesse globale', () => {
  const storm = new Tempete(island);
  const total = storm.timeLeft;
  run(storm, 10);
  assert.ok(Math.abs(storm.timeLeft - (total - 10)) < 0.1);
  assert.strictEqual(storm.dps, CONFIG.tempete.phases[0].dps);
  CONFIG.tempete.speedFactor = 2;
  const fast = new Tempete(island);
  assert.ok(Math.abs(fast.timeLeft - total / 2) < 0.01, 'deux fois plus rapide');
});

test('tempête : chaque nouvelle zone est contenue dans la précédente', () => {
  for (let seed = 1; seed <= 12; seed++) {
    g.seed(seed);
    const storm = new Tempete(island);
    for (let k = 0; k < CONFIG.tempete.phases.length - 1; k++) {
      const containedAtPick = p5Distance(storm.nextCenter, storm.pos) + storm.nextRadius <= storm.r + 1;
      assert.ok(containedAtPick, `phase ${k}, graine ${seed}`);
      // on avance jusqu'à la phase suivante
      const p = CONFIG.tempete.phases[k];
      run(storm, (p.wait + p.shrink) + 1);
    }
  }
});

function p5Distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

test('tempête : le centre rejoint la zone suivante (arrive) et s\'immobilise', () => {
  const storm = new Tempete(island);
  const target = storm.nextCenter.copy();
  const phase = CONFIG.tempete.phases[0];
  run(storm, phase.wait + phase.shrink + 1);
  assert.ok(p5Distance(storm.pos, target) < 60, `centre à ${p5Distance(storm.pos, target).toFixed(0)} px de la cible`);
});

test('tempête : inside au seuil inclusif, overshoot signé, fin après la dernière phase', () => {
  const storm = new Tempete(island);
  storm.pos.set(1000, 1000);
  storm.r = 500;
  assert.ok(storm.inside(createVector(1500, 1000)));
  assert.ok(!storm.inside(createVector(1500.01, 1000)));
  assert.ok(storm.overshoot(createVector(1600, 1000)) > 0 && storm.overshoot(createVector(1000, 1000)) < 0);
  const full = new Tempete(island);
  for (let k = 0; k < CONFIG.tempete.phases.length; k++) {
    const p = CONFIG.tempete.phases[k];
    run(full, p.wait + p.shrink + 1);
  }
  assert.ok(full.finished);
  assert.ok(full.r <= 10);
  run(full, 20);
  assert.ok(full.r <= 10, 'ne bouge plus');
});

// ---------------------------------------------------------------- Bus

test('bus : suit son chemin, progresse de 0 à 1, puis quitte la carte', () => {
  const chemin = Chemin.line(createVector(-500, 1600), createVector(3700, 1600), 60);
  const bus = new Bus(chemin);
  assert.strictEqual(bus.progress, 0);
  let steps = 0;
  let lastProgress = 0;
  while (!bus.gone && steps < 5000) {
    bus.think(DT);
    bus.update();
    assert.ok(bus.progress >= lastProgress - 1e-9);
    assert.ok(Math.abs(bus.pos.y - 1600) < 30, 'reste sur la trajectoire');
    lastProgress = bus.progress;
    steps++;
  }
  assert.ok(bus.gone);
  assert.ok(bus.progress >= 0.98);
  const expectedSteps = 4200 / CONFIG.match.busSpeed;
  assert.ok(Math.abs(steps - expectedSteps) < expectedSteps * 0.1, `${steps} pas`);
  assert.ok(bus.vel.mag() <= bus.maxSpeed + 1e-9);
});

// ---------------------------------------------------------------- Largage

test('largage : descend, atterrit après sa durée, altitude de 1 à 0, dérive limitée', () => {
  const drop = new Largage(1000, 1000, 10);
  const start = drop.pos.copy();
  assert.strictEqual(drop.altitude, 1);
  for (let i = 0; i < 300; i++) { drop.think(DT); drop.update(); }
  assert.ok(Math.abs(drop.altitude - 0.5) < 0.02);
  assert.ok(!drop.landed);
  for (let i = 0; i < 310; i++) { drop.think(DT); drop.update(); }
  assert.ok(drop.landed);
  assert.ok(p5Distance(drop.pos, start) < 600, 'le vent est faible');
  assert.ok(drop.vel.mag() <= drop.maxSpeed + 1e-9);
});

// ---------------------------------------------------------------- Balle

test('balle : parcourt sa portée puis disparaît ; collision balayée contre un petit disque', () => {
  const b = new Balle(0, 0, 0, 40, 10, 400, null);
  for (let i = 0; i < 9; i++) b.step();
  assert.ok(!b.dead);
  b.step();
  assert.ok(b.dead, 'portée atteinte');
  const fast = new Balle(0, 0, 0, 45, 10, 1000, null);
  fast.step();
  assert.ok(fast.hitFraction(createVector(22, 5), 4) !== null, 'traverse un petit disque en un pas');
  assert.strictEqual(fast.hitFraction(createVector(22, 40), 4), null);
  assert.strictEqual(fast.hitFraction(createVector(-50, 0), 4), null, 'derrière le départ');
  fast.spent = true;
  assert.ok(fast.dead);
});

// ---------------------------------------------------------------- Obstacles

test('arbres et rochers : se récoltent, se détruisent, rapportent plus à la destruction', () => {
  const tree = new Arbre(0, 0, 1);
  const first = tree.harvest(30);
  assert.strictEqual(first, 15);
  assert.ok(!tree.dead);
  tree.harvest(30);
  const last = tree.harvest(30);
  assert.ok(tree.dead);
  assert.strictEqual(last, 35);
  const rock = new Rocher(0, 0, 40);
  assert.strictEqual(rock.harvest(10), 12);
  assert.strictEqual(rock.colliders[0].parent, rock);
});

test('mur : trois disques alignés, dégâts, destruction', () => {
  const wall = new Mur(100, 100, 0, null, 100);
  assert.strictEqual(wall.colliders.length, 3);
  const xs = wall.colliders.map(c => c.pos.x).sort((a, b) => a - b);
  assert.ok(xs[1] === 100 && xs[2] - xs[1] === xs[1] - xs[0]);
  assert.strictEqual(wall.hit(60), false);
  assert.strictEqual(wall.hit(60), true);
  assert.ok(wall.dead);
});

test('bâtiment : chaîne de disques le long du grand côté, emprise testable', () => {
  const wide = new Batiment(500, 500, 120, 60, [200, 80, 80]);
  assert.ok(wide.colliders.length >= 2);
  const ys = new Set(wide.colliders.map(c => c.pos.y));
  assert.strictEqual(ys.size, 1, 'alignés horizontalement');
  const tall = new Batiment(500, 500, 60, 120, [200, 80, 80]);
  assert.strictEqual(new Set(tall.colliders.map(c => c.pos.x)).size, 1);
  assert.ok(wide.covers(560, 500) && !wide.covers(561, 500) && wide.covers(561, 500, 5));
});

test('butin : propriétés dérivées (automatique, couleur, libellé)', () => {
  const ammo = new Butin(0, 0, { kind: 'munitions', type: 'legere', count: 30 });
  assert.ok(ammo.automatic);
  const gun = new Butin(0, 0, { kind: 'arme', type: 'sniper', rarity: 4, mag: 5 });
  assert.ok(!gun.automatic);
  assert.strictEqual(gun.rarity, 4);
  assert.ok(gun.label.includes('Sniper') && gun.label.includes('Légendaire'));
  assert.deepStrictEqual(Array.from(gun.color), Array.from(g.RARITES[4].color));
});

// ---------------------------------------------------------------- Carte

function generate(seed) {
  g.seed(seed);
  const grid = new Grille(WORLD_W(), WORLD_W(), 128);
  const carte = new Carte();
  carte.generate(grid);
  return { carte, grid };
}
function WORLD_W() { return g.WORLD.w; }

test('carte : villes, maisons, arbres, rochers générés dans les limites de l\'île', () => {
  for (const seed of [1, 2, 3, 4]) {
    const { carte } = generate(seed);
    assert.ok(carte.towns.length >= 4, `villes (${carte.towns.length})`);
    assert.ok(carte.houses.length >= 15);
    assert.ok(carte.trees.length >= CONFIG.carte.trees * 0.8);
    assert.ok(carte.rocks.length >= CONFIG.carte.rocks * 0.7);
    for (const e of [...carte.houses, ...carte.trees, ...carte.rocks]) {
      assert.ok(carte.inIsland(e.pos, 10), `${e.constructor.name} sur l'île`);
    }
  }
});

test('carte : aucun arbre ni rocher dans un bâtiment, aucune maison ne chevauche une autre', () => {
  const { carte } = generate(5);
  for (const t of carte.trees) for (const h of carte.houses) assert.ok(!h.covers(t.pos.x, t.pos.y, t.r), 'arbre dans une maison');
  for (const r of carte.rocks) for (const h of carte.houses) assert.ok(!h.covers(r.pos.x, r.pos.y, 0), 'rocher dans une maison');
  for (let i = 0; i < carte.houses.length; i++) {
    for (let j = i + 1; j < carte.houses.length; j++) {
      const a = carte.houses[i], b = carte.houses[j];
      const overlap = Math.abs(a.pos.x - b.pos.x) < (a.w + b.w) / 2 && Math.abs(a.pos.y - b.pos.y) < (a.h + b.h) / 2;
      assert.ok(!overlap, 'maisons superposées');
    }
  }
});

test('carte : le rivage est périodique et clampToIsland ramène un point dans l\'île', () => {
  const { carte } = generate(6);
  assert.ok(Math.abs(carte.radiusAt(0) - carte.radiusAt(2 * Math.PI)) < 1e-6);
  for (let a = 0; a < 6.3; a += 0.3) {
    assert.ok(carte.radiusAt(a) > carte.radius * 0.8 && carte.radiusAt(a) < carte.radius * 1.2);
  }
  const far = createVector(3100, 3100);
  assert.ok(!carte.inIsland(far));
  assert.ok(carte.clampToIsland(far, 20));
  assert.ok(carte.inIsland(far, 19));
  const inside = createVector(1600, 1600);
  assert.strictEqual(carte.clampToIsland(inside), false);
});

test('carte : isFree et randomPoint trouvent des emplacements libres sur l\'île', () => {
  const { carte, grid } = generate(7);
  for (let i = 0; i < 40; i++) {
    const p = carte.randomPoint(30);
    assert.ok(carte.inIsland(p, 40));
    assert.strictEqual(grid.query(p.x, p.y, 30).length, 0);
  }
  const house = carte.houses[0];
  assert.ok(!carte.isFree(house.pos.x, house.pos.y, 20));
});

test('carte : retirer une entité libère ses colliders', () => {
  const { carte, grid } = generate(8);
  const tree = carte.trees[0];
  assert.ok(grid.query(tree.pos.x, tree.pos.y, 2).length > 0);
  carte.removeEntity(tree, carte.trees);
  assert.ok(!grid.query(tree.pos.x, tree.pos.y, 2).some(c => c.parent === tree));
});

test('carte : les villes sont distantes et les routes les relient toutes', () => {
  const { carte } = generate(9);
  for (let i = 0; i < carte.towns.length; i++) {
    for (let j = i + 1; j < carte.towns.length; j++) {
      assert.ok(p5Distance(carte.towns[i].pos, carte.towns[j].pos) > 500);
    }
  }
  assert.strictEqual(carte.roads.length, carte.towns.length - 1);
  assert.ok(carte.chestSpots.length >= carte.houses.length * 0.9);
});
