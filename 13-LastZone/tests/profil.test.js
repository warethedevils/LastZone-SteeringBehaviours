const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(61);
const { Profil, SKINS, DEFIS, CONFIG, resetConfig } = g;

test.beforeEach(() => { resetConfig(); g.seed(3); });

function fakeStorage() {
  const data = {};
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}
const result = (over = {}) => ({ placement: 20, kills: 0, damage: 0, survival: 60, chests: 0, wood: 0, won: false, fighters: 24, ...over });

test('niveau : seuils d\'XP croissants, progression dans le niveau', () => {
  const p = new Profil(null);
  assert.strictEqual(p.level, 1);
  assert.strictEqual(Profil.xpForLevel(1), 0);
  assert.strictEqual(Profil.xpForLevel(2), CONFIG.progression.xpBase);
  assert.ok(Profil.xpForLevel(5) > Profil.xpForLevel(4));
  p.data.xp = CONFIG.progression.xpBase - 1;
  assert.strictEqual(p.level, 1);
  p.data.xp = CONFIG.progression.xpBase;
  assert.strictEqual(p.level, 2);
  p.data.xp = Profil.xpForLevel(3) + 50;
  assert.strictEqual(p.level, 3);
  const prog = p.levelProgress;
  assert.strictEqual(prog.current, 50);
  assert.strictEqual(prog.needed, Profil.xpForLevel(4) - Profil.xpForLevel(3));
  assert.ok(prog.ratio > 0 && prog.ratio < 1);
});

test('XP d\'un match : éliminations, survie, bonus de classement', () => {
  const base = Profil.xpForResult(result());
  assert.ok(Profil.xpForResult(result({ kills: 3 })) === base + 3 * CONFIG.progression.xpPerKill);
  assert.ok(Profil.xpForResult(result({ placement: 8 })) > base);
  assert.ok(Profil.xpForResult(result({ placement: 3 })) > Profil.xpForResult(result({ placement: 8 })));
  assert.ok(Profil.xpForResult(result({ placement: 1, won: true })) > Profil.xpForResult(result({ placement: 3 })));
  assert.ok(Profil.xpForResult(result({ survival: 300 })) > base);
});

test('défis : trois défis distincts au départ, remplacés une fois accomplis', () => {
  const p = new Profil(null);
  assert.strictEqual(p.challenges.length, 3);
  assert.strictEqual(new Set(p.data.challenges).size, 3);
  p.data.challenges = ['kills1', 'top10', 'win'];
  const reward = p.addResult(result({ kills: 2, placement: 6 }));
  assert.deepStrictEqual(Array.from(reward.completed.map(d => d.id)).sort(), ['kills1', 'top10']);
  assert.strictEqual(reward.challengeXp, 60 + 120);
  assert.strictEqual(p.data.challenges.length, 3, 'complété à nouveau');
  assert.ok(p.data.challenges.includes('win'));
  assert.ok(!p.data.challenges.includes('kills1') || DEFIS.length > 3);
  for (const d of DEFIS) assert.strictEqual(typeof d.test(result()), 'boolean');
});

test('addResult : statistiques cumulées, meilleur classement, historique borné, niveau gagné', () => {
  const p = new Profil(null);
  p.data.challenges = [];
  const r1 = p.addResult(result({ placement: 12, kills: 1, damage: 100, survival: 120 }));
  assert.strictEqual(p.data.matches, 1);
  assert.strictEqual(p.data.bestPlace, 12);
  const r2 = p.addResult(result({ placement: 1, won: true, kills: 5, damage: 500, survival: 300 }));
  assert.strictEqual(p.data.wins, 1);
  assert.strictEqual(p.data.kills, 6);
  assert.strictEqual(p.data.bestPlace, 1);
  assert.strictEqual(p.data.top10, 1);
  assert.strictEqual(p.data.damage, 600);
  assert.strictEqual(p.data.history[0].placement, 1);
  assert.strictEqual(r2.levelAfter, p.level);
  assert.ok(r1.xp > 0);
  for (let i = 0; i < 30; i++) p.addResult(result());
  assert.strictEqual(p.data.history.length, 12);
  assert.ok(p.level > 2);
});

test('tenues : déblocage par niveau, sélection refusée si verrouillée', () => {
  const p = new Profil(null);
  assert.ok(p.isUnlocked(0));
  assert.ok(!p.isUnlocked(SKINS.length - 1));
  assert.strictEqual(p.selectSkin(5), false);
  assert.strictEqual(p.data.skin, 0);
  p.data.xp = Profil.xpForLevel(SKINS[3].level);
  assert.ok(p.isUnlocked(3));
  assert.ok(p.selectSkin(3));
  assert.strictEqual(p.skin, SKINS[3]);
  p.data.skin = SKINS.length - 1;
  assert.strictEqual(p.skin, SKINS[0], 'une tenue verrouillée retombe sur la première');
  assert.ok(SKINS.every((s, i) => i === 0 || s.level >= SKINS[i - 1].level));
});

test('persistance : les données survivent, les réglages manquants reprennent leurs valeurs par défaut', () => {
  const storage = fakeStorage();
  const p = new Profil(storage);
  p.data.name = 'Alice';
  p.data.settings.volume = 0.3;
  p.addResult(result({ kills: 2 }));
  const again = new Profil(storage);
  assert.strictEqual(again.data.name, 'Alice');
  assert.strictEqual(again.data.settings.volume, 0.3);
  assert.strictEqual(again.data.matches, 1);
  storage.setItem('lastzone-profil', JSON.stringify({ name: 'Vieux', xp: 500 }));
  const old = new Profil(storage);
  assert.strictEqual(old.data.name, 'Vieux');
  assert.strictEqual(old.data.settings.difficulty, 'normal');
  assert.strictEqual(old.data.settings.fighters, 24);
  assert.strictEqual(old.challenges.length, 3);
});

test('persistance : stockage corrompu, plein ou absent sans erreur', () => {
  const storage = fakeStorage();
  storage.setItem('lastzone-profil', 'pas du json');
  assert.doesNotThrow(() => new Profil(storage));
  assert.strictEqual(new Profil(storage).data.matches, 0);
  const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.doesNotThrow(() => new Profil(full).addResult(result()));
  assert.doesNotThrow(() => new Profil(null).save());
});
