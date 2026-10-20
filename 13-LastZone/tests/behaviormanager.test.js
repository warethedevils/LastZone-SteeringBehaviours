const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(71);
const { Vehicle, BehaviorManager, CONFIG, resetConfig, createVector } = g;

test.beforeEach(() => { resetConfig(); g.seed(2); });

function vehicle(x = 0, y = 0) {
  const v = new Vehicle(x, y);
  v.vel = createVector(0, 0);
  v.maxSpeed = 4;
  v.maxForce = 0.2;
  v.r = 6;
  return v;
}

test('chaque Vehicle a un BehaviorManager qui référence son propriétaire', () => {
  const v = vehicle();
  assert.ok(v.behaviors instanceof BehaviorManager);
  assert.strictEqual(v.behaviors.owner, v);
  assert.notStrictEqual(vehicle().behaviors, v.behaviors);
});

test('add / has / get / remove / names', () => {
  const m = vehicle().behaviors;
  m.add('chasse', 'seek', 1.5, { args: ['cible'] }).add('errance', 'wander', 0.5);
  assert.deepStrictEqual(Array.from(m.names()), ['chasse', 'errance']);
  assert.ok(m.has('chasse') && !m.has('fuite'));
  assert.strictEqual(m.get('chasse').weight, 1.5);
  assert.ok(m.remove('chasse'));
  assert.ok(!m.has('chasse'));
  assert.strictEqual(m.remove('absent'), false);
  assert.throws(() => m.add('x', 'comportement-inexistant'), /inconnu/);
});

test('compute : les forces sont pondérées et limitées par maxForce avant pondération', () => {
  const v = vehicle();
  v.behaviors.add('seek', 'seek', 2, { args: ['cible'] });
  const forces = v.behaviors.compute({ cible: createVector(100, 0) });
  assert.ok(forces.seek.x > 0);
  assert.ok(Math.abs(forces.seek.mag() - 0.4) < 1e-9, '0,2 x poids 2');
});

test('apply : les forces sont appliquées au véhicule (acc) et renvoyées', () => {
  const v = vehicle();
  v.behaviors.add('seek', 'seek', 1, { args: ['cible'] }).add('flee', 'flee', 1, { args: ['menace'] });
  const applied = v.behaviors.apply({ cible: createVector(100, 0), menace: createVector(-100, 0) });
  assert.ok(Object.keys(applied).length === 2);
  assert.ok(Math.abs(v.acc.x - (applied.seek.x + applied.flee.x)) < 1e-9);
  assert.ok(v.acc.x > 0.3);
});

test('enable / disable / toggle : un comportement désactivé ne produit aucune force', () => {
  const v = vehicle();
  v.behaviors.add('seek', 'seek', 1, { args: ['cible'] });
  const ctx = { cible: createVector(50, 0) };
  assert.ok('seek' in v.behaviors.compute(ctx));
  assert.ok(v.behaviors.disable('seek'));
  assert.ok(!v.behaviors.isEnabled('seek'));
  assert.deepStrictEqual(Object.keys(v.behaviors.compute(ctx)), []);
  assert.strictEqual(v.behaviors.toggle('seek'), true);
  assert.ok('seek' in v.behaviors.compute(ctx));
  assert.strictEqual(v.behaviors.disable('absent'), false);
});

test('setWeight et setScale : poids et facteur (par exemple réglé par un réseau de neurones)', () => {
  const v = vehicle();
  v.behaviors.add('seek', 'seek', 1, { args: ['cible'] });
  const ctx = { cible: createVector(50, 0) };
  const base = v.behaviors.compute(ctx).seek.mag();
  v.behaviors.setScale('seek', 1.5);
  assert.ok(Math.abs(v.behaviors.compute(ctx).seek.mag() - base * 1.5) < 1e-9);
  v.behaviors.setWeight('seek', 0);
  assert.deepStrictEqual(Object.keys(v.behaviors.compute(ctx)), [], 'poids nul : ignoré');
});

test('weightKey : le poids est relu dans CONFIG à chaque image (réglage en direct par le Labo)', () => {
  const v = vehicle();
  v.behaviors.add('seek', 'seek', 99, { args: ['cible'], weightKey: 'bot.weights.loot' });
  const ctx = { cible: createVector(50, 0) };
  const before = v.behaviors.compute(ctx).seek.mag();
  assert.ok(Math.abs(before - 0.2 * CONFIG.bot.weights.loot) < 1e-9);
  CONFIG.bot.weights.loot = 3;
  assert.ok(Math.abs(v.behaviors.compute(ctx).seek.mag() - 0.6) < 1e-9);
});

test('comportement personnalisé : une fonction (vehicle, contexte) peut être ajoutée directement', () => {
  const v = vehicle();
  v.behaviors.add('poussee', (veh, ctx) => createVector(ctx.dx, 0), 2);
  const forces = v.behaviors.compute({ dx: 0.1 });
  assert.ok(Math.abs(forces.poussee.x - 0.2) < 1e-9);
  assert.strictEqual(v.behaviors.describe().length, 0, 'une fonction n\'est pas sérialisable');
});

test('un comportement qui renvoie null est ignoré', () => {
  const v = vehicle();
  v.behaviors.add('fuite', 'flee', 1, { args: ['menace'] });
  assert.deepStrictEqual(Object.keys(v.behaviors.compute({})), []);
});

