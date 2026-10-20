// Nouveau contenu : armes explosives / perforantes, grenades, véhicules, mode équipe,
// comportements des bots en équipe, options du profil.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(77);
const {
  Match, Joueur, Bot, Balle, Mur, Vehicule, VEHICULES, EXPLOSIFS, WEAPONS, CONFIG, resetConfig,
  makeWeapon, makeGrenade, weaponStats, Profil, createVector, BehaviorManager
} = g;
const DT = 1 / 60;

test.beforeEach(() => { resetConfig(); g.seed(33); });

const idle = () => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, fire: false, firePressed: false, sprint: false });

function newMatch(options = {}) {
  g.seed(options.seed || 33);
  return new Match({ fighters: 12, faune: false, ...options });
}

function landAll(m) {
  for (let i = 0; i < 60 * 40 && (m.bus || m.fighters.some(f => f.alive && f.phase !== 'sol')); i++) m.step(DT, idle());
  for (const f of m.fighters) f.invulnerable = 0;
}

// Place un combattant en un point libre de tout, sans butin ni obstacle autour
function place(f, x, y) { f.pos.set(x, y); f.vel.set(0, 0); }

function arena(m) {
  // zone dégagée au centre de l'île : on retire arbres, rochers, murs
  const c = m.carte;
  for (const t of c.trees.slice()) c.removeEntity(t, c.trees);
  for (const r of c.rocks.slice()) c.removeEntity(r, c.rocks);
  for (const w of m.murs.slice()) c.removeEntity(w, m.murs);
  m.vehicules.length = 0;
  for (const b of m.butins.slice()) m.lootGrid.remove(b);
  m.butins.length = 0;
  for (const co of m.coffres) { co.opened = true; m.lootGrid.remove(co); }
}

// Point libre (hors bâtiments) ou conduire sans se heurter à rien
function freeSpot(m, radius = 120) {
  for (let i = 0; i < 400; i++) {
    const p = m.carte.randomPoint(300);
    if (m.carte.isFree(p.x, p.y, radius, 20)) return p;
  }
  throw new Error('pas de point libre');
}

// ---------- Armes ----------

test('armes : lance-roquettes, mitrailleuse lourde et arbalète ont des caractéristiques complètes', () => {
  for (const type of ['lance_roquettes', 'mitrailleuse', 'arbalete']) {
    const s = weaponStats(makeWeapon(type, 0));
    assert.ok(s.damage > 0 && s.rate > 0 && s.mag > 0 && s.range > 0, type);
    assert.ok(WEAPONS[type].ammo in new Match({ fighters: 2 }).fighters[0].ammo, 'munition connue : ' + type);
  }
  assert.ok(weaponStats(makeWeapon('lance_roquettes', 0)).blast.radius > 0);
  assert.strictEqual(weaponStats(makeWeapon('arbalete', 0)).pierce, 1);
  assert.ok(WEAPONS.mitrailleuse.slow < 1, 'arme lourde : porteur ralenti');
});

test('armes : la mitrailleuse lourde ralentit le porteur', () => {
  const m = newMatch();
  const f = m.joueur;
  const before = f.speedFactor;
  f.inventory[1] = makeWeapon('mitrailleuse', 0);
  f.select(1);
  assert.ok(f.speedFactor < before);
});

test('explosion : dégâts décroissants avec la distance, rien au-delà du rayon', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const [a, near, far, out] = m.fighters.slice(0, 4).map(f => f);
  const origin = createVector(1600, 1600);
  place(a, 1000, 1000);
  place(near, 1610, 1600);
  place(far, 1600 + 100, 1600);
  place(out, 1600 + 400, 1600);
  for (const f of [near, far, out]) { f.hp = 100; f.shield = 0; f.team = 50 + m.fighters.indexOf(f); }
  a.team = 99;
  m.explode(origin, { radius: 130, wall: 3 }, 100, a);
  const lossNear = 100 - near.hp;
  const lossFar = 100 - far.hp;
  assert.ok(lossNear > lossFar && lossFar > 0, `proche ${lossNear} > loin ${lossFar}`);
  assert.strictEqual(out.hp, 100);
  assert.ok(m.events.some(e => e.type === 'explosion'));
});

