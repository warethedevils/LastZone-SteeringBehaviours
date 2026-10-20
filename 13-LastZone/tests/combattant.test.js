const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(43);
const { Combattant, Joueur, makeWeapon, makeHeal, CONFIG, WEAPONS, SOINS, weaponStats, resetConfig, createVector } = g;
const DT = 1 / 60;

test.beforeEach(() => { resetConfig(); g.seed(9); });

function fighter(weapon = null, ammo = 0) {
  const f = new Combattant(100, 100, 'test');
  if (weapon) { f.inventory[1] = weapon; f.select(1); f.ammo[WEAPONS[weapon.type].ammo] = ammo; }
  return f;
}

test('tir : cadence, chargeur décrémenté, balle orientée selon le viseur', () => {
  const f = fighter(makeWeapon('mitraillette', 0), 90);
  f.aim = 0;
  let shots = 0;
  for (let i = 0; i < 60; i++) { f.tick(DT); shots += f.tryFire(true, i === 0).length; }
  const rate = weaponStats(f.weapon).rate;
  assert.ok(Math.abs(shots - rate) <= 2, `${shots} tirs pour ${rate}/s`);
  assert.strictEqual(f.weapon.mag, WEAPONS.mitraillette.mag - shots);
  const f2 = fighter(makeWeapon('fusil', 0), 30);
  f2.aim = Math.PI / 2;
  f2.tick(DT);
  const [bullet] = f2.tryFire(true, true);
  assert.ok(bullet.vel.y > 0 && Math.abs(bullet.vel.x) < bullet.vel.mag() * 0.2);
  assert.strictEqual(bullet.owner, f2);
});

test('arme semi-automatique : un tir par pression, pas en maintenant', () => {
  const f = fighter(makeWeapon('pistolet', 0), 60);
  assert.strictEqual(f.tryFire(true, false).length, 0, 'maintenu sans front montant');
  assert.strictEqual(f.tryFire(true, true).length, 1);
  assert.strictEqual(f.tryFire(true, true).length, 0, 'cadence');
  for (let i = 0; i < 40; i++) f.tick(DT);
  assert.strictEqual(f.tryFire(true, true).length, 1);
});

test('fusil à pompe : plusieurs plombs par tir, dispersés', () => {
  const f = fighter(makeWeapon('pompe', 0), 12);
  const bullets = f.tryFire(true, true);
  assert.strictEqual(bullets.length, WEAPONS.pompe.pellets);
  const angles = new Set(bullets.map(b => b.vel.heading().toFixed(4)));
  assert.ok(angles.size > 1);
  assert.strictEqual(f.weapon.mag, WEAPONS.pompe.mag - 1, 'un tir consomme une cartouche');
});

test('sans arme, gâchette relâchée, en rechargement, en utilisation ou en chute : pas de tir', () => {
  assert.strictEqual(new Combattant(0, 0, 'x').tryFire(true, true).length, 0);
  const f = fighter(makeWeapon('fusil', 0), 30);
  assert.strictEqual(f.tryFire(false, false).length, 0);
  f.phase = 'chute';
  assert.strictEqual(f.tryFire(true, true).length, 0);
  f.phase = 'sol';
  f.reloading = true;
  assert.strictEqual(f.tryFire(true, true).length, 0);
  f.reloading = false;
  f.using = { slot: 1, t: 0, total: 3 };
  assert.strictEqual(f.tryFire(true, true).length, 0);
});

test('rechargement : durée exacte, transfère min(manque, réserve), annulé en changeant d\'objet', () => {
  const f = fighter(makeWeapon('fusil', 0), 10);
  f.weapon.mag = 5;
  assert.ok(f.startReload());
  const duration = weaponStats(f.weapon).reload;
  for (let i = 0; i < Math.ceil(duration * 60) - 3; i++) f.tick(DT);
  assert.ok(f.reloading, 'pas encore terminé');
  for (let i = 0; i < 6; i++) f.tick(DT);
  assert.ok(!f.reloading);
  assert.strictEqual(f.weapon.mag, 15, 'seulement 10 munitions en réserve');
  assert.strictEqual(f.ammo.moyenne, 0);
  const g2 = fighter(makeWeapon('fusil', 0), 30);
  g2.weapon.mag = 1;
  g2.startReload();
  g2.select(0);
  assert.ok(!g2.reloading);
});

test('rechargement impossible : chargeur plein ou plus de munitions', () => {
  assert.strictEqual(fighter(makeWeapon('fusil', 0), 30).startReload(), false);
  const f = fighter(makeWeapon('fusil', 0), 0);
  f.weapon.mag = 3;
  assert.strictEqual(f.startReload(), false);
});

test('chargeur vide : le tir déclenche le rechargement automatique', () => {
  const f = fighter(makeWeapon('pistolet', 0), 24);
  f.weapon.mag = 0;
  assert.strictEqual(f.tryFire(true, true).length, 0);
  assert.ok(f.reloading);
});

