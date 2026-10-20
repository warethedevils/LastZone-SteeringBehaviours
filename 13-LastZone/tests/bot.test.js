const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(47);
const { Bot, Combattant, Grille, Tempete, Butin, Coffre, Cerveau, Genome, Balle, Arbre, makeWeapon, makeHeal, WEAPONS, CONFIG, resetConfig, createVector } = g;
const DT = 1 / 60;

test.beforeEach(() => { resetConfig(); g.seed(13); });

function genome(overrides = {}) {
  const genes = {};
  for (const n of Genome.NAMES) genes[n] = (Genome.RANGES[n][0] + Genome.RANGES[n][1]) / 2;
  return new Genome({ ...genes, ...overrides });
}

// Monde minimal : grille d'obstacles, grille de butin, tempête, balles, île quasi infinie
function scene() {
  const storm = new Tempete({ cx: 1600, cy: 1600, radius: 1400 });
  return {
    fighters: [], grid: new Grille(3200, 3200, 128), lootGrid: new Grille(3200, 3200, 128), storm, bullets: [],
    carte: { cx: 1600, cy: 1600, shoreRadius: () => 5000 }
  };
}

function bot(x = 1600, y = 1600, overrides = {}, individual = genome(overrides)) {
  const b = new Bot(x, y, 'bot', null, individual);
  b.phase = 'sol';
  b.groundTime = 999;           // la période de fouille initiale est terminée
  b.vel.set(0, 0);
  return b;
}

function armed(b, type = 'fusil', rarity = 1) {
  b.inventory[1] = makeWeapon(type, rarity);
  b.ammo[WEAPONS[type].ammo] = 60;
  b.select(1);
  return b;
}

function enemyAt(w, x, y) {
  const e = new Combattant(x, y, 'ennemi');
  e.phase = 'sol';
  w.fighters.push(e);
  return e;
}

// Zone sûre confortable : tempête centrée sur le bot
function calmStorm(w, b) {
  w.storm.pos.set(b.pos.x, b.pos.y);
  w.storm.r = 1500;
}

function ctx(b, w) { return b.perceive(w); }

test('validStates : combat exige un ennemi visible et une arme, soin exige un soin utilisable, butin exige un butin', () => {
  const w = scene();
  const b = bot();
  calmStorm(w, b);
  let c = ctx(b, w);
  let valid = b.validStates(c);
  const at = name => valid[Cerveau.STATES.indexOf(name)];
  assert.ok(at('errance') && at('zone'));
  assert.ok(!at('combat') && !at('fuite') && !at('soin') && !at('butin'));
  armed(b);
  enemyAt(w, b.pos.x + 200, b.pos.y);
  b.hp = 50;
  b.inventory[2] = makeHeal('bandage', 2);
  w.lootGrid.insert(new Butin(b.pos.x + 50, b.pos.y, { kind: 'arme', type: 'pistolet', rarity: 0, mag: 12 }));
  c = ctx(b, w);
  valid = b.validStates(c);
  assert.ok(at('combat') && at('fuite') && at('soin') && at('butin'));
});

test('règles : tempête proche -> zone ; ennemi visible bien armé -> combat ; blessé -> fuite', () => {
  const w = scene();
  const b = armed(bot());
  calmStorm(w, b);
  assert.strictEqual(b.rules(ctx(b, w)), 'errance');

  w.storm.pos.set(b.pos.x + 1000, b.pos.y);
  w.storm.r = 100;                                  // le bot est loin de la zone sûre
  assert.strictEqual(b.rules(ctx(b, w)), 'zone');

  calmStorm(w, b);
  enemyAt(w, b.pos.x + 220, b.pos.y);
  assert.strictEqual(b.rules(ctx(b, w)), 'combat');

  b.hp = 10; b.shield = 0;
  assert.strictEqual(b.rules(ctx(b, w)), 'fuite');
});

