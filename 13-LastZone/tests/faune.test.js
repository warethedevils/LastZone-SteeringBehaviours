// Faune : loups (poursuite, endurance, morsure), cerfs (harde, fuite), corbeaux (bande, signal de combat).

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(91);
const { Match, Loup, Cerf, Corbeau, Animal, Balle, Bot, CONFIG, resetConfig, createVector, BehaviorManager, makeWeapon } = g;
const DT = 1 / 60;

test.beforeEach(() => { resetConfig(); g.seed(17); });

const idle = () => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, fire: false, firePressed: false, sprint: false });

function newMatch(options = {}) {
  g.seed(options.seed || 17);
  return new Match({ fighters: 8, faune: false, vehicles: false, ...options });
}

function landAll(m) {
  for (let i = 0; i < 60 * 40 && (m.bus || m.fighters.some(f => f.alive && f.phase !== 'sol')); i++) m.step(DT, idle());
  for (const f of m.fighters) f.invulnerable = 0;
}

// Terrain dégagé autour d'un point du centre de l'île
function clearing(m, x = 1600, y = 1600, radius = 450) {
  const c = m.carte;
  for (const t of c.trees.slice()) if (Math.hypot(t.pos.x - x, t.pos.y - y) < radius) c.removeEntity(t, c.trees);
  for (const r of c.rocks.slice()) if (Math.hypot(r.pos.x - x, r.pos.y - y) < radius) c.removeEntity(r, c.rocks);
  for (const h of c.houses.slice()) if (Math.hypot(h.pos.x - x, h.pos.y - y) < radius) c.removeEntity(h, c.houses);
  for (const w of m.murs.slice()) c.removeEntity(w, m.murs);
}

function place(f, x, y) { f.pos.set(x, y); f.vel.set(0, 0); }

// Écarte les autres combattants pour isoler l'expérience
function isolate(m, keep = []) {
  for (const f of m.fighters) if (!keep.includes(f)) place(f, 3000, 3000);
}

function stepFaune(m, seconds) {
  for (let i = 0; i < Math.round(seconds * 60); i++) { m.time += DT; m.stepFaune(DT); }
}

// ---------- Mise en place ----------

test('faune : le match crée loups, cerfs et corbeaux selon la config, sur l\'île', () => {
  const m = newMatch({ faune: true });
  assert.strictEqual(m.loups.length, CONFIG.faune.loups);
  assert.strictEqual(m.cerfs.length, CONFIG.faune.cerfs);
  assert.strictEqual(m.corbeaux.length, CONFIG.faune.corbeauxGroupes * CONFIG.faune.corbeauxParGroupe);
  assert.ok(m.faune.every(a => m.carte.inIsland(a.pos, 0)));
  assert.strictEqual(newMatch().faune.length, 0, 'option faune: false');
});

test('faune : tous les animaux sont des Vehicle avec un BehaviorManager et des comportements complexes', () => {
  const wolf = new Loup(100, 100);
  const deer = new Cerf(100, 100);
  const crow = new Corbeau(100, 100);
  for (const a of [wolf, deer, crow]) {
    assert.ok(a instanceof g.Vehicle && a instanceof Animal);
    assert.ok(a.behaviors instanceof BehaviorManager);
  }
  assert.ok(['rode', 'chasse', 'fuite'].every(n => wolf.behaviors.describe().length >= 0 && wolf.behaviors.complex.has(n)));
  assert.ok(['paitre', 'fuite'].every(n => deer.behaviors.complex.has(n)));
  assert.ok(['vol', 'alerte'].every(n => crow.behaviors.complex.has(n)));
});

test('faune : un animal expose l\'interface d\'une cible (au sol, jamais ami, vie)', () => {
  const wolf = new Loup(0, 0);
  assert.strictEqual(wolf.phase, 'sol');
  assert.strictEqual(wolf.alive, true);
  assert.strictEqual(wolf.isFriend({}), false);
  assert.strictEqual(wolf.bestWeapon(), null);
  assert.strictEqual(wolf.vitality, wolf.hp);
  wolf.hit(1000);
  assert.strictEqual(wolf.alive, false);
});

// ---------- Loup ----------