test('dégâts : le bouclier absorbe d\'abord, l\'invulnérabilité protège, la mort est signalée', () => {
  const f = new Combattant(0, 0, 'x');
  f.shield = 30;
  assert.strictEqual(f.takeDamage(20), false);
  assert.strictEqual(f.shield, 10);
  assert.strictEqual(f.hp, 100);
  assert.strictEqual(f.takeDamage(40), false);
  assert.strictEqual(f.shield, 0);
  assert.strictEqual(f.hp, 70);
  f.invulnerable = 1;
  assert.strictEqual(f.takeDamage(500), false);
  assert.strictEqual(f.hp, 70);
  f.invulnerable = 0;
  assert.strictEqual(f.takeDamage(70), true);
  assert.strictEqual(f.takeDamage(0), false);
});

test('soins : durée, plafond, consommation de la pile, annulation en changeant d\'objet', () => {
  const f = new Combattant(0, 0, 'x');
  f.inventory[1] = makeHeal('bandage', 2);
  f.select(1);
  f.hp = 50;
  assert.ok(f.startUse());
  for (let i = 0; i < SOINS.bandage.use * 60 - 3; i++) f.tick(DT);
  assert.strictEqual(f.hp, 50, 'pas avant la fin');
  for (let i = 0; i < 6; i++) f.tick(DT);
  assert.strictEqual(f.hp, 65);
  assert.strictEqual(f.inventory[1].count, 1);
  f.hp = 74;
  f.startUse();
  for (let i = 0; i < 200; i++) f.tick(DT);
  assert.strictEqual(f.hp, 75, 'plafonné à 75');
  assert.strictEqual(f.inventory[1], null, 'pile épuisée');
  f.inventory[2] = makeHeal('mini', 1);
  f.select(2);
  f.shield = 0;
  f.startUse();
  f.select(0);
  assert.strictEqual(f.using, null);
  assert.strictEqual(f.inventory[2].count, 1, 'rien consommé');
});

test('soins inutiles refusés : vie ou bouclier déjà au plafond', () => {
  const f = new Combattant(0, 0, 'x');
  f.inventory[1] = makeHeal('trousse', 1);
  f.select(1);
  assert.strictEqual(f.startUse(), false);
  f.inventory[2] = makeHeal('grand', 1);
  f.select(2);
  f.shield = 100;
  assert.strictEqual(f.canUse(), false);
  f.shield = 99;
  assert.strictEqual(f.canUse(), true);
});

test('ramassage : munitions et matériaux plafonnés', () => {
  const f = new Combattant(0, 0, 'x');
  const r = f.pickup({ kind: 'munitions', type: 'legere', count: 400 });
  assert.ok(r.taken && r.dropped === null);
  assert.strictEqual(f.ammo.legere, 300);
  f.pickup({ kind: 'materiau', type: 'bois', count: 30 });
  assert.strictEqual(f.mats.bois, 30);
});

test('ramassage d\'armes : emplacement libre, auto-équipement, échange quand c\'est plein', () => {
  const f = new Combattant(0, 0, 'x');
  const r1 = f.pickup({ kind: 'arme', type: 'pistolet', rarity: 0, mag: 12 });
  assert.ok(r1.taken && f.inventory[1].type === 'pistolet');
  assert.strictEqual(f.slot, 1, 'équipée automatiquement');
  f.pickup({ kind: 'arme', type: 'fusil', rarity: 1, mag: 30 });
  f.pickup({ kind: 'arme', type: 'pompe', rarity: 1, mag: 6 });
  f.pickup({ kind: 'arme', type: 'sniper', rarity: 1, mag: 5 });
  assert.ok(f.inventory.slice(1).every(Boolean));
  f.select(2);
  const swap = f.pickup({ kind: 'arme', type: 'mitraillette', rarity: 3, mag: 30 });
  assert.ok(swap.taken);
  assert.strictEqual(swap.dropped.type, 'fusil', 'l\'arme remplacée est reposée');
  assert.strictEqual(f.inventory[2].type, 'mitraillette');
  f.select(0);
  assert.strictEqual(f.pickup({ kind: 'arme', type: 'pistolet', rarity: 0, mag: 12 }).taken, false, 'pioche en main : refusé');
});

test('ramassage de soins : empilement jusqu\'au maximum, sinon refusé', () => {
  const f = new Combattant(0, 0, 'x');
  f.pickup({ kind: 'soin', type: 'trousse', count: 2 });
  assert.strictEqual(f.inventory[1].count, 2);
  assert.ok(f.pickup({ kind: 'soin', type: 'trousse', count: 5 }).taken);
  assert.strictEqual(f.inventory[1].count, SOINS.trousse.stack);
  assert.strictEqual(f.pickup({ kind: 'soin', type: 'trousse', count: 1 }).taken, false);
  const full = new Combattant(0, 0, 'x');
  for (let i = 1; i <= 4; i++) full.inventory[i] = makeWeapon('pistolet', 0);
  assert.strictEqual(full.pickup({ kind: 'soin', type: 'mini', count: 1 }).taken, false);
});

