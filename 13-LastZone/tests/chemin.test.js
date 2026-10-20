const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(5);
const { Chemin, Behaviors, Vehicle, createVector } = g;

function square() {
  const c = new Chemin(20);
  c.addPoint(0, 0);
  c.addPoint(100, 0);
  c.addPoint(100, 100);
  c.addPoint(0, 100);
  return c;
}

test('project : point le plus proche sur le segment, borné aux extrémités', () => {
  const c = square();
  const p = c.project(createVector(50, -30));
  assert.ok(Math.abs(p.point.x - 50) < 1e-9 && Math.abs(p.point.y) < 1e-9);
  assert.ok(Math.abs(p.distance - 30) < 1e-9);
  const beyond = c.project(createVector(-40, -40));
  assert.ok(Math.abs(beyond.point.x) < 1e-9 && Math.abs(beyond.point.y) < 1e-9, 'borné au coin');
});

test('distanceTo vaut 0 sur le chemin', () => {
  const c = square();
  assert.ok(c.distanceTo(createVector(100, 40)) < 1e-9);
});

test('pointAhead avance le long du chemin et passe les coins', () => {
  const c = square();
  const proj = c.project(createVector(60, 0));
  const a = c.pointAhead(proj, 20);
  assert.ok(Math.abs(a.x - 80) < 1e-9 && Math.abs(a.y) < 1e-9);
  const corner = c.pointAhead(proj, 80);   // 40 jusqu'au coin + 40 le long du segment suivant
  assert.ok(Math.abs(corner.x - 100) < 1e-9 && Math.abs(corner.y - 40) < 1e-9);
  const zero = c.pointAhead(proj, 0);
  assert.ok(Math.abs(zero.x - 60) < 1e-9);
});

test('pointAhead : le chemin boucle', () => {
  const c = square();
  const proj = c.project(createVector(0, 70));   // dernier segment (0,100)->(0,0)? non : segment 3 va de (0,100) à (0,0)
  const p = c.pointAhead(proj, 500);
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
});

test('pointAtLength : abscisse curviligne, modulo la longueur totale', () => {
  const c = square();
  assert.strictEqual(c.total, 400);
  const p = c.pointAtLength(150);
  assert.ok(Math.abs(p.x - 100) < 1e-9 && Math.abs(p.y - 50) < 1e-9);
  const wrapped = c.pointAtLength(150 + 400);
  assert.ok(Math.abs(wrapped.x - p.x) < 1e-9);
  const negative = c.pointAtLength(-50);
  assert.ok(Math.abs(negative.x - 0) < 1e-9 && Math.abs(negative.y - 50) < 1e-9);
});

test('Chemin.random : courbe fermée dans les limites', () => {
  const bounds = { x: 0, y: 0, w: 1280, h: 720 };
  const c = Chemin.random(bounds, 38, 44);
  assert.strictEqual(c.points.length, 44);
  for (const p of c.points) {
    assert.ok(p.x > 38 && p.x < 1280 - 38 && p.y > 38 && p.y < 720 - 38);
  }
});

test('followPath : loin du couloir, la force ramène vers le chemin', () => {
  const c = square();
  const v = new Vehicle(50, -80);
  v.vel = createVector(1, 0);
  v.maxSpeed = 3;
  v.maxForce = 0.2;
  const f = Behaviors.followPath(v, c, 20, 30, 0.5);
  assert.ok(f.y > 0, 'tire vers le chemin (vers le bas)');
  assert.ok(f.mag() <= v.maxForce + 1e-9);
});

test('followPath : dans le couloir, la force est atténuée par insideGain', () => {
  const c = square();
  const make = () => {
    const v = new Vehicle(50, 2);
    v.vel = createVector(0.5, 0);   // position future (60, 2) : dans le couloir de rayon 20
    v.maxSpeed = 3;
    v.maxForce = 0.2;
    return v;
  };
  const full = Behaviors.followPath(make(), c, 20, 30, 1);
  const half = Behaviors.followPath(make(), c, 20, 30, 0.5);
  const none = Behaviors.followPath(make(), c, 20, 30, 0);
  assert.ok(full.mag() > 0);
  assert.ok(Math.abs(half.mag() - full.mag() / 2) < 1e-9);
  assert.strictEqual(none.mag(), 0);
});

test('un véhicule qui suit le chemin y reste après plusieurs tours', () => {
  const bounds = { x: 0, y: 0, w: 1280, h: 720 };
  const c = Chemin.random(bounds, 38, 44);
  const v = new Vehicle(c.points[0].x, c.points[0].y);
  v.vel = createVector(1, 0);
  v.maxSpeed = 2;
  v.maxForce = 0.1;
  let worst = 0;
  for (let i = 0; i < 4000; i++) {
    v.applyForce(Behaviors.followPath(v, c, 20, 34, 1));
    v.update();
    if (i > 200) worst = Math.max(worst, c.distanceTo(v.pos));
  }
  assert.ok(worst < c.radius * 1.8, `reste près du couloir (écart max ${worst.toFixed(1)})`);
});