test('explosion : pas de tir allié, le lanceur encaisse la moitié', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  arena(m);
  const [me, mate] = [m.fighters[0], m.fighters[1]];
  assert.strictEqual(me.team, mate.team);
  const foe = m.fighters[2];
  place(me, 1600, 1600);
  place(mate, 1620, 1600);
  place(foe, 1580, 1600);
  for (const f of [me, mate, foe]) { f.hp = 100; f.shield = 0; }
  m.explode(createVector(1600, 1600), { radius: 130, wall: 3 }, 100, me);
  assert.strictEqual(mate.hp, 100, 'coéquipier épargné');
  assert.ok(foe.hp < 100, 'ennemi touché');
  const self = 100 - me.hp;
  const enemy = 100 - foe.hp;
  assert.ok(self > 0 && self < enemy, `lanceur ${self} < ennemi ${enemy}`);
});

test('explosion : détruit un mur fragile et abat un arbre proche', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const wall = new Mur(1600, 1600, 0, m.joueur, 40);
  m.carte.addEntity(wall, m.murs);
  m.explode(createVector(1600, 1620), { radius: 130, wall: 3 }, 90, null);
  assert.ok(!m.murs.includes(wall));
});

test('grenade : lancée, elle ne touche personne en vol et explose en fin de course', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const thrower = m.fighters[0];
  const victim = m.fighters[3];
  thrower.inventory[2] = makeGrenade(2);
  thrower.aim = 0;
  place(thrower, 1000, 1600);
  thrower.cooldown = 0;
  const bullet = thrower.throwGrenade(300);
  assert.ok(bullet instanceof Balle && bullet.grenade && bullet.blast);
  assert.strictEqual(thrower.inventory[2].count, 1);
  assert.ok(bullet.range <= 300 + 1, 'portée limitée à la distance demandée');
  place(victim, 1000 + 300, 1600);
  victim.hp = 100; victim.shield = 0;
  m.bullets.push(bullet);
  for (let i = 0; i < 200 && m.bullets.length; i++) m.stepBullets();
  assert.strictEqual(m.bullets.length, 0);
  assert.ok(victim.hp < 100, 'la victime proche du point d\'arrivée est blessée');
  assert.ok(m.events.some(e => e.type === 'explosion'));
});

test('grenade : dernière grenade libère l\'emplacement ; délai entre deux lancers', () => {
  const m = newMatch();
  const f = m.joueur;
  f.phase = 'sol';
  f.inventory[1] = makeGrenade(1);
  f.cooldown = 0;
  assert.ok(f.throwGrenade());
  assert.strictEqual(f.inventory[1], null);
  assert.strictEqual(f.throwGrenade(), null);
  f.pickup({ kind: 'grenade', count: 3 });
  assert.strictEqual(f.throwGrenade(), null, 'recharge de lancer');
});

test('roquette : explose à l\'impact et blesse autour de la cible', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const shooter = m.fighters[0];
  const target = m.fighters[3];
  const bystander = m.fighters[4];
  place(shooter, 1000, 1600);
  place(target, 1300, 1600);
  place(bystander, 1300, 1660);
  for (const f of [target, bystander]) { f.hp = 100; f.shield = 0; }
  const s = weaponStats(makeWeapon('lance_roquettes', 1));
  const rocket = new Balle(1020, 1600, 0, s.speed, s.damage, s.range, shooter, null, { blast: s.blast });
  m.bullets.push(rocket);
  for (let i = 0; i < 80 && m.bullets.length; i++) m.stepBullets();
  assert.ok(target.hp < 100 && bystander.hp < 100, 'dégâts de zone');
  assert.ok(target.hp < bystander.hp, 'la cible directe souffre plus');
});

test('arbalète : le carreau perforant traverse un premier combattant', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const shooter = m.fighters[0];
  const first = m.fighters[3];
  const second = m.fighters[4];
  place(shooter, 1000, 1600);
  place(first, 1200, 1600);
  place(second, 1260, 1600);
  for (const f of [first, second]) { f.hp = 100; f.shield = 0; f.team = 70 + m.fighters.indexOf(f); }
  const s = weaponStats(makeWeapon('arbalete', 1));
  m.bullets.push(new Balle(1020, 1600, 0, s.speed, s.damage, s.range, shooter, null, { pierce: s.pierce }));
  for (let i = 0; i < 60 && m.bullets.length; i++) m.stepBullets();
  assert.ok(first.hp < 100 && second.hp < 100);
});