test('dropAll : tout ce que le combattant portait', () => {
  const f = new Combattant(0, 0, 'x');
  f.inventory[1] = makeWeapon('fusil', 2);
  f.inventory[2] = makeHeal('mini', 3);
  f.ammo.moyenne = 40;
  f.mats.bois = 50;
  const drops = f.dropAll();
  assert.ok(drops.some(d => d.kind === 'arme' && d.type === 'fusil'));
  assert.ok(drops.some(d => d.kind === 'bouclier' && d.count === 3));
  assert.ok(drops.some(d => d.kind === 'munitions' && d.count === 20));
  assert.ok(drops.some(d => d.kind === 'materiau' && d.count === 25));
  assert.ok(!drops.some(d => d.kind === 'pioche'));
});

test('meilleure arme : la plus forte (dps)', () => {
  const f = new Combattant(0, 0, 'x');
  f.inventory[1] = makeWeapon('pistolet', 0);
  f.inventory[3] = makeWeapon('fusil', 3);
  assert.strictEqual(f.bestWeapon().index, 3);
  assert.strictEqual(new Combattant(0, 0, 'y').bestWeapon(), null);
});

test('mouvement : la vitesse désirée est atteinte sans dépasser maxForce par pas', () => {
  const f = new Combattant(0, 0, 'x');
  f.maxSpeed = 3; f.maxForce = 0.6;
  f.steerMove({ x: 1, y: 0 }, 3);
  assert.ok(f.acc.mag() <= 0.6 + 1e-9);
  for (let i = 0; i < 20; i++) { f.steerMove({ x: 1, y: 0 }, 3); f.update(); }
  assert.ok(Math.abs(f.vel.x - 3) < 1e-6);
  f.acc.set(0, 0);
  f.steerMove({ x: 0, y: 0 }, 3);
  assert.ok(f.acc.x < 0, 'freine quand il n\'y a plus d\'entrée');
});

test('Joueur : les actions de scène sont déclarées, le viseur suit le point visé', () => {
  const p = new Joueur(0, 0, 'moi');
  const base = { move: { x: 0, y: 0 }, aim: { x: 0, y: 100 }, fire: false, firePressed: false, sprint: false };
  p.think({}, { ...base, interact: true, build: true, jump: true }, DT);
  assert.ok(p.wantsInteract && p.wantsBuild && p.wantsJump);
  assert.ok(Math.abs(p.aim - Math.PI / 2) < 1e-9);
  p.think({}, { ...base, fire: true }, DT);
  assert.ok(p.swingNow, 'pioche en main : coup de pioche');
  p.harvestTimer = 0.3;
  p.think({}, { ...base, fire: true }, DT);
  assert.ok(!p.swingNow, 'cadence de la pioche');
});

test('Joueur : sprint plus rapide, changement d\'emplacement et molette', () => {
  const p = new Joueur(0, 0, 'moi');
  p.inventory[1] = makeWeapon('pistolet', 0);
  p.inventory[2] = makeWeapon('fusil', 0);
  const input = { move: { x: 1, y: 0 }, aim: { x: 100, y: 0 }, fire: false, firePressed: false, slot: 2 };
  p.think({}, input, DT);
  assert.strictEqual(p.slot, 2);
  p.think({}, { ...input, slot: null, scroll: 1 }, DT);
  assert.strictEqual(p.slot, 3);
  p.think({}, { ...input, slot: 0, scroll: -1 }, DT);
  assert.strictEqual(p.slot, 4, 'la molette boucle');
  const walk = new Joueur(0, 0, 'a'), run = new Joueur(0, 0, 'b');
  for (let i = 0; i < 120; i++) {
    walk.think({}, { move: { x: 1, y: 0 }, aim: { x: 1, y: 0 }, sprint: false }, DT); walk.update();
    run.think({}, { move: { x: 1, y: 0 }, aim: { x: 1, y: 0 }, sprint: true }, DT); run.update();
  }
  assert.ok(run.vel.x > walk.vel.x * 1.3);
});

test('Joueur : un clic suffit à tirer avec une arme semi-automatique', () => {
  const p = new Joueur(0, 0, 'moi');
  p.inventory[1] = makeWeapon('pistolet', 0);
  p.select(1);
  p.ammo.legere = 30;
  const shots = p.think({}, { move: { x: 0, y: 0 }, aim: { x: 100, y: 0 }, fire: false, firePressed: true }, DT);
  assert.strictEqual(shots.length, 1);
});

test('Joueur : en chute, la phase se déroule et le tir est impossible', () => {
  const p = new Joueur(0, 0, 'moi');
  p.phase = 'chute';
  p.fallTime = 5;
  p.inventory[1] = makeWeapon('pistolet', 0);
  p.select(1);
  const shots = p.think({}, { move: { x: 1, y: 0 }, aim: { x: 10, y: 0 }, fire: true, firePressed: true }, 1);
  assert.strictEqual(shots.length, 0);
  assert.strictEqual(p.fallTime, 4);
});
