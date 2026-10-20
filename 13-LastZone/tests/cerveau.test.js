const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(17);
const { Cerveau, Genome, Reseau, Evolution } = g;

test.beforeEach(() => g.seed(23));

function features(fill = 0.5) { return new Array(Cerveau.INPUTS).fill(fill); }
const allValid = () => new Array(Cerveau.STATES.length).fill(true);

test('dimensions : entrées nommées, sorties = états + 3 réglages + gains', () => {
  assert.strictEqual(Cerveau.INPUT_LABELS.length, Cerveau.INPUTS);
  assert.strictEqual(Cerveau.OUTPUTS, Cerveau.STATES.length + 3 + Cerveau.GAINS.length);
  assert.strictEqual(Cerveau.OUTPUT_LABELS.length, Cerveau.OUTPUTS);
  assert.deepStrictEqual(Array.from(Cerveau.SIZES), [Cerveau.INPUTS, ...Array.from(Cerveau.HIDDEN), Cerveau.OUTPUTS]);
  const c = Cerveau.random();
  assert.strictEqual(c.reseau.softmaxCount, Cerveau.STATES.length);
});

test('parameterCount : égal au nombre réel de poids et de biais du réseau', () => {
  assert.strictEqual(Cerveau.parameterCount(), Cerveau.newNetwork().parameterCount);
});

test('decide : un état masqué n\'est jamais choisi', () => {
  const c = Cerveau.random();
  const valid = [false, true, false, false, true, false];
  for (let i = 0; i < 300; i++) {
    const d = c.decide(features(g.sandbox.random()), valid);
    assert.ok(['errance', 'fuite'].includes(d.state), d.state);
  }
});

test('decide : un seul état possible = cet état', () => {
  const c = Cerveau.random();
  for (let k = 0; k < Cerveau.STATES.length; k++) {
    const valid = Cerveau.STATES.map((_, i) => i === k);
    assert.strictEqual(c.decide(features(), valid).state, Cerveau.STATES[k]);
  }
});

test('decide : probabilités, réglages bornés, mémorisation de la dernière décision', () => {
  const c = Cerveau.random();
  const d = c.decide(features(0.3), allValid());
  assert.ok(Math.abs(d.probs.reduce((s, p) => s + p, 0) - 1) < 1e-9);
  for (const v of [d.idealScale, d.aimTol, d.buildBias]) assert.ok(v >= -1 && v <= 1);
  assert.strictEqual(c.last, d);
});

test('decide : six gains de steering bornés dans [-1, 1]', () => {
  const c = Cerveau.random();
  const d = c.decide(features(0.4), allValid());
  assert.strictEqual(d.gains.length, Cerveau.GAINS.length);
  assert.strictEqual(Cerveau.OUTPUTS, Cerveau.STATES.length + 3 + Cerveau.GAINS.length);
  for (const v of d.gains) assert.ok(v >= -1 && v <= 1);
});

test('decide : température 0 = toujours l\'état le plus probable (parmi les permis)', () => {
  const c = Cerveau.random();
  c.temperature = 0;
  const x = features(0.7);
  const first = c.decide(x, allValid());
  const best = first.probs.indexOf(Math.max(...first.probs));
  for (let i = 0; i < 20; i++) assert.strictEqual(c.decide(x, allValid()).state, Cerveau.STATES[best]);
});

test('decide : le tirage suit les probabilités (température 1)', () => {
  const c = Cerveau.random();
  c.temperature = 1;
  const x = features(0.2);
  const probs = c.decide(x, allValid()).probs;
  const counts = new Array(Cerveau.STATES.length).fill(0);
  const n = 4000;
  for (let i = 0; i < n; i++) counts[Cerveau.STATES.indexOf(c.decide(x, allValid()).state)]++;
  for (let i = 0; i < counts.length; i++) assert.ok(Math.abs(counts[i] / n - probs[i]) < 0.04, `${Cerveau.STATES[i]}`);
});