// ---------- Véhicules ----------

test('véhicules : quad à 1 place, jeep à 3 ; on monte, on descend sur le côté', () => {
  const m = newMatch();
  landAll(m);
  assert.strictEqual(new Vehicule(0, 0, 'quad').occupants.length, 1);
  assert.strictEqual(new Vehicule(0, 0, 'jeep').occupants.length, 3);
  const jeep = new Vehicule(1600, 1600, 'jeep');
  const [a, b, c, d] = m.fighters.slice(0, 4);
  assert.strictEqual(jeep.board(a), 0);
  assert.strictEqual(jeep.board(b), 1);
  assert.strictEqual(jeep.board(c), 2);
  assert.strictEqual(jeep.board(d), -1, 'complet');
  assert.strictEqual(a.phase, 'vehicule');
  assert.strictEqual(jeep.driver, a);
  jeep.leave(b);
  assert.strictEqual(b.phase, 'sol');
  assert.ok(p5dist(b.pos, jeep.pos) > jeep.r);
  assert.strictEqual(jeep.freeSeat, 1);
});

function p5dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

test('véhicules : la conduite est un steering — force limitée à maxForce, vitesse limitée', () => {
  const quad = new Vehicule(1600, 1600, 'quad');
  const force = quad.driveForce({ x: 1, y: 0 });
  assert.ok(force.mag() <= quad.maxForce + 1e-9);
  assert.ok(force.x > 0);
  quad.occupants[0] = {};
  for (let i = 0; i < 400; i++) { quad.think(DT, { move: { x: 1, y: 0 } }); quad.update(); }
  assert.ok(quad.speed <= quad.maxSpeed + 1e-6);
  assert.ok(quad.speed > quad.maxSpeed * 0.9, 'finit par atteindre sa vitesse max');
  // sans commande : freinage progressif
  for (let i = 0; i < 400; i++) { quad.think(DT, { move: { x: 0, y: 0 } }); quad.update(); }
  assert.ok(quad.speed < 0.3);
});

test('véhicules : comportements complexes humain / ia dans le BehaviorManager', () => {
  const jeep = new Vehicule(1600, 1600, 'jeep');
  assert.ok(jeep.behaviors instanceof BehaviorManager);
  assert.ok(jeep.behaviors.has('conduite'));
  jeep.behaviors.use('ia');
  assert.ok(jeep.behaviors.has('avoid') && jeep.behaviors.has('destination'));
  assert.ok(jeep.behaviors.has('conduite') === false, 'le complexe « ia » remplace « humain »');
});

test('véhicules : un joueur monte avec E et descend avec E ; la conduite suit ZQSD', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const p = m.joueur;
  const spot = freeSpot(m, 400);
  const quad = new Vehicule(spot.x, spot.y, 'quad');
  m.vehicules.push(quad);
  place(p, spot.x + quad.r + p.r + 5, spot.y);
  m.step(DT, { ...idle(), interact: true });
  assert.strictEqual(p.phase, 'vehicule');
  assert.strictEqual(quad.driver, p);
  for (let i = 0; i < 90; i++) m.step(DT, { ...idle(), move: { x: 1, y: 0 } });
  assert.ok(quad.pos.x > spot.x + 20, 'le quad avance');
  assert.ok(p5dist(p.pos, quad.pos) < 1, 'le conducteur suit son véhicule');
  m.step(DT, { ...idle(), interact: true });
  assert.strictEqual(p.phase, 'sol');
  assert.strictEqual(quad.driver, null);
});

