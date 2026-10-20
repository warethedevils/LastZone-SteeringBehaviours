const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(59);
const { Match, Joueur, Bot, Cerveau, Evolution, Genome, Coffre, Butin, Arbre, Mur, Balle, makeWeapon, makeHeal, WEAPONS, CONFIG, resetConfig, createVector } = g;
const DT = 1 / 60;

test.beforeEach(() => { resetConfig(); g.seed(21); });

const idle = () => ({ move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, fire: false, firePressed: false, sprint: false });

function newMatch(options = {}) {
  g.seed(options.seed || 21);
  return new Match({ fighters: 12, faune: false, ...options });
}

// Fait atterrir tout le monde et démarre la tempête
function landAll(m) {
  for (let i = 0; i < 60 * 40 && (m.bus || m.fighters.some(f => f.alive && f.phase !== 'sol')); i++) m.step(DT, idle());
}

function playerOnGround(m) {
  landAll(m);
  const p = m.joueur;
  p.invulnerable = 1e9;
  return p;
}

function run(m, seconds, input = idle) { for (let i = 0; i < Math.round(seconds * 60) && m.state !== 'fin'; i++) m.step(DT, input()); }

test('démarrage : N combattants dans le bus, un seul joueur humain, tempête non démarrée', () => {
  const m = newMatch();
  assert.strictEqual(m.fighters.length, 12);
  assert.ok(m.joueur instanceof Joueur);
  assert.strictEqual(m.bots.length, 11);
  assert.ok(m.fighters.every(f => f.phase === 'bus'));
  assert.ok(m.bus && m.state === 'bus' && !m.stormStarted);
  assert.ok(m.coffres.length >= CONFIG.butin.chests && m.butins.length > 100);
  assert.strictEqual(new Set(m.fighters.map(f => f.name)).size, 12, 'noms uniques');
});

test('bus : les combattants voyagent avec le bus puis sautent ; le joueur saute sur demande', () => {
  const m = newMatch();
  m.step(DT, idle());
  assert.ok(m.joueur.pos.dist(m.bus.pos) < 1);
  run(m, 1);
  assert.strictEqual(m.joueur.phase, 'bus');
  m.step(DT, { ...idle(), jump: true });
  m.step(DT, idle());                   // le joueur déclare son intention, le bus l'exécute au pas suivant
  assert.strictEqual(m.joueur.phase, 'chute');
  assert.ok(m.events.some(e => e.type === 'jump'));
  assert.ok(m.joueur.fallTime <= CONFIG.match.fallTime && m.joueur.fallTime > CONFIG.match.fallTime - 0.1);
});

test('bus : saut automatique du joueur, puis le bus disparaît et la partie démarre', () => {
  const m = newMatch();
  run(m, CONFIG.match.autoJumpAfter + 1);
  assert.notStrictEqual(m.joueur.phase, 'bus');
  landAll(m);
  assert.strictEqual(m.bus, null);
  assert.ok(m.stormStarted);
  assert.strictEqual(m.state, 'jeu');
  assert.ok(m.fighters.filter(f => f.alive).every(f => f.phase === 'sol'));
});

test('atterrissage : bouclier d\'invulnérabilité, sur l\'île, hors des obstacles', () => {
  const m = newMatch();
  run(m, CONFIG.match.autoJumpAfter + CONFIG.match.fallTime + 0.5);
  const p = m.joueur;
  assert.strictEqual(p.phase, 'sol');
  assert.ok(m.carte.inIsland(p.pos, 5));
  for (const c of m.grid.query(p.pos.x, p.pos.y, p.r + 2)) {
    assert.ok(p5d(p.pos, c.pos) >= p.r + c.r - 1.5, 'pas dans un obstacle');
  }
});

