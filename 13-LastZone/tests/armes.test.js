const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(41);
const { WEAPONS, RARITES, SOINS, MUNITIONS, weaponStats, weaponDps, makeWeapon, makeHeal, rollIndex, rollKey, rollWeapon, rollHeal, itemColor, itemName } = g;

test.beforeEach(() => g.seed(5));

test('la rareté améliore les dégâts, la cadence, la précision et le rechargement', () => {
  for (const type of Object.keys(WEAPONS)) {
    const common = weaponStats(makeWeapon(type, 0));
    const legend = weaponStats(makeWeapon(type, 4));
    assert.ok(legend.damage > common.damage, type);
    assert.ok(legend.rate > common.rate);
    assert.ok(legend.spread < common.spread);
    assert.ok(legend.reload < common.reload);
    assert.strictEqual(legend.mag, common.mag, 'le chargeur ne change pas');
    assert.ok(weaponDps(makeWeapon(type, 4)) > weaponDps(makeWeapon(type, 0)));
  }
});

test('la rareté est ordonnée et colorée', () => {
  for (let i = 1; i < RARITES.length; i++) assert.ok(RARITES[i].mult > RARITES[i - 1].mult);
  assert.strictEqual(RARITES.length, 5);
  assert.deepStrictEqual(Array.from(itemColor(makeWeapon('fusil', 4))), Array.from(RARITES[4].color));
  assert.ok(Array.isArray(itemColor(null)));
});

test('dps : le fusil à pompe compte tous ses plombs, le sniper frappe fort mais lentement', () => {
  const shotgun = weaponDps(makeWeapon('pompe', 0));
  assert.ok(Math.abs(shotgun - WEAPONS.pompe.damage * WEAPONS.pompe.pellets * WEAPONS.pompe.rate) < 1e-9);
  const sniper = weaponStats(makeWeapon('sniper', 0));
  assert.ok(sniper.damage > 3 * weaponStats(makeWeapon('fusil', 0)).damage);
  assert.ok(sniper.rate < 1);
});

test('makeWeapon : chargeur plein ; makeHeal : type et quantité', () => {
  const w = makeWeapon('mitraillette', 2);
  assert.strictEqual(w.mag, WEAPONS.mitraillette.mag);
  assert.strictEqual(w.kind, 'arme');
  const h = makeHeal('trousse', 2);
  assert.strictEqual(h.kind, 'soin');
  assert.strictEqual(h.count, 2);
  assert.strictEqual(makeHeal('grand').kind, 'bouclier');
  assert.ok(itemName(w).length > 0 && itemName(h).length > 0);
});

test('soins : un soin lent restaure plus et plafonne plus haut', () => {
  assert.ok(SOINS.trousse.use > SOINS.bandage.use && SOINS.trousse.amount > SOINS.bandage.amount);
  assert.ok(SOINS.grand.use > SOINS.mini.use && SOINS.grand.amount > SOINS.mini.amount);
  assert.ok(SOINS.mini.cap < SOINS.grand.cap && SOINS.bandage.cap < SOINS.trousse.cap);
});

test('chaque arme a un type de munition connu', () => {
  for (const w of Object.values(WEAPONS)) assert.ok(MUNITIONS[w.ammo], w.nom);
});

test('rollIndex : fréquences proportionnelles aux poids, poids nul jamais tiré', () => {
  const counts = [0, 0, 0];
  for (let i = 0; i < 6000; i++) counts[rollIndex([1, 0, 3])]++;
  assert.strictEqual(counts[1], 0);
  assert.ok(Math.abs(counts[2] / counts[0] - 3) < 0.5, `${counts}`);
});

test('rollWeapon respecte les poids de rareté ; rollHeal donne des piles cohérentes', () => {
  for (let i = 0; i < 200; i++) assert.strictEqual(rollWeapon([0, 0, 0, 0, 1]).rarity, 4);
  for (let i = 0; i < 200; i++) assert.ok(rollWeapon([1, 0, 0, 0, 0]).rarity === 0);
  const kinds = new Set();
  for (let i = 0; i < 300; i++) {
    const h = rollHeal();
    kinds.add(h.type);
    assert.ok(h.count >= 1 && h.count <= SOINS[h.type].stack);
  }
  assert.ok(kinds.size >= 3);
  assert.ok(['pistolet', 'mitraillette', 'fusil', 'pompe', 'sniper'].includes(rollKey({ pistolet: 1, sniper: 1 })));
});
