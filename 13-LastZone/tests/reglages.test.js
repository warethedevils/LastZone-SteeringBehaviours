// Labo des comportements : réglages du BehaviorManager d'un bot (poids, activation),
// copie aux autres bots, sauvegarde / chargement JSON validés, retour à l'origine.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(31);
const { Match, Bot, Reglages, BehaviorManager, resetConfig, createVector } = g;

test.beforeEach(() => { resetConfig(); g.seed(3); });

function bots(n = 3) {
  g.seed(3);
  const m = new Match({ fighters: n + 1, faune: false, vehicles: false });
  return m.fighters.filter(f => f instanceof Bot && f !== m.joueur);
}

class FakeStorage {
  constructor() { this.data = {}; }
  getItem(k) { return k in this.data ? this.data[k] : null; }
  setItem(k, v) { this.data[k] = String(v); }
}

test('réglages : tweak change le poids du comportement actif et de sa définition (il survit à un changement d\'état)', () => {
  const [bot] = bots();
  bot.behaviors.use('combat');
  assert.ok(Reglages.tweak(bot, 'engage', { weight: 2.5 }));
  assert.strictEqual(bot.behaviors.weightOf(bot.behaviors.get('engage')), 2.5);
  bot.behaviors.use('fuite');
  bot.behaviors.use('combat');
  assert.strictEqual(bot.behaviors.weightOf(bot.behaviors.get('engage')), 2.5, 'la définition a été modifiée');
});

test('réglages : un poids lu dans CONFIG (weightKey) est remplacé par la valeur réglée', () => {
  const [bot] = bots();
  bot.behaviors.use('butin');
  assert.ok(bot.behaviors.get('loot').weightKey);
  Reglages.tweak(bot, 'loot', { weight: 0.2 });
  assert.strictEqual(bot.behaviors.get('loot').weightKey, null);
  assert.strictEqual(bot.behaviors.weightOf(bot.behaviors.get('loot')), 0.2);
});

test('réglages : les poids sont bornés ; un comportement inconnu est refusé', () => {
  const [bot] = bots();
  bot.behaviors.use('zone');
  Reglages.tweak(bot, 'zone', { weight: 1000 });
  assert.strictEqual(bot.behaviors.get('zone').weight, Reglages.MAX_WEIGHT);
  Reglages.tweak(bot, 'zone', { weight: -4 });
  assert.strictEqual(bot.behaviors.get('zone').weight, 0);
  Reglages.tweak(bot, 'zone', { weight: NaN });
  assert.strictEqual(bot.behaviors.get('zone').weight, 0);
  assert.strictEqual(Reglages.tweak(bot, 'inexistant', { weight: 1 }), false);
});

test('réglages : désactiver un comportement supprime sa force, et reste désactivé après changement d\'état', () => {
  const [bot] = bots();
  bot.behaviors.use('combat');
  Reglages.tweak(bot, 'engage', { enabled: false });
  const ctx = { ringPoint: createVector(500, 500), obstacles: [], neighbors: [], island: { center: createVector(1600, 1600), radius: 1400, margin: 120 },
    zoneTarget: createVector(1600, 1600), zoneOutside: false, dodgeForce: null };
  bot.pos.set(100, 100);
  assert.ok(!('engage' in bot.behaviors.compute(ctx)));
  bot.behaviors.use('errance');
  bot.behaviors.use('combat');
  assert.strictEqual(bot.behaviors.isEnabled('engage'), false);
  Reglages.tweak(bot, 'engage', { enabled: true });
  assert.ok('engage' in bot.behaviors.compute(ctx));
});

test('réglages : copier les réglages d\'un bot aux autres', () => {
  const list = bots(4);
  const [a, ...others] = list;
  a.behaviors.use('fuite');
  Reglages.tweak(a, 'flee', { weight: 4 });
  Reglages.applyAll(others, Reglages.snapshot(a));
  for (const b of others) {
    b.behaviors.use('fuite');
    assert.strictEqual(b.behaviors.get('flee').weight, 4);
  }
  // les définitions sont des copies indépendantes
  Reglages.tweak(a, 'flee', { weight: 1 });
  others[0].behaviors.use('errance');
  others[0].behaviors.use('fuite');
  assert.strictEqual(others[0].behaviors.get('flee').weight, 4);
});