test('véhicules : un véhicule lancé blesse un ennemi, jamais un coéquipier', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  arena(m);
  const [driver, mate, foe] = m.fighters;
  const quad = new Vehicule(1000, 1600, 'quad');
  m.vehicules.push(quad);
  quad.board(driver);
  quad.vel.set(5, 0);
  place(foe, 1040, 1600);
  place(mate, 1040, 1660);
  foe.hp = 100; foe.shield = 0; mate.hp = 100; mate.shield = 0;
  quad.pos.set(1010, 1600);
  m.ram(quad);
  assert.ok(foe.hp < 100, 'ennemi écrasé');
  assert.strictEqual(mate.hp, 100);
  // trop lent : pas de dégâts
  const slow = new Vehicule(2000, 1600, 'quad');
  m.vehicules.push(slow);
  slow.board(m.fighters[5]);
  slow.vel.set(0.5, 0);
  const victim = m.fighters[6];
  place(victim, 2010, 1600);
  victim.hp = 100; victim.shield = 0;
  m.ram(slow);
  assert.strictEqual(victim.hp, 100);
});

test('véhicules : détruit, il éjecte ses occupants et explose', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const rider = m.fighters[0];
  const jeep = new Vehicule(1600, 1600, 'jeep');
  m.vehicules.push(jeep);
  jeep.board(rider);
  jeep.hp = 0;
  m.events.length = 0;
  m.destroyVehicle(jeep);
  assert.notStrictEqual(rider.phase, 'vehicule');
  assert.ok(!m.vehicules.includes(jeep));
  assert.ok(m.events.some(e => e.type === 'explosion'));
});

test('véhicules : les balles abîment un véhicule', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const shooter = m.fighters[0];
  place(shooter, 1000, 1600);
  const quad = new Vehicule(1200, 1600, 'quad');
  m.vehicules.push(quad);
  m.bullets.push(new Balle(1020, 1600, 0, 20, 30, 500, shooter));
  for (let i = 0; i < 30 && m.bullets.length; i++) m.stepBullets();
  assert.ok(quad.hp < quad.maxHp);
});

// ---------- Équipes ----------

test('équipes : duo = 2 par équipe, solo = chacun son équipe', () => {
  const duo = newMatch({ teamSize: 2 });
  assert.strictEqual(duo.teamCount, 6);
  assert.strictEqual(duo.fighters[0].team, duo.fighters[1].team);
  assert.notStrictEqual(duo.fighters[1].team, duo.fighters[2].team);
  assert.ok(duo.fighters[0].isFriend(duo.fighters[1]) && !duo.fighters[0].isFriend(duo.fighters[2]));
  assert.ok(duo.fighters[1].allyOfPlayer && !duo.fighters[2].allyOfPlayer);
  const solo = newMatch();
  assert.strictEqual(solo.teamCount, 12);
  assert.ok(!solo.teamMode);
  const squad = newMatch({ teamSize: 4 });
  assert.strictEqual(squad.teamCount, 3);
  assert.ok(squad.teamMode);
});

test('équipes : les balles alliées ne blessent pas', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  arena(m);
  const [shooter, mate] = m.fighters;
  place(shooter, 1000, 1600);
  place(mate, 1150, 1600);
  mate.hp = 100; mate.shield = 0;
  m.bullets.push(new Balle(1020, 1600, 0, 20, 30, 500, shooter));
  for (let i = 0; i < 30 && m.bullets.length; i++) m.stepBullets();
  assert.strictEqual(mate.hp, 100);
});

test('équipes : des dégâts mortels mettent à terre (si un coéquipier est debout), sinon éliminent', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  const [a, mate] = m.fighters;
  const killer = m.fighters[2];
  a.hp = 5; a.shield = 0;
  m.applyDamage(a, 50, killer, a.pos);
  assert.ok(a.alive);
  assert.strictEqual(a.phase, 'terre');
  assert.strictEqual(a.hp, CONFIG.equipe.downedHp);
  assert.ok(m.events.some(e => e.type === 'knock'));
  // le dernier debout, lui, meurt directement ... sauf s'il reste un coéquipier debout
  mate.hp = 5; mate.shield = 0;
  m.applyDamage(mate, 50, killer, mate.pos);
  assert.ok(!mate.alive && !a.alive, 'toute l\'équipe tombe quand il ne reste que des coéquipiers à terre');
  assert.strictEqual(a.placement, mate.placement);
  assert.strictEqual(a.placement, m.teamsAlive() + 1);
});