test('règles : sans arme on cherche du butin, sinon on erre ou on rejoint la zone', () => {
  const w = scene();
  const b = bot();
  calmStorm(w, b);
  assert.strictEqual(b.rules(ctx(b, w)), 'errance');
  w.lootGrid.insert(new Butin(b.pos.x + 80, b.pos.y, { kind: 'arme', type: 'fusil', rarity: 2, mag: 30 }));
  assert.strictEqual(b.rules(ctx(b, w)), 'butin');
  w.storm.pos.set(b.pos.x + 1200, b.pos.y);
  w.storm.r = 50;
  const c = ctx(b, w);
  assert.strictEqual(b.rules(c), 'butin', 'sans arme, le butin passe avant la tempête lointaine');
});

test('règles : un bot cupide ramasse même le butin de faible valeur, un bot sobre non (déterministe)', () => {
  const w = scene();
  const greedy = armed(bot(1600, 1600, { cupidite: 1 }));
  const sober = armed(bot(1600, 1600, { cupidite: 0 }));
  calmStorm(w, greedy);
  w.lootGrid.insert(new Butin(1650, 1600, { kind: 'materiau', type: 'bois', count: 20 }));
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(greedy.rules(ctx(greedy, w)), 'butin');
    assert.strictEqual(sober.rules(ctx(sober, w)), 'errance');
  }
});

test('règles : se soigne à l\'abri quand la vie est basse', () => {
  const w = scene();
  const b = armed(bot(1600, 1600, { prudence: 1 }));
  calmStorm(w, b);
  b.hp = 40;
  b.inventory[2] = makeHeal('trousse', 1);
  assert.strictEqual(b.rules(ctx(b, w)), 'soin');
  enemyAt(w, b.pos.x + 150, b.pos.y);                // un ennemi proche : pas le moment
  assert.notStrictEqual(b.rules(ctx(b, w)), 'soin');
});

test('enter(soin) sélectionne le soin et lance son utilisation', () => {
  const w = scene();
  const b = bot();
  calmStorm(w, b);
  b.hp = 30;
  b.inventory[3] = makeHeal('trousse', 1);
  const c = ctx(b, w);
  b.enter('soin', c);
  assert.strictEqual(b.state, 'soin');
  assert.strictEqual(b.slot, 3);
  assert.ok(b.using);
  const none = bot();
  none.enter('soin', ctx(none, w));
  assert.strictEqual(none.state, 'errance', 'pas de soin : repli sur errance');
});

test('période de fouille : les ennemis sont ignorés après l\'atterrissage, sauf si on est attaqué', () => {
  const w = scene();
  const b = armed(bot());
  calmStorm(w, b);
  b.groundTime = 1;
  b.calmTime = 20;
  enemyAt(w, b.pos.x + 150, b.pos.y);
  assert.strictEqual(ctx(b, w).visible, false);
  b.lastHit = 1;
  assert.strictEqual(ctx(b, w).visible, true, 'attaqué : il réagit');
  b.lastHit = 99;
  b.groundTime = 21;
  assert.strictEqual(ctx(b, w).visible, true, 'période terminée');
});

test('perception : rayon limité et ligne de vue (un arbre masque l\'ennemi)', () => {
  const w = scene();
  const b = armed(bot());
  calmStorm(w, b);
  const range = CONFIG.bot.perception * b.diff.perception;
  enemyAt(w, b.pos.x + range + 5, b.pos.y);
  assert.strictEqual(b.senseEnemy(w), null, 'hors du rayon');
  w.fighters.length = 0;
  const e = enemyAt(w, b.pos.x + 300, b.pos.y);
  assert.ok(b.senseEnemy(w).visible);
  const tree = new Arbre(b.pos.x + 150, b.pos.y, 1);
  w.grid.insert(tree.colliders[0]);
  const hidden = b.senseEnemy(w);
  assert.ok(hidden && !hidden.visible && hidden.enemy === e);
});

test('perception : l\'ennemi visible le plus proche est choisi, les morts et les parachutistes ignorés', () => {
  const w = scene();
  const b = bot();
  calmStorm(w, b);
  const far = enemyAt(w, b.pos.x + 400, b.pos.y);
  const near = enemyAt(w, b.pos.x, b.pos.y + 200);
  const dead = enemyAt(w, b.pos.x + 50, b.pos.y);
  dead.alive = false;
  const air = enemyAt(w, b.pos.x - 60, b.pos.y);
  air.phase = 'chute';
  assert.strictEqual(b.senseEnemy(w).enemy, near);
  assert.ok(far);
});