test('comportements complexes : define / use remplacent l\'ensemble courant', () => {
  const v = vehicle();
  v.behaviors
    .define('chasse', [{ type: 'seek', weight: 1, args: ['cible'] }, { type: 'avoid', weight: 3, args: ['obstacles'] }])
    .define('repos', [{ type: 'wander', weight: 0.5 }]);
  assert.ok(v.behaviors.use('chasse'));
  assert.deepStrictEqual(Array.from(v.behaviors.names()), ['seek', 'avoid']);
  assert.strictEqual(v.behaviors.activeComplex, 'chasse');
  assert.ok(v.behaviors.use('repos'));
  assert.deepStrictEqual(Array.from(v.behaviors.names()), ['wander']);
  assert.strictEqual(v.behaviors.use('inconnu'), false);
  assert.strictEqual(v.behaviors.activeComplex, 'repos');
});

test('use : activer un complexe déjà actif conserve les réglages courants', () => {
  const v = vehicle();
  v.behaviors.define('chasse', [{ type: 'seek', weight: 1, args: ['cible'] }]);
  v.behaviors.use('chasse');
  v.behaviors.setScale('seek', 2);
  v.behaviors.use('chasse');
  assert.strictEqual(v.behaviors.get('seek').scale, 2);
});

test('save / load : les comportements complexes et l\'état courant survivent à un aller-retour JSON', () => {
  const a = vehicle();
  a.behaviors
    .define('chasse', [{ type: 'pursue', weight: 1.2, args: ['proie'] }, { type: 'separate', weight: 1.5 }])
    .define('fuite', [{ type: 'evade', weight: 2, args: ['menace'] }]);
  a.behaviors.use('chasse');
  a.behaviors.setWeight('separate', 0.7);
  a.behaviors.disable('pursue');
  const json = a.behaviors.save();
  assert.strictEqual(typeof json, 'string');
  const b = vehicle();
  b.behaviors.load(json);
  assert.deepStrictEqual(Array.from(b.behaviors.names()), ['pursue', 'separate']);
  assert.strictEqual(b.behaviors.get('separate').weight, 0.7);
  assert.strictEqual(b.behaviors.isEnabled('pursue'), false);
  assert.strictEqual(b.behaviors.activeComplex, 'chasse');
  assert.ok(b.behaviors.use('fuite'), 'les complexes sont restaurés');
  assert.deepStrictEqual(Array.from(b.behaviors.names()), ['evade']);
});

test('load ignore les comportements dont le type n\'existe plus dans le registre', () => {
  const v = vehicle();
  v.behaviors.load({ complex: {}, current: [{ name: 'x', type: 'disparu', weight: 1, args: [] }, { name: 'w', type: 'wander', weight: 1, args: [] }] });
  assert.deepStrictEqual(Array.from(v.behaviors.names()), ['w']);
});

test('register : un comportement enregistré devient utilisable (et sauvegardable) par son nom', () => {
  BehaviorManager.register('toujoursDroite', (veh, ctx, amount = 0.1) => createVector(amount, 0));
  const v = vehicle();
  v.behaviors.add('droite', 'toujoursDroite', 1, { args: [0.15] });
  assert.ok(Math.abs(v.behaviors.compute({}).droite.x - 0.15) < 1e-9);
  const w = vehicle();
  w.behaviors.load(v.behaviors.save());
  assert.ok(Math.abs(w.behaviors.compute({}).droite.x - 0.15) < 1e-9);
});

// ---------- comportements de base de Vehicle ----------

test('Vehicle.flee respecte steering = désirée - vitesse (et pas de NaN au même point)', () => {
  const v = vehicle(100, 100);
  const f = v.flee(createVector(50, 100));
  assert.ok(f.x > 0 && f.mag() <= v.maxForce + 1e-9);
  const same = v.flee(createVector(100, 100));
  assert.ok(Number.isFinite(same.x) && same.mag() > 0);
});

test('Vehicle.pursue anticipe, Vehicle.evade fuit la position future', () => {
  const hunter = vehicle(0, 0);
  const prey = vehicle(100, 0);
  prey.vel = createVector(0, 3);
  assert.ok(hunter.pursue(prey).y > hunter.seek(prey.pos).y);
  assert.ok(vehicle(0, 0).evade(prey).x < 0);
});

test('Vehicle.arrive ralentit près de la cible grâce à slowRadius', () => {
  const v = vehicle(0, 0);
  v.vel = createVector(3, 0);
  assert.ok(v.arrive(createVector(10, 0)).x < 0, 'trop vite pour la distance : freine');
  assert.ok(v.arrive(createVector(1000, 0)).x > 0 || v.vel.x >= v.maxSpeed - 1);
  v.slowRadius = 5;
  v.vel = createVector(3, 0);
  assert.ok(v.arrive(createVector(10, 0)).x >= 0, 'rayon de freinage réduit : ne freine pas encore');
});

test('Vehicle.separate / align / cohesion sont des méthodes de base', () => {
  const v = vehicle(0, 0);
  assert.strictEqual(v.separate([]).mag(), 0);
  assert.ok(v.separate([vehicle(10, 0)]).x < 0);
  const n = vehicle(5, 5);
  n.vel = createVector(3, 0);
  assert.ok(v.align([n]).x > 0);
  assert.ok(v.cohesion([vehicle(100, 0)]).x > 0);
});

test('Vehicle.avoid et Vehicle.boundaries', () => {
  const v = vehicle(0, 0);
  v.vel = createVector(3, 0);
  assert.ok(v.avoid([{ pos: createVector(40, -5), r: 20 }]).y > 0);
  const rect = { x: 0, y: 0, w: 1000, h: 600 };
  assert.strictEqual(vehicle(500, 300).boundaries(rect, 40).mag(), 0);
  const edge = vehicle(10, 300);
  edge.vel = createVector(-2, 0);
  assert.ok(edge.boundaries(rect, 40).x > 0);
});
