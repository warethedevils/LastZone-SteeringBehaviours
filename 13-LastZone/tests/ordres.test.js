// Ordres d'escouade : le joueur commande ses coéquipiers (touche T). Les bots obéissent avec des
// comportements de boids (séparation, alignement, cohésion + suivi du chef), sans cesser de
// réagir à une menace proche ni à la tempête.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(23);
const { Match, Bot, CONFIG, resetConfig, createVector } = g;
const DT = 1 / 60;

test.beforeEach(() => { resetConfig(); g.seed(9); });

const idle = () => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, fire: false, firePressed: false, sprint: false });

function newMatch(options = {}) {
  g.seed(options.seed || 9);
  return new Match({ fighters: 8, faune: false, vehicles: false, teamSize: 4, ...options });
}

function landAll(m) {
  for (let i = 0; i < 60 * 40 && (m.bus || m.fighters.some(f => f.alive && f.phase !== 'sol'));i++) m.step(DT, idle());
  for (const f of m.fighters) f.invulnerable = 0;
}

function clearing(m, x = 1600, y = 1600, radius = 700) {
  const c = m.carte;
  for (const t of c.trees.slice()) if (Math.hypot(t.pos.x - x, t.pos.y - y) < radius) c.removeEntity(t, c.trees);
  for (const r of c.rocks.slice()) if (Math.hypot(r.pos.x - x, r.pos.y - y) < radius) c.removeEntity(r, c.rocks);
  for (const h of c.houses.slice()) if (Math.hypot(h.pos.x - x, h.pos.y - y) < radius) c.removeEntity(h, c.houses);
  for (const b of m.butins.slice()) m.lootGrid.remove(b);
  m.butins.length = 0;
  for (const co of m.coffres) { co.opened = true; m.lootGrid.remove(co); }
}

// Équipe du joueur au centre, l'autre équipe très loin
function setup() {
  const m = newMatch();
  landAll(m);
  clearing(m);
  const [leader, ...rest] = m.fighters;
  const mates = rest.filter(f => f.team === leader.team);
  const foes = m.fighters.filter(f => f.team !== leader.team);
  foes.forEach((f, i) => { f.pos.set(300 + i * 30, 300); f.vel.set(0, 0); });
  leader.pos.set(1600, 1600);
  mates.forEach((f, i) => { f.pos.set(1300 + i * 25, 1500 + i * 25); f.vel.set(0, 0); f.calmTime = 0; f.groundTime = 99; f.lastHit = 99; });
  leader.invulnerable = 1e9;
  m.storm.pos.set(1600, 1600);
  return { m, leader, mates, foes };
}

function run(m, seconds, input = idle) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    m.step(DT, input());
    for (const f of m.fighters) if (f !== m.joueur && f.team !== m.joueur.team) { f.vel.set(0, 0); f.pos.set(300, 300); }   // ennemis figés au loin
    m.joueur.vel.set(0, 0);
  }
}

test('ordres : T fait défiler libre -> suivre -> tenir -> attaque, et note le point à tenir', () => {
  const { m, leader } = setup();
  assert.strictEqual(m.ordre, 'libre');
  m.step(DT, { ...idle(), order: true });
  assert.strictEqual(m.ordre, 'suivre');
  m.step(DT, { ...idle(), order: true });
  assert.strictEqual(m.ordre, 'tenir');
  assert.ok(m.holdPoint && Math.abs(m.holdPoint.x - leader.pos.x) < 5);
  m.step(DT, { ...idle(), order: true });
  assert.strictEqual(m.ordre, 'attaque');
  assert.strictEqual(m.holdPoint, null);
  m.step(DT, { ...idle(), order: true });
  assert.strictEqual(m.ordre, 'libre');
  assert.ok(m.events.some(e => e.type === 'ordre'));
});

test('ordres : sans équipe (solo), la touche T ne fait rien', () => {
  const m = newMatch({ teamSize: 1 });
  landAll(m);
  m.step(DT, { ...idle(), order: true });
  assert.strictEqual(m.ordre, 'libre');
});

test('ordres : « suivez-moi » — les coéquipiers rejoignent le chef et gardent leurs distances (boids)', () => {
  const { m, leader, mates } = setup();
  leader.pos.set(1900, 1600);
  m.step(DT, { ...idle(), order: true });
  assert.strictEqual(m.ordre, 'suivre');
  run(m, 14);
  for (const f of mates) {
    const d = Math.hypot(f.pos.x - leader.pos.x, f.pos.y - leader.pos.y);
    assert.ok(d < 220, `${f.name} à ${d.toFixed(0)} px du chef`);
  }
  // séparation : personne n'est superposé
  for (let i = 0; i < mates.length; i++) for (let j = i + 1; j < mates.length; j++) {
    assert.ok(Math.hypot(mates[i].pos.x - mates[j].pos.x, mates[i].pos.y - mates[j].pos.y) > 14);
  }
  assert.ok(mates.every(f => f.debugInfo && f.debugInfo.state === 'escouade'));
});