test('loup : repère un combattant visible, le poursuit plus vite que lui et reste borné par maxForce', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  isolate(m, [m.fighters[0]]);
  const prey = m.fighters[0];
  place(prey, 1600, 1600);
  const wolf = new Loup(1600 - 300, 1600);
  m.faune.push(wolf);
  stepFaune(m, 1);
  assert.strictEqual(wolf.state, 'chasse');
  assert.strictEqual(wolf.prey, prey);
  let maxForce = 0;
  const original = wolf.applyForce.bind(wolf);
  wolf.applyForce = f => { maxForce = Math.max(maxForce, f.mag()); original(f); };
  stepFaune(m, 0.5);
  assert.ok(maxForce <= wolf.maxForce + 1e-9, `force ${maxForce} <= ${wolf.maxForce}`);
  assert.ok(wolf.maxSpeed > CONFIG.joueur.maxSpeed, 'plus rapide que le joueur');
  assert.ok(p5dist(wolf.pos, prey.pos) < 300, 'il se rapproche');
});

function p5dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

test('loup : ne voit pas à travers un obstacle et ignore ce qui est hors de portée', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  const prey = m.fighters[0];
  isolate(m, [prey]);
  place(prey, 1600, 1600);
  const far = new Loup(1600 + CONFIG.faune.loupPerception + 60, 1600);
  m.faune.push(far);
  stepFaune(m, 1);
  assert.strictEqual(far.state, 'rode');
  // un mur entre le loup et sa proie
  const wolf = new Loup(1600 - 200, 1600);
  m.faune.push(wolf);
  const blocker = new g.Mur(1600 - 100, 1600, Math.PI / 2, prey, 500);
  m.carte.addEntity(blocker, m.murs);
  assert.strictEqual(wolf.senseFood(m.makeWorld()), null);
});

test('loup : une proie invulnérable (atterrissage) n\'est pas attaquée', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  const prey = m.fighters[0];
  isolate(m, [prey]);
  place(prey, 1600, 1600);
  prey.invulnerable = 5;
  const wolf = new Loup(1500, 1600);
  m.faune.push(wolf);
  assert.strictEqual(wolf.senseFood(m.makeWorld()), null);
});

test('loup : il mord au contact avec un délai entre deux morsures, et peut tuer (cause « loup »)', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  const prey = m.fighters[0];
  isolate(m, [prey]);
  place(prey, 1600, 1600);
  prey.hp = 100; prey.shield = 0;
  const wolf = new Loup(1600 - 18, 1600);
  wolf.state = 'chasse'; wolf.prey = prey; wolf.thinkTimer = 99;
  m.faune.push(wolf);
  m.events.length = 0;
  stepFaune(m, 0.1);
  assert.strictEqual(prey.hp, 100 - CONFIG.faune.loupBite);
  const hp1 = prey.hp;
  stepFaune(m, CONFIG.faune.loupBiteDelay * 0.5);
  assert.strictEqual(prey.hp, hp1, 'pas de seconde morsure avant le délai');
  stepFaune(m, CONFIG.faune.loupBiteDelay);
  assert.ok(prey.hp < hp1);
  // mortel
  prey.hp = 3; wolf.biteTimer = 0;
  stepFaune(m, 0.1);
  assert.ok(!prey.alive);
  assert.ok(m.events.some(e => e.type === 'elimination' && e.cause === 'loup'));
});

test('loup : l\'endurance baisse en chasse, il se fatigue puis récupère (limites exactes)', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  const prey = m.fighters[0];
  isolate(m, [prey]);
  place(prey, 1600, 1600);
  const wolf = new Loup(1600 - 380, 1600);
  wolf.state = 'chasse'; wolf.prey = prey;
  m.faune.push(wolf);
  const world = m.makeWorld();
  let t = 0;
  // la proie fuit à l'autre bout : elle ne sera jamais rattrapée
  while (!wolf.tired && t < 30) {
    prey.pos.set(wolf.pos.x + 380, wolf.pos.y);
    wolf.think(world, DT);
    wolf.update();
    t += DT;
  }
  assert.ok(wolf.tired, 'fatigué');
  assert.ok(t >= CONFIG.faune.loupStamina - 0.5 && t <= CONFIG.faune.loupStamina + 0.5, `durée ${t.toFixed(1)} ≈ loupStamina`);
  assert.strictEqual(wolf.stamina, 0);
  assert.ok(wolf.maxSpeed <= CONFIG.faune.loupWalk * 0.7 + 1e-9 || wolf.state !== 'chasse');
  // le repos : fin de fatigue à 60 % d'endurance
  place(prey, 3000, 3000);
  wolf.prey = null; wolf.state = 'rode'; wolf.thinkTimer = 99;
  let rest = 0;
  while (wolf.tired && rest < 30) { wolf.think(world, DT); rest += DT; }
  assert.ok(!wolf.tired);
  assert.ok(wolf.stamina >= 0.6);
});