test('délai de réaction : pas de tir tant qu\'il vient de repérer sa cible', () => {
  const w = scene();
  const b = armed(bot(1600, 1600, { precision: 1 }));
  b.cooldown = 0;
  calmStorm(w, b);
  const e = enemyAt(w, b.pos.x + 200, b.pos.y);
  b.perceive(w);
  assert.ok(b.reactionTimer > 0);
  b.aim = 0;
  let shots = b.fight(w, DT, {});
  assert.strictEqual(shots.length, 0, 'encore en train de réagir');
  b.reactionTimer = 0;
  b.targetVisible = true;
  b.target = e;
  shots = b.fight(w, DT, {});
  assert.ok(shots.length >= 1, 'tire une fois prêt et aligné');
});

test('combat : le bot s\'oriente vers sa cible avec une rotation limitée et ajoute des forces d\'engagement', () => {
  const w = scene();
  const b = armed(bot(1600, 1600, { precision: 0.8 }));
  calmStorm(w, b);
  const e = enemyAt(w, b.pos.x, b.pos.y + 250);
  b.perceive(w);
  b.reactionTimer = 0;
  b.aim = 0;
  const ctx = {};
  b.fight(w, DT, ctx);
  assert.ok(b.aim > 0 && b.aim <= CONFIG.bot.aimTurn * 1.5, 'tourne vers le bas, pas d\'un coup');
  assert.ok(ctx.ringPoint, 'point de l anneau d engagement fourni au comportement engage');
  assert.ok(e);
});

test('choix d\'arme : le fusil à pompe de près, le sniper de loin', () => {
  const b = bot();
  b.inventory[1] = makeWeapon('pompe', 1); b.ammo.cartouche = 20;
  b.inventory[2] = makeWeapon('sniper', 1); b.ammo.lourde = 20;
  b.inventory[3] = makeWeapon('fusil', 1); b.ammo.moyenne = 60;
  b.chooseWeapon(120);
  assert.notStrictEqual(b.weapon.type, 'sniper');
  b.cooldown = 0;
  b.chooseWeapon(900);
  assert.strictEqual(b.weapon.type, 'sniper');
  b.cooldown = 0;
  b.chooseWeapon(500);
  assert.notStrictEqual(b.weapon.type, 'pompe');
});

test('capteurs : un vecteur de la bonne taille, fini, normalisé', () => {
  const w = scene();
  const b = armed(bot());
  calmStorm(w, b);
  enemyAt(w, b.pos.x + 180, b.pos.y + 60);
  w.lootGrid.insert(new Butin(b.pos.x - 70, b.pos.y, { kind: 'soin', type: 'trousse', count: 1 }));
  w.bullets.push(new Balle(b.pos.x + 100, b.pos.y, Math.PI, 10, 10, 500, w.fighters[0]));
  const x = b.senses(ctx(b, w));
  assert.strictEqual(x.length, Cerveau.INPUTS);
  for (const v of x) assert.ok(Number.isFinite(v) && v >= -1.0001 && v <= 1.0001);
  const i = n => Cerveau.INPUT_LABELS.indexOf(n);
  assert.strictEqual(x[i('armé')], 1);
  assert.strictEqual(x[i('ennemi visible')], 1);
  assert.ok(x[i('butin dispo')] === 1);
  assert.ok(x[i('balles proches')] > 0);
});

