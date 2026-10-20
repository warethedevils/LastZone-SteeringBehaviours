const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(11);
const { Behaviors, Vehicle, createVector } = g;

function vehicle(x, y, vx = 0, vy = 0) {
  const v = new Vehicle(x, y);
  v.vel = createVector(vx, vy);
  v.maxSpeed = 4;
  v.maxForce = 0.2;
  v.r = 6;
  return v;
}

test('steerToward : steering = désirée - vitesse, limité à maxForce', () => {
  const v = vehicle(0, 0, 1, 0);
  const f = Behaviors.steerToward(v, createVector(0, 4));
  assert.ok(Math.abs(f.mag() - 0.2) < 1e-9, 'force limitée à maxForce');
  assert.ok(f.y > 0 && f.x < 0, 'direction de (0,4) - (1,0)');
  const small = Behaviors.steerToward(v, createVector(1.05, 0));
  assert.ok(Math.abs(small.x - 0.05) < 1e-9, 'sous la limite, la force est exacte');
});

test('flee : la force pousse à l\'opposé du point, jamais plus que maxForce', () => {
  const v = vehicle(100, 100);
  const f = Behaviors.flee(v, createVector(50, 100));
  assert.ok(f.x > 0, 'fuit vers la droite');
  assert.ok(f.mag() <= v.maxForce + 1e-9);
});

test('flee : au même point, une direction est choisie (pas de NaN)', () => {
  const v = vehicle(10, 10);
  const f = Behaviors.flee(v, createVector(10, 10));
  assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y));
  assert.ok(f.mag() > 0);
});

test('pursue vise la position future de la cible', () => {
  const hunter = vehicle(0, 0);
  const prey = vehicle(100, 0, 0, 3);
  const f = Behaviors.pursue(hunter, prey);
  assert.ok(f.y > 0, 'anticipe vers le bas');
  const direct = hunter.seek(prey.pos);
  assert.ok(f.y > direct.y, 'plus incliné qu\'une simple poursuite');
});

test('predictPosition est plafonné et nul quand la cible est immobile', () => {
  const hunter = vehicle(0, 0);
  const still = vehicle(100, 0);
  const p = Behaviors.predictPosition(hunter, still);
  assert.strictEqual(p.x, 100);
  const far = vehicle(10000, 0, 0, 1);
  assert.ok(Behaviors.predictPosition(hunter, far, 30).y <= 30 + 1e-9);
});

test('evade est à l\'opposé de la position future', () => {
  const v = vehicle(0, 0);
  const threat = vehicle(60, 0, -1, 0);
  const f = Behaviors.evade(v, threat);
  assert.ok(f.x < 0);
});

test('séparation : nulle sans voisin, répulsive avec voisin, plus forte quand proche', () => {
  const v = vehicle(0, 0);
  assert.strictEqual(Behaviors.separation(v, []).mag(), 0);
  const near = vehicle(10, 0);
  const f = Behaviors.separation(v, [near]);
  assert.ok(f.x < 0, 'repoussé vers la gauche');
  assert.ok(f.mag() <= v.maxForce + 1e-9);
  // deux voisins symétriques : s'annulent
  const sym = Behaviors.separation(v, [vehicle(10, 0), vehicle(-10, 0)]);
  assert.ok(sym.mag() < 1e-9);
});

test('alignement : adopte la vitesse des voisins', () => {
  const v = vehicle(0, 0, 0, 0);
  assert.strictEqual(Behaviors.alignment(v, []).mag(), 0);
  const f = Behaviors.alignment(v, [vehicle(5, 5, 3, 0), vehicle(9, 9, 3, 0)]);
  assert.ok(f.x > 0 && Math.abs(f.y) < 1e-9);
  const f0 = Behaviors.alignment(v, [vehicle(5, 5, 0, 0)]);
  assert.strictEqual(f0.mag(), 0, 'voisins immobiles : rien à imiter');
});