test('ordres : « tenez la position » — ils se placent en cercle autour du point et y restent', () => {
  const { m, leader, mates } = setup();
  m.ordre = 'suivre';
  m.step(DT, { ...idle(), order: true });
  assert.strictEqual(m.ordre, 'tenir');
  const hold = m.holdPoint.copy();
  leader.pos.set(1600, 900);              // le chef s'éloigne : eux ne bougent pas avec lui
  run(m, 14);
  for (const f of mates) {
    const d = Math.hypot(f.pos.x - hold.x, f.pos.y - hold.y);
    assert.ok(d < 130, `${f.name} à ${d.toFixed(0)} px du point`);
  }
  assert.ok(mates.every(f => f.debugInfo.state === 'tenir'));
});

test('ordres : « à l\'attaque » — ils foncent vers l\'ennemi le plus proche', () => {
  const { m, mates, foes } = setup();
  m.ordre = 'tenir';
  m.step(DT, { ...idle(), order: true });
  assert.strictEqual(m.ordre, 'attaque');
  const bot = mates[0];
  const enemy = foes[0];
  enemy.pos.set(1600 + 500, 1600);
  const before = Math.hypot(bot.pos.x - enemy.pos.x, bot.pos.y - enemy.pos.y);
  for (let i = 0; i < 60 * 5; i++) {
    m.step(DT, idle());
    enemy.pos.set(1600 + 500, 1600);
    enemy.vel.set(0, 0);
    enemy.invulnerable = 99;
    m.joueur.vel.set(0, 0);
  }
  const after = Math.hypot(bot.pos.x - enemy.pos.x, bot.pos.y - enemy.pos.y);
  assert.ok(after < before - 150, `distance ${before.toFixed(0)} -> ${after.toFixed(0)}`);
});

test('ordres : une menace visible proche reprend la main sur l\'ordre (le bot combat)', () => {
  const { m, mates, foes } = setup();
  m.ordre = 'suivre';
  const bot = mates[0];
  const enemy = foes[0];
  enemy.pos.set(bot.pos.x + 150, bot.pos.y);
  bot.target = enemy;
  bot.targetVisible = true;
  const world = m.makeWorld();
  const ctx = bot.movementContext(world);
  assert.strictEqual(bot.teamMode(world, ctx), null);
});

test('ordres : la tempête a priorité (le bot rejoint la zone au lieu de tenir sa position)', () => {
  const { m, mates } = setup();
  m.ordre = 'tenir';
  m.holdPoint = createVector(1600, 1600);
  const bot = mates[0];
  bot.zoneOver = 50;                      // hors de la zone
  bot.target = null;
  const world = m.makeWorld();
  const ctx = bot.movementContext(world);
  assert.strictEqual(bot.teamMode(world, ctx), null);
});

test('ordres : ils ne concernent que l\'équipe du joueur', () => {
  const { m, foes } = setup();
  m.ordre = 'suivre';
  const stranger = foes[0];
  stranger.pos.set(1200, 1200);
  stranger.target = null;
  stranger.zoneOver = -500;
  const world = m.makeWorld();
  const ctx = stranger.movementContext(world);
  assert.notStrictEqual(stranger.teamMode(world, ctx), 'escouade');
});

test('ordres : « suivez-moi » — les coéquipiers montent dans le véhicule du chef', () => {
  const m = newMatch({ vehicles: false });
  landAll(m);
  clearing(m);
  const leader = m.joueur;
  const bot = m.fighters.find(f => f !== leader && f.team === leader.team);
  const foes = m.fighters.filter(f => f.team !== leader.team);
  foes.forEach(f => f.pos.set(300, 300));
  const car = new g.Vehicule(1600, 1600, 'jeep');
  m.vehicules.push(car);
  car.board(leader);
  bot.pos.set(1600 + 120, 1600);
  bot.groundTime = 99; bot.vehicleCooldown = 0; bot.lastHit = 99;
  m.ordre = 'suivre';
  bot.target = null;
  const world = m.makeWorld();
  const ctx = bot.movementContext(world);
  assert.strictEqual(bot.teamMode(world, ctx), 'vehicule');
  assert.strictEqual(bot.vehicleTarget, car);
});

test('ordres : les comportements d\'escouade sont des combinaisons de comportements de base (BehaviorManager)', () => {
  const bot = newMatch().fighters[1];
  assert.ok(bot instanceof Bot);
  bot.behaviors.use('escouade');
  for (const name of ['formation', 'groupCohesion', 'groupAlign', 'separation', 'avoid']) assert.ok(bot.behaviors.has(name), name);
  bot.behaviors.use('tenir');
  assert.ok(bot.behaviors.has('hold'));
  bot.behaviors.use('assaut');
  assert.ok(bot.behaviors.has('push'));
});