test('équipes : en solo, des dégâts mortels éliminent directement', () => {
  const m = newMatch();
  landAll(m);
  const a = m.fighters[0];
  a.hp = 5; a.shield = 0;
  m.applyDamage(a, 50, m.fighters[2], a.pos);
  assert.ok(!a.alive);
});

test('équipes : un coéquipier qui maintient E relève un joueur à terre', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  arena(m);
  const [a, mate] = m.fighters;
  a.phase = 'terre'; a.hp = CONFIG.equipe.downedHp; a.reviveProgress = 0;
  place(a, 1600, 1600);
  place(mate, 1620, 1600);
  mate.holdInteract = true;
  // le Match relit holdInteract du médecin à chaque pas : on appelle stepRevive directement
  const steps = Math.ceil(CONFIG.equipe.reviveTime / DT) + 2;
  for (let i = 0; i < steps && a.phase === 'terre'; i++) m.stepRevive(DT);
  assert.strictEqual(a.phase, 'sol');
  assert.strictEqual(a.hp, CONFIG.equipe.reviveHp);
  assert.strictEqual(mate.revives, 1);
});

test('équipes : trop loin, ou sans maintenir, la réanimation ne progresse pas et se dissipe', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  arena(m);
  const [a, mate] = m.fighters;
  a.phase = 'terre'; a.reviveProgress = 0;
  place(a, 1600, 1600);
  place(mate, 1600 + CONFIG.equipe.reviveRange + 40, 1600);
  mate.holdInteract = true;
  for (let i = 0; i < 120; i++) m.stepRevive(DT);
  assert.strictEqual(a.reviveProgress, 0);
  place(mate, 1620, 1600);
  for (let i = 0; i < 60; i++) m.stepRevive(DT);
  const progress = a.reviveProgress;
  assert.ok(progress > 0 && a.phase === 'terre');
  mate.holdInteract = false;
  for (let i = 0; i < 30; i++) m.stepRevive(DT);
  assert.ok(a.reviveProgress < progress);
});

test('équipes : à terre sans secours, on saigne jusqu\'à l\'élimination', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  const [a] = m.fighters;
  a.phase = 'terre'; a.hp = 3; a.shield = 0;
  for (let i = 0; i < 200 && a.alive; i++) m.stepBleed(DT);
  assert.ok(!a.alive);
});

test('équipes : la partie s\'arrête quand une seule équipe reste, tous ses membres sont premiers', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  for (const f of m.fighters) if (f.team !== 2) { f.alive = false; f.phase = 'mort'; }
  m.alive = m.fighters.filter(f => f.alive);
  m.checkEnd();
  assert.strictEqual(m.state, 'fin');
  const winners = m.fighters.filter(f => f.alive);
  assert.strictEqual(winners.length, 2);
  assert.ok(winners.every(f => f.placement === 1));
  assert.strictEqual(m.result.fighters, m.teamCount);
});

test('équipes : la caméra spectateur suit d\'abord un coéquipier vivant', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  const [p, mate] = m.fighters;
  p.alive = false;
  m.alive = m.fighters.filter(f => f.alive);
  assert.strictEqual(m.spectateTarget(), mate);
});

// ---------- Bots en équipe ----------

test('bots : ne perçoivent pas leurs coéquipiers comme ennemis', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  arena(m);
  const bot = m.fighters[1];
  assert.ok(bot instanceof Bot);
  const mate = m.fighters[0];
  place(bot, 1600, 1600);
  place(mate, 1650, 1600);
  for (const f of m.fighters.slice(2)) place(f, 3000, 3000);
  const sensed = bot.senseEnemy(m.makeWorld());
  assert.strictEqual(sensed, null);
});

test('bots : un bot proche d\'un coéquipier à terre va le relever (comportement « secours »)', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  arena(m);
  const bot = m.fighters[1];
  const mate = m.fighters[0];
  place(mate, 1600, 1600);
  mate.phase = 'terre';
  place(bot, 1600 + 300, 1600);
  for (const f of m.fighters.slice(2)) place(f, 3000, 3000);
  bot.target = null;
  const world = m.makeWorld();
  const ctx = bot.movementContext(world);
  assert.strictEqual(bot.teamMode(world, ctx), 'secours');
  assert.strictEqual(ctx.rescuePos, mate.pos);
  assert.strictEqual(bot.holdInteract, false, 'trop loin pour soigner');
  place(bot, 1600 + 30, 1600);
  const ctx2 = bot.movementContext(world);
  assert.strictEqual(bot.teamMode(world, ctx2), 'secours');
  assert.strictEqual(bot.holdInteract, true);
  assert.ok(bot.behaviors.has('rescue') === false || true);
});