test('capteurs : menace ennemie, abri proche et vitesse', () => {
  const w = scene();
  const b = bot();
  calmStorm(w, b);
  const i = n => Cerveau.INPUT_LABELS.indexOf(n);
  let x = b.senses(ctx(b, w));
  assert.strictEqual(x[i('abri proche')], 1, 'rien alentour : 200 px normalisés à 1');
  assert.strictEqual(x[i('menace ennemie')], 0);
  const tree = new Arbre(b.pos.x + 60, b.pos.y, 1);
  w.grid.insert(tree.colliders[0]);
  x = b.senses(ctx(b, w));
  assert.ok(x[i('abri proche')] < 0.3);
  const e = enemyAt(w, b.pos.x, b.pos.y + 250);
  armed(e, 'fusil', 3);
  x = b.senses(ctx(b, w));
  assert.ok(x[i('menace ennemie')] > 0.5);
  b.vel.set(b.maxSpeed, 0);
  assert.ok(b.senses(ctx(b, w))[i('vitesse')] > 0.99);
});

test('capteurs : reflètent la vie, le bouclier et la tempête', () => {
  const w = scene();
  const b = bot();
  calmStorm(w, b);
  b.hp = 40; b.shield = 25;
  let x = b.senses(ctx(b, w));
  const i = n => Cerveau.INPUT_LABELS.indexOf(n);
  assert.ok(Math.abs(x[i('vie')] - 0.4) < 1e-9 && Math.abs(x[i('bouclier')] - 0.25) < 1e-9);
  assert.strictEqual(x[i('hors zone')], 0);
  w.storm.pos.set(b.pos.x + 900, b.pos.y);
  w.storm.r = 100;
  x = b.senses(ctx(b, w));
  assert.strictEqual(x[i('hors zone')], 1);
  assert.ok(x[i('zone dir x')] > 0.9);
});

test('cerveau : le bot suit la décision du réseau (dans les états permis) et applique ses réglages', () => {
  const w = scene();
  const brain = Cerveau.random();
  const b = bot(1600, 1600, {}, brain);
  assert.ok(b.neural);
  calmStorm(w, b);
  const gains = [0.5, -0.5, 0, 0, 0, 1];
  brain.decide = () => ({ state: 'zone', probs: [], idealScale: 0.5, aimTol: -0.3, buildBias: 0.2, gains });
  b.decide(w);
  assert.strictEqual(b.state, 'zone');
  assert.strictEqual(b.mods.idealScale, 0.5);
  assert.strictEqual(b.mods.aimTol, -0.3);
  assert.strictEqual(b.mods.buildBias, 0.2);
  assert.ok(Math.abs(b.gain('butin') - 1.3) < 1e-9 && Math.abs(b.gain('zone') - 0.7) < 1e-9 && Math.abs(b.gain('errance') - 1.6) < 1e-9);
  assert.strictEqual(b.features.length, Cerveau.INPUTS);
});

test('cerveau réel : ne choisit jamais un état masqué', () => {
  const w = scene();
  const brain = Cerveau.random();
  const b = bot(1600, 1600, {}, brain);
  calmStorm(w, b);
  for (let i = 0; i < 150; i++) {
    b.decide(w);
    assert.ok(['errance', 'zone'].includes(b.state), b.state);   // rien d'autre n'est permis ici
  }
});

test('enregistrement : un bot à règles enregistre (capteurs, état en one-hot)', () => {
  const w = scene();
  const b = armed(bot());
  calmStorm(w, b);
  b.recorder = [];
  enemyAt(w, b.pos.x + 200, b.pos.y);
  b.decide(w);
  assert.strictEqual(b.recorder.length, 1);
  const s = b.recorder[0];
  assert.strictEqual(s.x.length, Cerveau.INPUTS);
  assert.strictEqual(s.y.length, Cerveau.OUTPUTS);
  assert.strictEqual(s.y.slice(0, 6).reduce((a, v) => a + v, 0), 1);
  assert.strictEqual(s.y[Cerveau.STATES.indexOf('combat')], 1);
});

test('butin : on préfère une arme quand on est désarmé, on ignore le butin blacklisté', () => {
  const w = scene();
  const b = bot();
  calmStorm(w, b);
  const junk = new Butin(b.pos.x + 30, b.pos.y, { kind: 'materiau', type: 'bois', count: 10 });
  const gun = new Butin(b.pos.x + 200, b.pos.y, { kind: 'arme', type: 'fusil', rarity: 3, mag: 30 });
  w.lootGrid.insert(junk);
  w.lootGrid.insert(gun);
  assert.strictEqual(b.chooseLoot(w), gun);
  b.blacklist.set(gun, b.clock + 100);
  assert.strictEqual(b.chooseLoot(w), junk);
});