test('réglages : appliquer pendant qu\'un état est actif reconstruit ses comportements', () => {
  const [a, b] = bots(2);
  a.behaviors.use('combat');
  Reglages.tweak(a, 'engage', { weight: 3.3 });
  b.behaviors.use('combat');
  Reglages.apply(b, Reglages.snapshot(a));
  assert.strictEqual(b.behaviors.activeComplex, 'combat');
  assert.strictEqual(b.behaviors.get('engage').weight, 3.3);
});

test('réglages : retour aux comportements d\'origine', () => {
  const [bot] = bots();
  bot.behaviors.use('combat');
  Reglages.tweak(bot, 'engage', { weight: 5, enabled: false });
  Reglages.reset(bot);
  const e = bot.behaviors.get('engage');
  assert.strictEqual(e.weightKey, 'bot.weights.engage');
  assert.strictEqual(e.enabled, true);
});

test('réglages : sérialisation JSON aller-retour', () => {
  const [bot] = bots();
  bot.behaviors.use('errance');
  Reglages.tweak(bot, 'wander', { weight: 1.7 });
  const json = Reglages.serialize(bot);
  const snap = Reglages.parse(json);
  assert.ok(snap && snap.complex.errance);
  const wander = snap.complex.errance.find(e => e.name === 'wander');
  assert.strictEqual(wander.weight, 1.7);
  assert.ok(Object.keys(snap.complex).includes('combat'));
});

test('réglages : un JSON invalide ou hostile est refusé ou assaini', () => {
  assert.strictEqual(Reglages.parse('pas du json'), null);
  assert.strictEqual(Reglages.parse('null'), null);
  assert.strictEqual(Reglages.parse('{"complex": 3}'), null);
  const snap = Reglages.parse({ complex: { combat: [
    { name: 'x', type: 'comportementInconnu', weight: 1 },
    { name: 'engage', type: 'arrive', weight: 9999, args: ['ringPoint', {}, null, 3] },
    { type: 'wander', weight: 'abc' }
  ], inconnu: 'oups' } });
  assert.strictEqual(snap.complex.combat.length, 2, 'le comportement hors registre est écarté');
  assert.strictEqual(snap.complex.combat[0].weight, Reglages.MAX_WEIGHT);
  assert.deepStrictEqual(Array.from(snap.complex.combat[0].args), ['ringPoint', 3]);
  assert.strictEqual(snap.complex.combat[1].weight, 0);
  assert.strictEqual(snap.complex.inconnu, undefined);
});

test('réglages : apply ignore les comportements complexes que le bot ne connaît pas', () => {
  const [bot] = bots();
  Reglages.apply(bot, { complex: { piratage: [{ name: 'a', type: 'seek', weight: 1, args: ['x'] }] } });
  assert.ok(!bot.behaviors.complex.has('piratage'));
});

test('réglages : emplacements de sauvegarde nommés dans le stockage', () => {
  const [bot] = bots();
  const storage = new FakeStorage();
  bot.behaviors.use('fuite');
  Reglages.tweak(bot, 'flee', { weight: 3.9 });
  assert.strictEqual(Reglages.saveSlot(storage, 1, 'Peureux', bot), true);
  assert.strictEqual(Reglages.readAll(storage)[1].name, 'Peureux');
  assert.strictEqual(Reglages.readAll(storage)[0], null);
  const other = bots()[1];
  other.behaviors.use('fuite');
  Reglages.apply(other, Reglages.loadSlot(storage, 1));
  assert.strictEqual(other.behaviors.get('flee').weight, 3.9);
  assert.strictEqual(Reglages.loadSlot(storage, 0), null, 'emplacement vide');
  assert.strictEqual(Reglages.saveSlot(storage, 9, 'x', bot), false, 'emplacement invalide');
  assert.strictEqual(Reglages.saveSlot(null, 0, 'x', bot), false, 'pas de stockage');
});

test('réglages : un stockage corrompu ne plante pas', () => {
  const storage = new FakeStorage();
  storage.setItem(Reglages.KEY, '{{{{');
  assert.deepStrictEqual(Array.from(Reglages.readAll(storage)), []);
  storage.setItem(Reglages.KEY, JSON.stringify({ slots: [{ name: 'a', json: 'cassé' }] }));
  assert.strictEqual(Reglages.loadSlot(storage, 0), null);
});

test('réglages : BehaviorManager.save / load restent compatibles (comportements complexes)', () => {
  const [bot] = bots();
  bot.behaviors.use('combat');
  const json = bot.behaviors.save();
  const clone = new BehaviorManager(bot);
  clone.load(json);
  assert.strictEqual(clone.activeComplex, 'combat');
  assert.ok(clone.has('engage'));
});