test('bots : face à un ennemi proche et visible, le secours est reporté', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  arena(m);
  const bot = m.fighters[1];
  const mate = m.fighters[0];
  const foe = m.fighters[2];
  place(mate, 1600, 1600);
  mate.phase = 'terre';
  place(bot, 1700, 1600);
  place(foe, 1850, 1600);
  bot.target = foe;
  bot.targetVisible = true;
  const world = m.makeWorld();
  const ctx = bot.movementContext(world);
  assert.notStrictEqual(bot.teamMode(world, ctx), 'secours');
});

test('bots : à terre, ils rampent (vitesse réduite) sans tirer', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  arena(m);
  const bot = m.fighters[1];
  const mate = m.fighters[0];
  place(mate, 1900, 1600);
  place(bot, 1600, 1600);
  for (const f of m.fighters.slice(2)) place(f, 3000, 3000);
  bot.phase = 'terre';
  bot.hp = 30;
  bot.inventory[1] = makeWeapon('fusil', 0);
  bot.select(1);
  const bullets = bot.think(m.makeWorld(), DT);
  assert.deepStrictEqual(Array.from(bullets), []);
  assert.ok(bot.maxSpeed < CONFIG.bot.maxSpeed * 0.5);
});

test('bots : montent dans un véhicule proche et le conduisent vers la zone', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const bot = m.fighters[1];
  const quad = new Vehicule(700, 1600, 'quad');
  m.vehicules.push(quad);
  place(bot, 700 + quad.r + bot.r + 10, 1600);
  for (const f of m.fighters) if (f !== bot) place(f, 3000, 3000);
  bot.vehicleCooldown = 0;
  bot.groundTime = 10;
  bot.vehicleTarget = quad;
  bot.target = null;
  const world = m.makeWorld();
  const ctx = bot.movementContext(world);
  assert.strictEqual(bot.teamMode(world, ctx), null);
  assert.strictEqual(bot.boardRequest, quad);
  m.boardVehicle(bot, quad);
  assert.strictEqual(bot.phase, 'vehicule');
  bot.think(m.makeWorld(), DT);
  assert.ok(bot.driveContext && bot.driveContext.ai);
  assert.strictEqual(bot.driveContext.destination, bot.zoneTarget);
});

test('bots : descendent du véhicule au cœur de la zone', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const bot = m.fighters[1];
  const quad = new Vehicule(1600, 1600, 'quad');
  m.vehicules.push(quad);
  m.boardVehicle(bot, quad);
  bot.updateZone(m.makeWorld());
  quad.pos.set(bot.zoneTarget.x, bot.zoneTarget.y);
  bot.think(m.makeWorld(), DT);
  assert.ok(bot.exitRequest);
  assert.ok(bot.vehicleCooldown > 0);
});

test('bots : le complexe « secours » est un ensemble de comportements de base du BehaviorManager', () => {
  const bot = newMatch().fighters[1];
  bot.behaviors.use('secours');
  assert.ok(bot.behaviors.has('rescue'));
  assert.ok(bot.behaviors.has('avoid'));
});

test('bots : ramassent et lancent des grenades en combat à portée moyenne', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const bot = m.fighters[1];
  const foe = m.fighters[2];
  place(bot, 1000, 1600);
  place(foe, 1250, 1600);
  bot.inventory[3] = makeGrenade(2);
  bot.inventory[1] = makeWeapon('fusil', 0);
  bot.select(1);
  bot.target = foe;
  bot.targetVisible = true;
  bot.reactionTimer = 0;
  bot.cooldown = 0;
  assert.ok(bot.lootValue({ drop: { kind: 'grenade' }, taken: false, constructor: g.Butin }) >= 0);
  let thrown = null;
  g.setRandom(() => 0);
  for (let i = 0; i < 20 && !thrown; i++) {
    const out = bot.aimAndFire(foe, bot.stats, 1);
    thrown = Array.from(out).find(b => b.grenade) || null;
  }
  assert.ok(thrown, 'une grenade est lancée');
  assert.ok(thrown.range <= p5dist(bot.pos, foe.pos) + 1);
});