test('cohésion : vers le centre de masse', () => {
  const v = vehicle(0, 0);
  assert.strictEqual(Behaviors.cohesion(v, []).mag(), 0);
  const f = Behaviors.cohesion(v, [vehicle(100, 0), vehicle(100, 100)]);
  assert.ok(f.x > 0 && f.y > 0);
  const onCenter = Behaviors.cohesion(vehicle(50, 0), [vehicle(50, 0)]);
  assert.strictEqual(onCenter.mag(), 0, 'déjà au centre : force nulle');
});

test('neighbors : seuil de rayon inclusif, soi-même exclu', () => {
  const v = vehicle(0, 0);
  const on = vehicle(60, 0);
  const out = vehicle(60.01, 0);
  const found = Behaviors.neighbors(v, [v, on, out], 60);
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0], on);
});

test('avoidObstacles : rien si loin ou immobile, répulsion si l\'obstacle est devant', () => {
  const v = vehicle(0, 0, 3, 0);
  assert.strictEqual(Behaviors.avoidObstacles(v, []).mag(), 0);
  assert.strictEqual(Behaviors.avoidObstacles(v, [{ pos: createVector(900, 0), r: 20 }]).mag(), 0);
  const stopped = vehicle(0, 0, 0, 0);
  assert.strictEqual(Behaviors.avoidObstacles(stopped, [{ pos: createVector(10, 0), r: 20 }]).mag(), 0);
  // obstacle légèrement au-dessus de la trajectoire : on est poussé vers le bas
  const f = Behaviors.avoidObstacles(v, [{ pos: createVector(40, -5), r: 20 }]);
  assert.ok(f.mag() > 0);
  assert.ok(f.y > 0, 'dévie du côté opposé');
  assert.ok(f.mag() <= v.maxForce + 1e-9);
});

test('avoidObstacles : ignore le véhicule lui-même', () => {
  const v = vehicle(0, 0, 3, 0);
  v.r = 20;
  assert.strictEqual(Behaviors.avoidObstacles(v, [v]).mag(), 0);
});

test('boundaries : nulle à l\'intérieur, pousse vers l\'intérieur près des bords', () => {
  const rect = { x: 0, y: 0, w: 1000, h: 600 };
  assert.strictEqual(Behaviors.boundaries(vehicle(500, 300, 1, 0), rect, 40).mag(), 0);
  assert.ok(Behaviors.boundaries(vehicle(10, 300, -2, 0), rect, 40).x > 0, 'bord gauche');
  assert.ok(Behaviors.boundaries(vehicle(990, 300, 2, 0), rect, 40).x < 0, 'bord droit');
  assert.ok(Behaviors.boundaries(vehicle(500, 5, 0, -2), rect, 40).y > 0, 'bord haut');
  assert.ok(Behaviors.boundaries(vehicle(500, 595, 0, 2), rect, 40).y < 0, 'bord bas');
  const corner = Behaviors.boundaries(vehicle(5, 5, -2, -2), rect, 40);
  assert.ok(corner.mag() <= 0.2 + 1e-9);
  // exactement sur la marge : pas encore de force (seuil strict)
  assert.strictEqual(Behaviors.boundaries(vehicle(40, 300, -1, 0), rect, 40).mag(), 0);
});

test('arriveBehind : ralentit à la distance de suivi, jamais plus que maxForce', () => {
  const v = vehicle(0, 0, 3, 0);
  const far = Behaviors.arriveBehind(v, createVector(300, 0), 20);
  assert.ok(far.x > 0 && far.mag() <= v.maxForce + 1e-9);
  const atSpacing = Behaviors.arriveBehind(vehicle(0, 0, 3, 0), createVector(20, 0), 20);
  assert.ok(atSpacing.x < 0, 'à la distance voulue, freine');
  assert.strictEqual(Behaviors.arriveBehind(vehicle(5, 5), createVector(5, 5), 20).mag(), 0);
});