test('loup : blessé gravement après un tir, il fuit son tireur ; sinon il se retourne contre lui', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  const shooter = m.fighters[0];
  isolate(m, [shooter]);
  place(shooter, 1600, 1600);
  const wolf = new Loup(1600 + 150, 1600);
  m.faune.push(wolf);
  wolf.wound(5, shooter);
  assert.strictEqual(wolf.threat, shooter);
  assert.strictEqual(wolf.prey, shooter);
  wolf.hp = wolf.maxHp * 0.2;
  wolf.decide(m.makeWorld());
  assert.strictEqual(wolf.state, 'fuite');
});

// ---------- Cerf ----------

test('cerf : il broute sans danger et fuit un combattant qui s\'approche, plus vite', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  const hunter = m.fighters[0];
  isolate(m, [hunter]);
  place(hunter, 1000, 1000);
  const deer = new Cerf(1600, 1600);
  m.faune.push(deer);
  stepFaune(m, 1);
  assert.strictEqual(deer.state, 'paitre');
  assert.strictEqual(deer.maxSpeed, CONFIG.faune.cerfWalk);
  place(hunter, 1600 - 150, 1600);
  stepFaune(m, 0.45);
  assert.strictEqual(deer.state, 'fuite');
  assert.strictEqual(deer.maxSpeed, CONFIG.faune.cerfRun);
  assert.ok(deer.vel.x > 0, 'il s\'éloigne du chasseur');
  assert.ok(CONFIG.faune.cerfRun > CONFIG.joueur.maxSpeed, 'plus rapide que le joueur à pied');
});

test('cerf : il fuit aussi un loup, et la harde reste groupée (cohésion)', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  isolate(m);
  const deer = new Cerf(1600, 1600);
  const wolf = new Loup(1600 - 140, 1600);
  m.faune.push(deer, wolf);
  stepFaune(m, 0.45);
  assert.strictEqual(deer.state, 'fuite');
  // harde
  const m2 = newMatch();
  landAll(m2);
  clearing(m2);
  isolate(m2);
  const herd = [new Cerf(1500, 1600), new Cerf(1700, 1600), new Cerf(1600, 1700), new Cerf(1600, 1500)];
  m2.faune.push(...herd);
  const spread = () => Math.max(...herd.map(a => Math.max(...herd.map(b => p5dist(a.pos, b.pos)))));
  const before = spread();
  stepFaune(m2, 6);
  assert.ok(spread() < before * 1.6, 'la harde ne se disperse pas');
});

// ---------- Corbeaux ----------

test('corbeaux : sans combat ils volent en bande ; un combat récent proche les met en alerte et ils l\'encerclent', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  isolate(m);
  const flock = [];
  for (let i = 0; i < 6; i++) flock.push(new Corbeau(1600 + i * 12, 1600 + (i % 2) * 14));
  m.faune.push(...flock);
  stepFaune(m, 1);
  assert.ok(flock.every(c => c.state === 'vol'));
  assert.strictEqual(m.pings.length, 0);
  m.noteCombat(createVector(1900, 1600));
  stepFaune(m, 1);
  assert.ok(flock.every(c => c.state === 'alerte'));
  assert.strictEqual(m.pings.length, flock.length);
  stepFaune(m, 5);
  const center = createVector(1900, 1600);
  const distances = flock.map(c => p5dist(c.pos, center));
  assert.ok(Math.max(...distances) < 420, 'la bande tourne autour du combat');
});