function p5d(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// Point de l'île avec une ligne horizontale dégagée (aucun obstacle) autour de lui
function clearSpot(m, length = 400) {
  for (let i = 0; i < 600; i++) {
    const p = m.carte.randomPoint(60);
    const a = createVector(p.x - 120, p.y), b = createVector(p.x + length, p.y);
    if (m.carte.inIsland(a, 20) && m.carte.inIsland(b, 20) && !m.grid.segmentHit(a, b, 25)) return p;
  }
  throw new Error('aucun emplacement dégagé');
}

test('coffre : s\'ouvre à portée avec E, libère du butin, compté pour le joueur', () => {
  const m = newMatch();
  const p = playerOnGround(m);
  const chest = m.coffres.find(c => !c.opened);
  p.pos.set(chest.pos.x + 30, chest.pos.y);
  const before = m.butins.length;
  m.step(DT, { ...idle(), interact: true });
  assert.ok(chest.opened);
  assert.ok(m.butins.length >= before + 2);
  assert.strictEqual(p.chestsOpened, 1);
  assert.ok(m.events.some(e => e.type === 'chest'));
  assert.strictEqual(m.lootGrid.query(chest.pos.x, chest.pos.y, 5).includes(chest), false, 'retiré de l\'index');
});

test('coffre : hors de portée, rien ne se passe', () => {
  const m = newMatch();
  const p = playerOnGround(m);
  const chest = m.coffres.find(c => !c.opened);
  p.pos.set(chest.pos.x + CONFIG.joueur.pickupRadius + 40, chest.pos.y);
  m.step(DT, { ...idle(), interact: true });
  assert.ok(!chest.opened);
});

test('ramassage : E prend le butin le plus proche, les munitions se ramassent en marchant dessus', () => {
  const m = newMatch();
  const p = playerOnGround(m);
  const point = m.carte.randomPoint(40);
  p.pos.set(point.x, point.y);
  const far = m.addButin(point.x + 50, point.y, { kind: 'arme', type: 'pompe', rarity: 1, mag: 6 });
  const near = m.addButin(point.x + 20, point.y, { kind: 'arme', type: 'fusil', rarity: 2, mag: 30 });
  m.step(DT, { ...idle(), interact: true });
  assert.ok(near.taken && !far.taken);
  assert.strictEqual(p.inventory[1].type, 'fusil');
  const ammo = m.addButin(p.pos.x + 5, p.pos.y, { kind: 'munitions', type: 'moyenne', count: 30 });
  m.step(DT, idle());
  assert.ok(ammo.taken);
  assert.strictEqual(p.ammo.moyenne, 30);
});

test('échange d\'arme : l\'ancienne est reposée au sol', () => {
  const m = newMatch();
  const p = playerOnGround(m);
  for (let i = 1; i <= 4; i++) p.inventory[i] = makeWeapon('pistolet', 0);
  p.select(2);
  const pt = m.carte.randomPoint(40);
  p.pos.set(pt.x, pt.y);
  m.addButin(pt.x + 10, pt.y, { kind: 'arme', type: 'sniper', rarity: 3, mag: 5 });
  const before = m.butins.length;
  m.step(DT, { ...idle(), interact: true });
  assert.strictEqual(p.inventory[2].type, 'sniper');
  assert.ok(m.butins.some(b => b.drop.kind === 'arme' && b.drop.type === 'pistolet' && !b.taken));
  assert.ok(m.butins.length >= before - 1);
});

test('récolte : la pioche abat un arbre devant soi et rapporte du bois', () => {
  const m = newMatch();
  const p = playerOnGround(m);
  const tree = m.carte.trees[0];
  p.pos.set(tree.pos.x - 70, tree.pos.y);
  p.vel.set(0, 0);
  let swings = 0;
  const input = () => ({ ...idle(), aim: { x: tree.pos.x, y: tree.pos.y }, fire: true });
  for (let i = 0; i < 60 * 6 && !tree.dead; i++) { m.step(DT, input()); swings++; }
  assert.ok(tree.dead);
  assert.ok(p.mats.bois >= 50);
  assert.ok(!m.carte.trees.includes(tree));
  assert.strictEqual(m.grid.query(tree.pos.x, tree.pos.y, 2).some(c => c.parent === tree), false);
  assert.ok(p.woodHarvested >= 50);
  assert.ok(swings > 4, 'plusieurs coups');
});

test('récolte : pas d\'effet si la cible est derrière ou trop loin', () => {
  const m = newMatch();
  const p = playerOnGround(m);
  const tree = m.carte.trees[1];
  p.pos.set(tree.pos.x - 70, tree.pos.y);
  m.step(DT, { ...idle(), aim: { x: tree.pos.x - 500, y: tree.pos.y }, fire: true });
  assert.strictEqual(tree.hp, tree.maxHp);
  p.pos.set(tree.pos.x - 400, tree.pos.y);
  p.harvestTimer = 0;
  m.step(DT, { ...idle(), aim: { x: tree.pos.x, y: tree.pos.y }, fire: true });
  assert.strictEqual(tree.hp, tree.maxHp);
});

test('construction : un mur coûte du bois, bloque les balles, se détruit sous le feu', () => {
  const m = newMatch();
  const p = playerOnGround(m);
  m.murs.slice().forEach(w => m.carte.removeEntity(w, m.murs));   // murs déjà posés par des bots
  const pt = clearSpot(m);
  p.pos.set(pt.x, pt.y);
  p.mats.bois = 25;
  const aim = { x: pt.x + 100, y: pt.y };
  m.step(DT, { ...idle(), aim, build: true });
  assert.strictEqual(m.murs.length, 1);
  assert.strictEqual(p.mats.bois, 15);
  m.step(DT, { ...idle(), aim, build: true });
  assert.strictEqual(m.murs.length, 1, 'délai entre deux murs');
  for (let i = 0; i < 40; i++) m.step(DT, idle());
  const wall = m.murs[0];
  // une balle tirée vers le mur est arrêtée
  const shooter = m.bots.find(b => b.alive) || m.joueur;
  const bullet = new Balle(wall.pos.x - 30, wall.pos.y, 0, 20, 30, 500, shooter);
  m.bullets.push(bullet);
  for (let i = 0; i < 10; i++) m.stepBullets();
  assert.ok(bullet.dead);
  assert.ok(wall.hp < wall.maxHp);
  wall.hp = 1;
  const killer = new Balle(wall.pos.x - 30, wall.pos.y, 0, 20, 30, 500, shooter);
  m.bullets.push(killer);
  for (let i = 0; i < 10; i++) m.stepBullets();
  assert.strictEqual(m.murs.length, 0);
  assert.strictEqual(m.grid.query(wall.pos.x, wall.pos.y, 3).some(c => c.parent === wall), false);
});

test('construction : impossible sans assez de bois', () => {
  const m = newMatch();
  const p = playerOnGround(m);
  m.murs.slice().forEach(w => m.carte.removeEntity(w, m.murs));
  p.mats.bois = 9;
  m.step(DT, { ...idle(), build: true });
  assert.strictEqual(m.murs.length, 0);
});

test('balles : touchent un combattant (dégâts atténués), pas leur tireur, bloquées par un arbre', () => {
  const m = newMatch();
  landAll(m);
  const shooter = m.fighters[1], victim = m.fighters[2];
  for (const f of m.fighters) if (f !== shooter && f !== victim) { f.alive = false; f.phase = 'mort'; }
  m.alive = m.fighters.filter(f => f.alive);
  const spot = clearSpot(m);
  shooter.pos.set(spot.x, spot.y);
  victim.pos.set(spot.x + 150, spot.y);
  shooter.invulnerable = 0; victim.invulnerable = 0;
  victim.hp = 100; victim.shield = 0;
  const bullet = new Balle(spot.x + 20, spot.y, 0, 20, 40, 500, shooter);
  m.bullets.push(bullet);
  for (let i = 0; i < 12; i++) m.stepBullets();
  assert.ok(bullet.dead);
  assert.ok(Math.abs(victim.hp - (100 - 40 * CONFIG.match.damageScale)) < 1e-6, `${victim.hp}`);
  assert.ok(shooter.damageDealt > 0);
  assert.strictEqual(shooter.hp, 100);
  // un arbre entre les deux arrête la balle
  const tree = new Arbre(spot.x + 80, spot.y, 1);
  m.carte.addEntity(tree, m.carte.trees);
  victim.hp = 100;
  const blocked = new Balle(spot.x + 20, spot.y, 0, 20, 40, 500, shooter);
  m.bullets.push(blocked);
  for (let i = 0; i < 12; i++) m.stepBullets();
  assert.strictEqual(victim.hp, 100);
});

test('balles : un combattant invulnérable ne subit rien', () => {
  const m = newMatch();
  landAll(m);
  const shooter = m.fighters[1], victim = m.fighters[2];
  const spot = clearSpot(m);
  shooter.pos.set(spot.x, spot.y);
  victim.pos.set(spot.x + 100, spot.y);
  victim.invulnerable = 5;
  const hp = victim.hp;
  m.bullets.push(new Balle(spot.x + 20, spot.y, 0, 20, 90, 500, shooter));
  for (let i = 0; i < 10; i++) m.stepBullets();
  assert.strictEqual(victim.hp, hp);
});

test('élimination : butin lâché, journal des éliminations, classement et compteurs', () => {
  const m = newMatch();
  landAll(m);
  const killer = m.fighters[1], victim = m.fighters[2];
  victim.inventory[1] = makeWeapon('fusil', 2);
  victim.mats.bois = 40;
  const before = m.butins.length;
  const alive = m.fighters.filter(f => f.alive).length;
  m.eliminate(victim, killer, 'balle');
  assert.ok(!victim.alive && victim.phase === 'mort');
  assert.strictEqual(victim.placement, alive);
  assert.strictEqual(killer.kills, 1);
  assert.ok(m.butins.length >= before + 2);
  assert.ok(m.killfeed.some(k => k.text.includes(killer.name) && k.text.includes(victim.name)));
  assert.ok(m.events.some(e => e.type === 'elimination'));
  assert.strictEqual(victim.killedBy, killer.name);
  m.eliminate(victim, killer);
  assert.strictEqual(killer.kills, 1, 'une seule fois');
});

test('élimination du joueur et du dernier adversaire : événements et fin de partie', () => {
  const m = newMatch({ fighters: 3 });
  landAll(m);
  const [p, a, b] = m.fighters;
  m.eliminate(a, p);
  assert.ok(m.events.some(e => e.type === 'kill'));
  m.step(DT, idle());
  assert.strictEqual(m.state, 'jeu');
  m.eliminate(b, p);
  m.step(DT, idle());
  assert.strictEqual(m.state, 'fin');
  assert.strictEqual(m.winner, p);
  assert.ok(m.result.won && m.result.placement === 1 && m.result.kills === 2);
  assert.ok(m.events.some(e => e.type === 'victory'));
  assert.strictEqual(a.placement, 3);
  assert.strictEqual(b.placement, 2);
});

test('défaite du joueur : classement et événement de mort', () => {
  const m = newMatch({ fighters: 4, faune: false });
  landAll(m);
  const [p, a, b, c] = m.fighters;
  m.eliminate(c, a);
  m.eliminate(p, b, 'balle');
  assert.strictEqual(p.placement, 3);
  assert.ok(m.events.some(e => e.type === 'death'));
  assert.strictEqual(m.spectateTarget().alive, true);
  m.eliminate(a, b);
  m.step(DT, idle());
  assert.strictEqual(m.state, 'fin');
  assert.strictEqual(m.result.placement, 3);
  assert.ok(!m.result.won);
});

test('tempête : dégâts hors de la zone, éliminations par la tempête', () => {
  const m = newMatch({ fighters: 3 });
  const p = playerOnGround(m);
  p.invulnerable = 0;
  m.storm.pos.set(p.pos.x + 2000, p.pos.y);
  m.storm.r = 100;
  const hp = p.hp;
  run(m, 2);
  assert.ok(p.hp < hp - 1.5 * m.storm.dps || !p.alive);
  p.hp = 0.5;
  run(m, 1);
  assert.ok(!p.alive);
  assert.ok(m.killfeed.some(k => k.text.includes('tempête')));
});

test('tempête : pas de dégâts dans la zone', () => {
  const m = newMatch({ fighters: 3 });
  const p = playerOnGround(m);
  p.invulnerable = 0;
  m.storm.pos.set(p.pos.x, p.pos.y);
  m.storm.r = 600;
  const hp = p.hp;
  run(m, 2);
  assert.ok(p.hp >= hp - 5, 'seulement d\'éventuelles balles');
});

test('largage : un coffre légendaire apparaît à l\'atterrissage', () => {
  const m = newMatch({ fighters: 3 });
  playerOnGround(m);
  run(m, 2);
  assert.strictEqual(m.largages.length, 1, 'un largage au début de la première phase');
  const drop = m.largages[0];
  const before = m.coffres.length;
  drop.fall = 0.02;
  run(m, 0.2);
  assert.strictEqual(m.largages.length, 0);
  assert.strictEqual(m.coffres.length, before + 1);
  const chest = m.coffres[m.coffres.length - 1];
  assert.ok(chest.legendary);
  const loot = m.chestLoot(true);
  assert.ok(loot.some(d => d.kind === 'arme' && d.rarity >= 2));
});

test('butin de coffre : arme + munitions adaptées', () => {
  const m = newMatch({ fighters: 3 });
  for (let i = 0; i < 30; i++) {
    const loot = m.chestLoot(false);
    const weapon = loot[0];
    assert.strictEqual(weapon.kind, 'arme');
    const ammo = loot.find(d => d.kind === 'munitions');
    assert.strictEqual(ammo.type, WEAPONS[weapon.type].ammo);
  }
});

test('cerveaux : les bots à réseau reçoivent un Cerveau, les autres des règles ; compteur « neural »', () => {
  const brains = Array.from({ length: 11 }, () => Cerveau.random());
  const m = newMatch({ brains, neural: 5 });
  const neural = m.bots.filter(b => b.neural).length;
  assert.strictEqual(neural, 5);
  assert.ok(m.bots.slice(0, 5).every(b => b.neural));
  assert.ok(m.bots.slice(5).every(b => !b.neural));
});

test('enregistrement génétique : seuls les bots à cerveau sont enregistrés, avec leur classement', () => {
  const evolution = new Evolution(null);
  const brains = Array.from({ length: 5 }, () => Cerveau.random());
  const m = newMatch({ fighters: 6, brains, neural: 5, evolution, autoplay: true });
  let steps = 0;
  while (m.state !== 'fin' && steps < 60 * 60 * 10) { m.step(DT, null); steps++; m.events = []; }
  assert.strictEqual(m.state, 'fin');
  assert.strictEqual(evolution.records.length, 6 - 1 + 0 || evolution.records.length, 'enregistré');
  assert.ok(evolution.records.length >= 5);
  for (const r of evolution.records) assert.ok(r.result.placement >= 1 && r.result.placement <= 6);
  const winners = evolution.records.filter(r => r.result.placement === 1).length;
  assert.ok(winners <= 1);
});

test('partie complète autonome : un vainqueur, des classements uniques, aucune valeur non finie', () => {
  const m = newMatch({ fighters: 16, autoplay: true, seed: 33 });
  let steps = 0;
  while (m.state !== 'fin' && steps < 60 * 60 * 12) {
    m.step(DT, null);
    steps++;
    m.events = [];
    if (steps % 600 === 0) for (const f of m.fighters) if (f.alive) assert.ok(Number.isFinite(f.pos.x) && Number.isFinite(f.pos.y));
  }
  assert.strictEqual(m.state, 'fin', `partie terminée après ${Math.round(steps / 60)} s`);
  assert.ok(m.winner);
  const places = m.fighters.map(f => f.alive ? 1 : f.placement).sort((a, b) => a - b);
  assert.deepStrictEqual(Array.from(places), Array.from({ length: 16 }, (_, i) => i + 1));
  assert.ok(steps / 60 > 90 && steps / 60 < 600, 'durée plausible');
});

test('même graine, même partie (déterminisme)', () => {
  const play = () => {
    const m = newMatch({ fighters: 10, autoplay: true, seed: 77 });
    let steps = 0;
    while (m.state !== 'fin' && steps < 60 * 60 * 12) { m.step(DT, null); steps++; m.events = []; }
    return { winner: m.winner && m.winner.name, steps };
  };
  assert.deepStrictEqual(play(), play());
});

test('difficulté : les bots difficiles ont une meilleure perception et réaction', () => {
  const easy = newMatch({ difficulty: 'facile' }).bots[0].diff;
  const hard = newMatch({ difficulty: 'difficile' }).bots[0].diff;
  assert.ok(hard.aim > easy.aim && hard.perception > easy.perception && hard.reaction > easy.reaction);
});

test('vitesse de la tempête : l\'option accélère les phases', () => {
  const normal = newMatch({ stormSpeed: 1 });
  const fast = newMatch({ stormSpeed: 2 });
  assert.ok(Math.abs(fast.storm.timeLeft - normal.storm.timeLeft / 2) < 0.01);
});