test('applyWeighted : applique chaque force pondérée et la retourne', () => {
  const v = vehicle(0, 0);
  const applied = Behaviors.applyWeighted(v, {
    a: [createVector(1, 0), 2],
    b: [createVector(0, 1), 0.5]
  });
  assert.strictEqual(v.acc.x, 2);
  assert.strictEqual(v.acc.y, 0.5);
  assert.strictEqual(applied.a.x, 2);
});

test('composition : la somme pondérée d\'un seek et d\'un évitement reste finie', () => {
  const v = vehicle(0, 0, 2, 0);
  Behaviors.applyWeighted(v, {
    seek: [v.seek(createVector(400, 0)), 1],
    avoid: [Behaviors.avoidObstacles(v, [{ pos: createVector(60, 3), r: 25 }]), 3]
  });
  assert.ok(Number.isFinite(v.acc.x) && Number.isFinite(v.acc.y));
});

// ---------------------------------------------------------------- Nouveaux comportements

test('leadPoint : le projectile touche une cible mobile', () => {
  const shooter = createVector(0, 0);
  const pos = createVector(200, 0);
  const vel = createVector(0, 3);
  const bulletSpeed = 12;
  const aim = Behaviors.leadPoint(shooter, pos, vel, bulletSpeed);
  assert.ok(aim.y > 0, 'vise devant la cible qui descend');
  // simulation : la balle part vers aim, la cible avance
  const dir = aim.copy().normalize().mult(bulletSpeed);
  let bullet = createVector(0, 0);
  let target = pos.copy();
  let best = Infinity;
  for (let i = 0; i < 800; i++) {          // pas de 0,1 image : mouvement continu
    bullet.add(dir.copy().mult(0.1));
    target.add(vel.copy().mult(0.1));
    best = Math.min(best, bullet.dist(target));
  }
  assert.ok(best < 1, `distance minimale ${best.toFixed(2)}`);
});

test('leadPoint : cible immobile, cible trop rapide, tireur sur la cible', () => {
  const s = createVector(0, 0);
  const still = Behaviors.leadPoint(s, createVector(100, 50), createVector(0, 0), 12);
  assert.ok(Math.abs(still.x - 100) < 1e-9 && Math.abs(still.y - 50) < 1e-9);
  // cible qui s'enfuit plus vite que le tir : repli sur sa position
  const fast = Behaviors.leadPoint(s, createVector(100, 0), createVector(30, 0), 12);
  assert.ok(Math.abs(fast.x - 100) < 1e-9);
  const same = Behaviors.leadPoint(s, createVector(0, 0), createVector(2, 0), 12);
  assert.ok(Number.isFinite(same.x) && Number.isFinite(same.y));
});

test('sidestep : esquive latérale d\'un tir qui arrive, rien s\'il est passé ou s\'il rate', () => {
  const v = vehicle(100, 3);
  v.r = 8;
  // tir qui part de x=0 vers la droite, passe à 3 px de nous
  const f = Behaviors.sidestep(v, createVector(0, 0), createVector(12, 0));
  assert.ok(f.y > 0, 'on se pousse du côté où l\'on est (vers le bas)');
  assert.ok(f.mag() <= v.maxForce + 1e-9);
  const passed = Behaviors.sidestep(v, createVector(200, 0), createVector(12, 0));
  assert.strictEqual(passed.mag(), 0, 'le tir est déjà derrière');
  const far = vehicle(100, 200);
  assert.strictEqual(Behaviors.sidestep(far, createVector(0, 0), createVector(12, 0)).mag(), 0, 'il passe loin');
  assert.strictEqual(Behaviors.sidestep(v, createVector(0, 0), createVector(0, 0)).mag(), 0, 'tir immobile');
  const centered = Behaviors.sidestep(vehicle(100, 0), createVector(0, 0), createVector(12, 0));
  assert.ok(centered.mag() > 0, 'pile dans la trajectoire : un côté est choisi');
});