test('mutate : réseau et personnalité changent, la température est conservée', () => {
  const c = Cerveau.random();
  c.temperature = 0.4;
  const m = c.mutate(1, 0.2, 1, 0.1);
  assert.ok(Reseau.distance(c.reseau, m.reseau) > 0.01);
  assert.ok(Genome.NAMES.some(n => m.genome.genes[n] !== c.genome.genes[n]));
  assert.strictEqual(m.temperature, 0.4);
  const same = c.mutate(0, 0.2, 0, 0.1);
  assert.strictEqual(Reseau.distance(c.reseau, same.reseau), 0);
});

test('crossover : mélange les poids et les gènes des deux parents', () => {
  const a = Cerveau.random(), b = Cerveau.random();
  const child = Cerveau.crossover(a, b);
  assert.ok(Reseau.distance(child.reseau, a.reseau) > 0 && Reseau.distance(child.reseau, b.reseau) > 0);
  for (const n of Genome.NAMES) assert.ok([a.genome.genes[n], b.genome.genes[n]].includes(child.genome.genes[n]));
});

test('JSON : aller-retour fidèle', () => {
  const c = Cerveau.random();
  const copy = Cerveau.fromJSON(JSON.parse(JSON.stringify(c.toJSON(6))));
  const x = features(0.6);
  const a = c.reseau.forward(x), b = copy.reseau.forward(x);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-4);
  for (const n of Genome.NAMES) assert.strictEqual(copy.genome.genes[n], c.genome.genes[n]);
});

test('le cerveau pré-entraîné (s\'il existe) a la bonne architecture et décide sans erreur', () => {
  const initial = Cerveau.initial();
  if (!initial) return;
  assert.deepStrictEqual(Array.from(initial.reseau.sizes), Array.from(Cerveau.SIZES));
  const d = initial.decide(features(0.4), allValid());
  assert.ok(Cerveau.STATES.includes(d.state));
});

test('le cerveau pré-entraîné distingue des situations évidentes', () => {
  const initial = Cerveau.initial();
  if (!initial) return;
  initial.temperature = 0;
  const idx = n => Cerveau.INPUT_LABELS.indexOf(n);
  const base = () => { const x = new Array(Cerveau.INPUTS).fill(0); x[idx('vie')] = 1; x[idx('bouclier')] = 1; x[idx('armé')] = 1;
    x[idx('puissance arme')] = 0.6; x[idx('chargeur')] = 1; x[idx('munitions')] = 1; x[idx('butin dist.')] = 1;
    for (const n of ['agressivité', 'prudence', 'précision', 'cupidité', 'anticipation', 'réflexes']) x[idx(n)] = 0.6;
    x[idx('perception')] = 0.5; return x; };
  // en pleine tempête : rejoindre la zone
  const storm = base(); storm[idx('hors zone')] = 1; storm[idx('zone proche')] = 1; storm[idx('écart zone')] = 0.6;
  assert.strictEqual(initial.decide(storm, allValid()).state, 'zone');
  // ennemi proche et visible, bien armé : combat
  const fight = base(); fight[idx('ennemi visible')] = 1; fight[idx('ennemi connu')] = 1; fight[idx('ennemi dist.')] = 0.3;
  fight[idx('ennemi vitalité')] = 0.8;
  assert.strictEqual(initial.decide(fight, allValid()).state, 'combat');
  // très blessé face à un ennemi visible : fuite
  const flee = base(); flee[idx('vie')] = 0.1; flee[idx('bouclier')] = 0; flee[idx('ennemi visible')] = 1; flee[idx('ennemi connu')] = 1;
  flee[idx('ennemi dist.')] = 0.4; flee[idx('touché récemment')] = 1;
  assert.strictEqual(initial.decide(flee, allValid()).state, 'fuite');
  // sans arme et un butin à côté : butin
  const loot = base(); loot[idx('armé')] = 0; loot[idx('puissance arme')] = 0; loot[idx('chargeur')] = 0; loot[idx('munitions')] = 0;
  loot[idx('butin dispo')] = 1; loot[idx('butin dist.')] = 0.2; loot[idx('butin valeur')] = 1;
  assert.strictEqual(initial.decide(loot, allValid()).state, 'butin');
});
