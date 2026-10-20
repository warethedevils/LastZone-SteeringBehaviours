const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadGame, VEHICLE_SOURCE, ORIGINAL_SOURCE, ROOT, FILES } = require('./loadGame.js');

const UI_FILES = ['ui.js', 'reseauvue.js', 'lobby.js', 'hud.js', 'ecrans.js', 'labo.js', 'labocomportements.js', 'son.js', 'sketch.js'];

test("vehicle.js : l'API d'origine est conservée et les comportements de base sont dans Vehicle", () => {
  const g = loadGame(1);
  const v = new g.Vehicle(0, 0);
  for (const name of ['seek', 'arrive', 'flee', 'pursue', 'evade', 'wander', 'separate', 'align', 'cohesion', 'avoid',
    'boundaries', 'followPath', 'applyForce', 'update', 'show', 'edges']) {
    assert.strictEqual(typeof v[name], 'function', name);
  }
  assert.ok(v.behaviors instanceof g.BehaviorManager, 'chaque Vehicle possède un BehaviorManager');
  // le fichier d'origine (4-Wander) est intact : on a seulement enrichi la copie du jeu
  assert.ok(fs.readFileSync(ORIGINAL_SOURCE, 'utf8').length > 0);
});

test('index.html charge tous les fichiers logiques dans le même ordre que les tests, puis l\'interface', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(s => !s.startsWith('libraries/'));
  assert.deepStrictEqual(scripts.filter(s => !UI_FILES.includes(s)), FILES);
  for (const ui of UI_FILES) assert.ok(scripts.includes(ui), ui);
  assert.strictEqual(scripts[scripts.length - 1], 'sketch.js');
});

test('chaque fichier du jeu est syntaxiquement valide', () => {
  const vm = require('vm');
  for (const file of fs.readdirSync(ROOT).filter(f => f.endsWith('.js'))) {
    assert.doesNotThrow(() => new vm.Script(fs.readFileSync(path.join(ROOT, file), 'utf8'), { filename: file }), file);
  }
});

test('un fichier par classe d\'entité, toutes héritent de Vehicle', () => {
  const entityFiles = ['arbre', 'rocher', 'batiment', 'mur', 'balle', 'butin', 'coffre', 'etincelle', 'largage',
    'tempete', 'bus', 'combattant', 'joueur', 'bot'];
  for (const name of entityFiles) {
    const source = fs.readFileSync(path.join(ROOT, name + '.js'), 'utf8');
    const classes = source.match(/^class \w+ extends \w+/gm) || [];
    assert.strictEqual(classes.length, 1, `${name}.js contient une seule classe d'entité`);
  }
  const g = loadGame(1);
  for (const Cls of [g.Arbre, g.Rocher, g.Batiment, g.Mur, g.Balle, g.Butin, g.Coffre, g.Etincelle, g.Largage,
    g.Tempete, g.Bus, g.Combattant, g.Joueur, g.Bot]) {
    assert.ok(Cls.prototype instanceof g.Vehicle, Cls.name);
  }
  assert.ok(g.Joueur.prototype instanceof g.Combattant && g.Bot.prototype instanceof g.Combattant);
});

test('toutes les entités d\'un match en cours sont des Vehicle', () => {
  const g = loadGame(2);
  g.seed(4);
  const m = new g.Match({ fighters: 8, autoplay: true });
  for (let i = 0; i < 60 * 25; i++) { m.step(1 / 60, null); m.events = []; }
  const all = [...m.fighters, ...m.bullets, ...m.butins, ...m.coffres, ...m.murs, ...m.sparks, ...m.largages,
    ...m.carte.trees, ...m.carte.rocks, ...m.carte.houses, m.storm];
  assert.ok(all.length > 300);
  for (const e of all) assert.ok(e instanceof g.Vehicle, e.constructor.name);
});

test('behaviors.js ne déplace rien directement (tout passe par applyForce)', () => {
  const behaviors = fs.readFileSync(path.join(ROOT, 'behaviors.js'), 'utf8');
  assert.ok(!/\.pos\.(add|set|x\s*=|y\s*=)/.test(behaviors));
});

test('les réseaux de neurones ne déplacent jamais directement un bot : ils choisissent un état, le steering fait le reste', () => {
  const cerveau = fs.readFileSync(path.join(ROOT, 'cerveau.js'), 'utf8');
  assert.ok(!/\.pos\b/.test(cerveau) && !/applyForce/.test(cerveau));
});

test('le debug est piloté par Vehicle.debug, synchronisé avec la case à cocher, sans voler les frappes des contrôles', () => {
  const sketch = fs.readFileSync(path.join(ROOT, 'sketch.js'), 'utf8');
  assert.ok(sketch.includes('labo.setDebug(Vehicle.debug)'));
  assert.ok(sketch.includes('isTypingTarget'));
});