test('butin : abandon d\'une cible inaccessible après le délai', () => {
  const w = scene();
  const b = bot();
  calmStorm(w, b);
  const gun = new Butin(b.pos.x + 200, b.pos.y, { kind: 'arme', type: 'fusil', rarity: 3, mag: 30 });
  w.lootGrid.insert(gun);
  assert.strictEqual(b.currentLoot(w), gun);
  b.lootTimer = CONFIG.bot.lootGiveUp + 1;
  assert.notStrictEqual(b.currentLoot(w), gun);
  assert.ok(b.blacklist.get(gun) > b.clock);
});

test('coffre ouvert ou butin pris : plus de cible', () => {
  const w = scene();
  const b = bot();
  const chest = new Coffre(b.pos.x + 100, b.pos.y);
  w.lootGrid.insert(chest);
  assert.strictEqual(b.chooseLoot(w), chest);
  chest.opened = true;
  assert.strictEqual(b.lootValue(chest), 0);
});

test('saut : le bot saute quand le bus est assez proche de son point d\'atterrissage', () => {
  const b = bot();
  b.landing = createVector(1600, 1600);
  b.jumpJitter = 0;
  const reach = CONFIG.match.airSpeed * 60 * CONFIG.match.fallTime * 0.55;
  assert.ok(b.shouldJump({ pos: createVector(1600 + reach, 1600) }));
  assert.ok(!b.shouldJump({ pos: createVector(1600 + reach + 5, 1600) }));
  const noLanding = bot();
  assert.ok(noLanding.shouldJump({ pos: createVector(0, 0) }));
});

test('chute : le bot se dirige vers son point d\'atterrissage, vitesse limitée', () => {
  const w = scene();
  const b = bot(1000, 1000);
  b.phase = 'chute';
  b.fallTime = 5;
  b.landing = createVector(1600, 1000);
  for (let i = 0; i < 120; i++) {
    b.think(w, DT);
    b.update();
    assert.ok(b.vel.mag() <= CONFIG.match.airSpeed + 1e-9);
  }
  assert.ok(b.pos.x > 1300);
  assert.ok(Math.abs(b.fallTime - 3) < 0.02);
});

test('esquive : une balle qui arrive déclenche une force latérale', () => {
  const w = scene();
  const b = bot();
  const shooter = enemyAt(w, b.pos.x - 300, b.pos.y);
  w.bullets.push(new Balle(b.pos.x - 60, b.pos.y + 2, 0, 20, 10, 500, shooter));
  const dodge = b.dodgeForce(w);
  assert.ok(dodge && dodge.mag() > 0 && Math.abs(dodge.y) > Math.abs(dodge.x) * 0.2);
  const own = new Balle(b.pos.x - 60, b.pos.y, 0, 20, 10, 500, b);
  w.bullets.length = 0;
  w.bullets.push(own);
  assert.strictEqual(b.dodgeForce(w), null, 'ses propres balles');
});

test('think : forces finies, vitesse bornée, pas de sortie de l\'île, sur 30 s', () => {
  const w = scene();
  const b = armed(bot(1600, 1600));
  w.fighters.push(b);
  enemyAt(w, 1900, 1650);
  calmStorm(w, b);
  for (let i = 0; i < 1800; i++) {
    b.think(w, DT);
    b.update();
    assert.ok(Number.isFinite(b.pos.x) && Number.isFinite(b.pos.y));
    assert.ok(b.vel.mag() <= b.maxSpeed + 1e-9);
  }
  assert.ok(b.debugInfo && b.debugInfo.forces);
});

test('un bot à règles et un bot à cerveau partagent la même interface', () => {
  const rules = bot();
  const neural = bot(1600, 1600, {}, Cerveau.random());
  assert.ok(!rules.neural && neural.neural);
  assert.ok(rules.genome instanceof Genome && neural.genome instanceof Genome);
});
