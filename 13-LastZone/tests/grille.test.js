const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(37);
const { Grille, createVector } = g;

const obj = (x, y, r = 10) => ({ pos: createVector(x, y), r });

test('query : trouve les objets proches (rayons inclus), pas les lointains, sans doublon', () => {
  const grille = new Grille(1000, 1000, 100);
  const near = obj(500, 500, 30);
  const edge = obj(500 + 60 + 30, 500, 30);       // disques tangents : distance = 60 + 30
  const far = obj(900, 900);
  [near, edge, far].forEach(o => grille.insert(o));
  const found = grille.query(500, 500, 60);
  assert.ok(found.includes(near));
  assert.ok(found.includes(edge), 'contact exact : inclus');
  assert.ok(!found.includes(far));
  assert.strictEqual(new Set(found).size, found.length);
});

test('query : un grand objet à cheval sur plusieurs cellules n\'est renvoyé qu\'une fois', () => {
  const grille = new Grille(1000, 1000, 100);
  const big = obj(300, 300, 150);
  grille.insert(big);
  const found = grille.query(300, 300, 200);
  assert.strictEqual(found.filter(o => o === big).length, 1);
  assert.ok(grille.query(420, 300, 5).includes(big), 'trouvé depuis une cellule voisine');
});

test('remove retire l\'objet de toutes ses cellules', () => {
  const grille = new Grille(1000, 1000, 100);
  const big = obj(300, 300, 150);
  grille.insert(big);
  grille.remove(big);
  assert.strictEqual(grille.query(300, 300, 400).length, 0);
  assert.doesNotThrow(() => grille.remove(big));
});

test('hors des limites : positions bornées sans erreur', () => {
  const grille = new Grille(500, 500, 100);
  const out = obj(-50, 700, 10);
  assert.doesNotThrow(() => grille.insert(out));
  assert.doesNotThrow(() => grille.query(-400, 900, 50));
});

test('segmentCircle : contact, tangence, début dans le disque, trop court', () => {
  const a = createVector(0, 0);
  const center = createVector(100, 0);
  assert.ok(Math.abs(Grille.segmentCircle(a, 200, 0, 200, center, 20) - 0.4) < 1e-9, 'entre à x = 80');
  assert.strictEqual(Grille.segmentCircle(a, 50, 0, 50, center, 20), null, 'segment trop court');
  assert.strictEqual(Grille.segmentCircle(a, 200, 0, 200, createVector(100, 21), 20), null, 'passe à côté');
  assert.ok(Grille.segmentCircle(a, 200, 0, 200, createVector(100, 20), 20) !== null, 'tangent : touche');
  assert.strictEqual(Grille.segmentCircle(createVector(95, 0), 100, 0, 100, center, 20), 0, 'départ dans le disque');
  assert.strictEqual(Grille.segmentCircle(a, 0, 0, 0, center, 20), null, 'segment nul');
});

test('segmentHit : renvoie le premier obstacle touché, le filtre et la marge sont respectés', () => {
  const grille = new Grille(1000, 1000, 100);
  const first = obj(300, 500, 20);
  const second = obj(600, 500, 20);
  [second, first].forEach(o => grille.insert(o));
  const a = createVector(100, 500);
  const b = createVector(900, 500);
  const hit = grille.segmentHit(a, b);
  assert.strictEqual(hit.obj, first);
  assert.ok(hit.t < 0.3);
  assert.strictEqual(grille.segmentHit(a, b, 0, o => o !== first).obj, second, 'filtre');
  assert.strictEqual(grille.segmentHit(a, createVector(250, 500)), null, 'segment qui s\'arrête avant');
  const near = obj(500, 530, 20);
  grille.insert(near);
  assert.strictEqual(grille.segmentHit(createVector(450, 500), createVector(550, 500), 0, o => o === near), null, 'trop loin');
  assert.ok(grille.segmentHit(createVector(450, 500), createVector(550, 500), 15, o => o === near), 'marge ajoutée');
});

test('segmentHit : segment diagonal et très long', () => {
  const grille = new Grille(3200, 3200, 128);
  const target = obj(1600, 1600, 30);
  grille.insert(target);
  const hit = grille.segmentHit(createVector(0, 0), createVector(3200, 3200));
  assert.ok(hit && hit.obj === target);
});
