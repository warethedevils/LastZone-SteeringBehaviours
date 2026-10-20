// Tutoriel : la suite de conseils avance quand le joueur accomplit l'action décrite.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(51);
const { Tutoriel } = g;

test.beforeEach(() => Tutoriel.reset());

function fakeMatch(over = {}) {
  return { time: 0, teamMode: false, joueur: { phase: 'bus', weapon: null, alive: true }, ...over };
}

test('tutoriel : commence par sauter du bus', () => {
  const m = fakeMatch();
  const tip = Tutoriel.text(m);
  assert.strictEqual(tip.number, 1);
  assert.ok(tip.text.includes('ESPACE'));
});

test('tutoriel : avance saut -> chute -> butin -> tir selon les actions du joueur', () => {
  const m = fakeMatch();
  assert.strictEqual(Tutoriel.update(m).id, 'saut');
  m.joueur.phase = 'chute';
  assert.strictEqual(Tutoriel.update(m).id, 'chute');
  m.joueur.phase = 'sol';
  assert.strictEqual(Tutoriel.update(m).id, 'butin');
  m.joueur.weapon = { type: 'fusil' };
  assert.strictEqual(Tutoriel.update(m).id, 'tir');
  Tutoriel.consume(m, [{ type: 'shot', by: {} }]);
  assert.strictEqual(Tutoriel.update(m).id, 'tir', 'le tir d\'un autre ne compte pas');
  Tutoriel.consume(m, [{ type: 'shot', by: m.joueur }]);
  assert.strictEqual(Tutoriel.update(m).id, 'zone');
});

test('tutoriel : les conseils d\'information passent au bout de leur délai', () => {
  const m = fakeMatch({ joueur: { phase: 'sol', weapon: { type: 'fusil' }, alive: true } });
  Tutoriel.shots = 1;
  assert.strictEqual(Tutoriel.update(m).id, 'zone');
  m.time = 9.9;
  assert.strictEqual(Tutoriel.update(m).id, 'zone');
  m.time = 10;
  assert.strictEqual(Tutoriel.update(m).id, 'faune', 'le conseil « équipe » est sauté en solo');
});

test('tutoriel : le conseil d\'équipe n\'existe qu\'en mode équipe, et attend l\'ordre T', () => {
  const m = fakeMatch({ teamMode: true, joueur: { phase: 'sol', weapon: { type: 'fusil' }, alive: true } });
  Tutoriel.shots = 1;
  Tutoriel.update(m);
  m.time = 10;
  assert.strictEqual(Tutoriel.update(m).id, 'equipe');
  const tip = Tutoriel.text(m);
  assert.strictEqual(tip.total, 8);
  Tutoriel.consume(m, [{ type: 'ordre', ordre: 'suivre' }]);
  assert.strictEqual(Tutoriel.update(m).id, 'faune');
});

test('tutoriel : plusieurs conseils déjà accomplis sont franchis d\'un coup', () => {
  const m = fakeMatch({ joueur: { phase: 'sol', weapon: { type: 'fusil' }, alive: true } });
  Tutoriel.shots = 3;
  assert.strictEqual(Tutoriel.update(m).id, 'zone');
});

test('tutoriel : fini après le dernier conseil, ou quand on le passe', () => {
  const m = fakeMatch({ joueur: { phase: 'sol', weapon: { type: 'fusil' }, alive: true } });
  Tutoriel.shots = 1;
  for (let t = 0; t < 200 && !Tutoriel.finished; t += 5) { m.time = t; Tutoriel.update(m); }
  assert.ok(Tutoriel.finished);
  assert.strictEqual(Tutoriel.text(m), null);
  Tutoriel.reset();
  assert.ok(!Tutoriel.finished);
  Tutoriel.skip();
  assert.ok(Tutoriel.finished);
  assert.strictEqual(Tutoriel.text(fakeMatch()), null);
});

test('tutoriel : le joueur éliminé ne bloque pas la suite', () => {
  const m = fakeMatch({ joueur: { phase: 'mort', weapon: null, alive: false } });
  assert.notStrictEqual(Tutoriel.update(m) && Tutoriel.update(m).id, 'butin');
});

test('tutoriel : le profil mémorise que le tutoriel est fini', () => {
  assert.strictEqual(g.Profil.defaults().settings.tutorielFini, false);
});