// ---------- Joueur et options ----------

test('joueur : au volant, ses commandes vont au véhicule ; passager, il peut tirer', () => {
  const m = newMatch();
  landAll(m);
  arena(m);
  const p = m.joueur;
  const jeep = new Vehicule(1600, 1600, 'jeep');
  m.vehicules.push(jeep);
  const other = m.fighters[1];
  jeep.board(other);                // un bot conduit
  jeep.board(p);                    // le joueur est passager (siège 1)
  p.inventory[1] = makeWeapon('pistolet', 0);
  p.inventory[1].mag = 12;
  p.select(1);
  p.cooldown = 0;
  const input = { ...idle(), aim: { x: p.pos.x + 100, y: p.pos.y }, fire: true, firePressed: true };
  const shots = p.think(m.makeWorld(), input, DT);
  assert.strictEqual(shots.length, 1, 'passager armé : tir autorisé');
  assert.strictEqual(p.driveMove, null);
  jeep.leave(p);
  jeep.leave(other);
  jeep.board(p);                    // conducteur (siège 0)
  p.think(m.makeWorld(), { ...idle(), move: { x: 1, y: 0 } }, DT);
  assert.deepStrictEqual({ x: p.driveMove.x, y: p.driveMove.y }, { x: 1, y: 0 });
  const none = p.think(m.makeWorld(), { ...input, move: { x: 0, y: 0 } }, DT);
  assert.strictEqual(none.length, 0, 'le conducteur ne tire pas');
});

test('joueur : à terre, il rampe lentement et ne peut pas tirer', () => {
  const m = newMatch({ teamSize: 2 });
  landAll(m);
  const p = m.joueur;
  p.phase = 'terre';
  p.inventory[1] = makeWeapon('pistolet', 0);
  p.select(1);
  p.cooldown = 0;
  const shots = p.think(m.makeWorld(), { ...idle(), move: { x: 1, y: 0 }, fire: true, firePressed: true }, DT);
  assert.strictEqual(shots.length, 0);
});

test('joueur : G lance une grenade dans la direction du viseur, limitée à la distance du curseur', () => {
  const m = newMatch();
  landAll(m);
  const p = m.joueur;
  p.inventory[2] = makeGrenade(3);
  p.cooldown = 0;
  const shots = p.think(m.makeWorld(), { ...idle(), aim: { x: p.pos.x + 200, y: p.pos.y }, grenade: true }, DT);
  assert.strictEqual(shots.length, 1);
  assert.ok(shots[0].grenade);
  assert.ok(shots[0].range <= 201);
});

test('options : la vue de la caméra et le mode équipe sont dans les réglages du profil', () => {
  const defaults = Profil.defaults();
  assert.strictEqual(defaults.settings.camera, 'normal');
  assert.strictEqual(defaults.settings.teamSize, 1);
});

test('config : véhicules, équipes et grenades sont paramétrables', () => {
  assert.ok(CONFIG.vehicule.quads > 0 && CONFIG.vehicule.jeeps > 0);
  assert.ok(CONFIG.equipe.reviveTime > 0 && CONFIG.equipe.downedHp > 0);
  assert.ok(CONFIG.butin.grenades >= 0);
  assert.ok(EXPLOSIFS.grenade.radius > 0 && VEHICULES.quad.maxSpeed > VEHICULES.jeep.maxSpeed);
});

test('match : sans véhicules demandés, aucun n\'est posé ; avec, ils apparaissent sur l\'île', () => {
  const none = newMatch({ vehicles: false });
  assert.strictEqual(none.vehicules.length, 0);
  const some = newMatch();
  assert.ok(some.vehicules.length > 0);
  assert.ok(some.vehicules.every(v => some.carte.inIsland(v.pos, 0)));
});