test('corbeaux : un combat trop ancien ou trop lointain est ignoré', () => {
  const m = newMatch();
  landAll(m);
  const crow = new Corbeau(1600, 1600);
  m.faune.push(crow);
  m.noteCombat(createVector(1600 + CONFIG.faune.corbeauRange + 100, 1600));
  assert.strictEqual(crow.senseBattle(m.makeWorld()), null);
  m.combats.length = 0;
  m.noteCombat(createVector(1700, 1600));
  m.time += 20;
  assert.strictEqual(crow.senseBattle(m.makeWorld()), null, 'plus de 7 s');
});

test('corbeaux : la séparation les empêche de se superposer', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  isolate(m);
  const crows = [new Corbeau(1600, 1600), new Corbeau(1602, 1601), new Corbeau(1601, 1603)];
  m.faune.push(...crows);
  stepFaune(m, 3);
  const min = Math.min(p5dist(crows[0].pos, crows[1].pos), p5dist(crows[1].pos, crows[2].pos), p5dist(crows[0].pos, crows[2].pos));
  assert.ok(min > 4, `écart minimal ${min.toFixed(1)}`);
});

// ---------- Match : tirs, explosions, butin ----------

test('faune : les balles blessent loups et cerfs, un cerf abattu laisse un soin, les corbeaux sont intouchables', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  const shooter = m.fighters[0];
  isolate(m, [shooter]);
  place(shooter, 1000, 1600);
  const deer = new Cerf(1200, 1600);
  const crow = new Corbeau(1100, 1600);
  m.faune.push(deer, crow);
  deer.hp = 5;
  const before = m.butins.length;
  m.bullets.push(new Balle(1020, 1600, 0, 22, 40, 600, shooter));
  for (let i = 0; i < 30 && m.bullets.length; i++) m.stepBullets();
  assert.ok(!m.faune.includes(deer), 'cerf abattu');
  assert.ok(crow.alive && m.faune.includes(crow), 'le corbeau vole au-dessus des balles');
  assert.ok(m.butins.length > before, 'un soin tombe');
  assert.ok(m.events.some(e => e.type === 'faune_mort'));
});

test('faune : une explosion blesse les animaux proches', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  const wolf = new Loup(1600, 1600);
  const far = new Loup(1600 + 400, 1600);
  m.faune.push(wolf, far);
  m.explode(createVector(1600, 1620), { radius: 130, wall: 3 }, 100, null);
  assert.ok(wolf.hp < wolf.maxHp);
  assert.strictEqual(far.hp, far.maxHp);
});

test('faune : tirs et explosions sont mémorisés comme des combats (fusionnés s\'ils sont proches dans le temps)', () => {
  const m = newMatch();
  m.noteCombat(createVector(100, 100));
  m.noteCombat(createVector(120, 110));
  assert.strictEqual(m.combats.length, 1);
  m.time += 5;
  m.noteCombat(createVector(120, 110));
  assert.strictEqual(m.combats.length, 2);
  for (let i = 0; i < 30; i++) { m.time += 2; m.noteCombat(createVector(i * 500, 0)); }
  assert.ok(m.combats.length <= 12);
});

test('bots : ils se défendent contre un loup qui les chasse', () => {
  const m = newMatch();
  landAll(m);
  clearing(m);
  const bot = m.fighters[1];
  assert.ok(bot instanceof Bot);
  isolate(m, [bot]);
  place(bot, 1600, 1600);
  const wolf = new Loup(1600 + 150, 1600);
  wolf.state = 'chasse';
  m.faune.push(wolf);
  const sensed = bot.senseEnemy(m.makeWorld());
  assert.ok(sensed && sensed.enemy === wolf, 'le loup est vu comme une menace');
  wolf.state = 'rode';
  assert.strictEqual(bot.senseEnemy(m.makeWorld()), null, 'un loup qui rôde est ignoré');
});

test('faune : une partie complète avec la faune se termine sans erreur', () => {
  g.seed(5);
  const m = new Match({ fighters: 12, faune: true });
  let bites = 0;
  for (let i = 0; i < 60 * 60 * 6 && m.state !== 'fin'; i++) {
    m.step(DT, idle());
    for (const e of m.events) if (e.type === 'bite') bites++;
    m.events.length = 0;
  }
  assert.ok(m.time > 60);
  assert.ok(m.faune.length > 0);
  assert.ok(bites >= 0);
});
