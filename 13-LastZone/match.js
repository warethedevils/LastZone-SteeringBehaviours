// Match : le contrôleur d'une partie. Il crée l'île, le butin, le bus, la tempête
// et les combattants, fournit à chaque entité le « monde » qu'elle perçoit et le
// temps écoulé, applique les règles de scène (collisions, dégâts, ramassage,
// récolte, construction, éliminations, classement) et publie des événements pour
// le son et l'interface. Le calcul des forces reste dans les entités et Behaviors.
//
// Phases : 'bus' (jusqu'à ce que tout le monde ait sauté) -> 'jeu' -> 'fin'.

const NOMS_BOTS_A = ['Ombre', 'Foudre', 'Renard', 'Tigre', 'Nova', 'Frelon', 'Corbeau', 'Lynx', 'Vortex',
  'Faucon', 'Cobra', 'Titan', 'Spectre', 'Comète', 'Loup', 'Orage', 'Pixel', 'Turbo', 'Zéro', 'Blaze'];
const NOMS_BOTS_B = ['42', 'X', 'Pro', 'FR', '77', 'Max', '_', 'Jr', 'GG', '99', 'Z', 'HD'];
const SKINS_BOTS = [
  { body: [235, 90, 90], accent: [255, 210, 210] }, { body: [90, 190, 120], accent: [210, 255, 220] },
  { body: [240, 170, 60], accent: [255, 235, 190] }, { body: [170, 100, 230], accent: [235, 210, 255] },
  { body: [60, 190, 200], accent: [200, 250, 255] }, { body: [230, 110, 170], accent: [255, 215, 235] },
  { body: [120, 130, 150], accent: [225, 230, 240] }, { body: [200, 200, 80], accent: [255, 255, 200] }
];

class Match {
  static get ORDRES() {
    return { libre: 'carte blanche', suivre: 'Suivez-moi', tenir: 'Tenez la position', attaque: 'À l\'attaque !' };
  }

  // options : { name, skin, difficulty, fighters, evolution, stormSpeed }
  constructor(options = {}) {
    // neural : nombre de bots dotés d'un cerveau (les autres suivent les règles) ; recorder : enregistre
    // les décisions des bots à règles (pré-entraînement par imitation)
    this.options = Object.assign({ name: 'Joueur', skin: null, difficulty: 'normal', fighters: CONFIG.match.fighters,
      evolution: null, stormSpeed: 1, neural: Infinity, recorder: null, brains: null, teamSize: 1, vehicles: true, faune: true }, options);
    CONFIG.tempete.speedFactor = this.options.stormSpeed;
    this.state = 'bus';
    this.time = 0;
    this.events = [];
    this.killfeed = [];
    this.popups = [];
    this.bullets = [];
    this.butins = [];
    this.coffres = [];
    this.murs = [];
    this.vehicules = [];
    this.ordre = 'libre';            // ordre du joueur à son équipe : libre | suivre | tenir | attaque
    this.holdPoint = null;
    this.faune = [];                 // loups, cerfs, corbeaux
    this.combats = [];               // derniers combats { pos, t } (les corbeaux accourent)
    this.pings = [];                 // positions des corbeaux en alerte (minimap)
    this.largages = [];
    this.sparks = [];
    this.alive = [];
    this.winner = null;
    this.result = null;
    this.stormStarted = false;
    this.lastDropPhase = -1;
    this.lastStormPhase = -1;
    this.shake = 0;

    this.grid = new Grille(WORLD.w, WORLD.h, 128);
    this.lootGrid = new Grille(WORLD.w, WORLD.h, 128);
    this.carte = new Carte();
    this.carte.generate(this.grid);
    this.spawnLoot();
    if (this.options.vehicles) this.spawnVehicles();
    this.storm = new Tempete({ cx: this.carte.cx, cy: this.carte.cy, radius: this.carte.radius });
    this.makeBus();
    this.makeFighters();
    this.assignTeams();
    if (this.options.faune) this.spawnFaune();
    this.placementCounter = this.fighters.length;
    this.events.push({ type: 'bus' });
  }

  get loups() { return this.faune.filter(a => a instanceof Loup); }
  get cerfs() { return this.faune.filter(a => a instanceof Cerf); }
  get corbeaux() { return this.faune.filter(a => a instanceof Corbeau); }
  get bots() { return this.fighters.filter(f => f instanceof Bot && f !== this.joueur); }
  get joueur() { return this.fighters[0]; }
  get aliveCount() { return this.alive.length; }

  // ---------- Mise en place ----------

  makeBus() {
    const angle = random(TWO_PI);
    const dir = createVector(Math.cos(angle), Math.sin(angle));
    const perp = createVector(-dir.y, dir.x).mult(random(-450, 450));
    const center = createVector(this.carte.cx, this.carte.cy);
    const a = p5.Vector.add(center, p5.Vector.add(p5.Vector.mult(dir, 2100), perp));
    const b = p5.Vector.add(center, p5.Vector.add(p5.Vector.mult(dir, -2100), perp));
    this.bus = new Bus(Chemin.line(a, b, 60));
  }

  static randomName(used) {
    for (let i = 0; i < 30; i++) {
      const name = NOMS_BOTS_A[Math.floor(random(NOMS_BOTS_A.length))]
        + (random(1) < 0.7 ? NOMS_BOTS_B[Math.floor(random(NOMS_BOTS_B.length))] : '');
      if (!used.has(name)) { used.add(name); return name; }
    }
    return 'Bot' + Math.floor(random(1000));
  }

  makeFighters() {
    const count = this.options.fighters;
    const used = new Set([this.options.name]);
    const skin = this.options.skin || { body: [80, 150, 255], accent: [255, 255, 255] };
    const diff = CONFIG.difficulte[this.options.difficulty] || CONFIG.difficulte.normal;
    // cerveaux : issus de l'évolution (ou du réseau pré-entraîné) ; sinon bots à règles
    const total = this.options.autoplay ? count : count - 1;
    const brains = this.options.brains || (this.options.evolution ? this.options.evolution.breed(total) : []);
    const individual = i => (i < this.options.neural && brains[i]) ? brains[i] : Genome.random();
    let cursor = 0;
    // autoplay : le « joueur » est un bot (démonstration du lobby, simulations de test)
    const player = this.options.autoplay
      ? new Bot(this.bus.pos.x, this.bus.pos.y, this.options.name, skin, individual(cursor++), diff)
      : new Joueur(this.bus.pos.x, this.bus.pos.y, this.options.name, skin);
    player.phase = 'bus';
    if (this.options.autoplay) player.landing = this.chooseLanding(player);
    this.fighters = [player];
    for (let i = 0; i < count - 1; i++) {
      const bot = new Bot(this.bus.pos.x, this.bus.pos.y, Match.randomName(used),
        SKINS_BOTS[Math.floor(random(SKINS_BOTS.length))], individual(cursor++), diff);
      if (this.options.recorder && !bot.brain) bot.recorder = this.options.recorder;
      bot.phase = 'bus';
      bot.landing = this.chooseLanding(bot);
      this.fighters.push(bot);
    }
    this.alive = this.fighters.slice();
    this.busTimer = 0;
  }

  // Équipes : le joueur (ou le premier combattant) et ses coéquipiers d'abord. En solo, chacun est son équipe.
  assignTeams() {
    const size = Math.max(1, Math.floor(this.options.teamSize));
    this.teamSize = size;
    this.fighters.forEach((f, i) => { f.team = Math.floor(i / size); });
    this.teamCount = Math.ceil(this.fighters.length / size);
    this.fighters.forEach(f => { f.allyOfPlayer = size > 1 && f !== this.joueur && f.team === this.joueur.team; });
  }

  get teamMode() { return this.teamSize > 1; }
  teamMembers(team) { return this.fighters.filter(f => f.team === team); }

  // Équipes ayant encore au moins un combattant en vie (à terre compris)
  teamsAlive(excluding = -1) {
    const set = new Set();
    for (const f of this.fighters) if (f.alive && f.team !== excluding) set.add(f.team);
    return set.size;
  }

  // Un coéquipier encore debout (en vie et pas à terre) ?
  hasStandingTeammate(f) {
    return this.fighters.some(o => o !== f && o.team === f.team && o.alive && o.phase !== 'terre');
  }

  // Point d'atterrissage d'un bot : une ville (les cupides préfèrent les grandes) ou la nature
  chooseLanding(bot) {
    const g = bot.genome.genes;
    if (random(1) < 0.3 + (1 - g.cupidite) * 0.3 || this.carte.towns.length === 0) return this.carte.randomPoint(30);
    const town = this.carte.randomTown(g.cupidite);
    const a = random(TWO_PI);
    const d = random(0, town.r * 0.9);
    return createVector(town.pos.x + Math.cos(a) * d, town.pos.y + Math.sin(a) * d);
  }

  // ---------- Butin ----------

  addButin(x, y, drop) {
    const butin = new Butin(x, y, drop);
    this.butins.push(butin);
    this.lootGrid.insert(butin);
    return butin;
  }

  addCoffre(x, y, legendary = false) {
    const coffre = new Coffre(x, y, legendary);
    this.coffres.push(coffre);
    this.lootGrid.insert(coffre);
    return coffre;
  }

  randomDrop(kind) {
    const c = CONFIG.butin;
    if (kind === 'arme') return rollWeapon(c.floorRarity);
    if (kind === 'soin') return rollHeal();
    if (kind === 'munitions') {
      const type = rollKey({ legere: 40, moyenne: 32, cartouche: 18, lourde: 10 });
      return { kind: 'munitions', type, count: MUNITIONS[type].boite };
    }
    const type = random(1) < 0.65 ? 'bois' : 'metal';
    return { kind: 'materiau', type, count: Math.floor(random(20, 51)) };
  }

  spawnLoot() {
    const c = CONFIG.butin;
    for (const spot of this.carte.chestSpots) {
      if (this.coffres.length >= c.chests) break;
      if (this.carte.isFree(spot.x, spot.y, 22, 10)) this.addCoffre(spot.x, spot.y);
    }
    let guard = 0;
    while (this.coffres.length < c.chests && guard++ < 200) {
      const p = this.carte.randomPoint(26);
      this.addCoffre(p.x, p.y);
    }
    const scatter = (count, kind) => {
      for (let i = 0; i < count; i++) {
        let p;
        if (this.carte.towns.length > 0 && random(1) < 0.6) {
          const t = this.carte.towns[Math.floor(random(this.carte.towns.length))];
          const a = random(TWO_PI);
          const d = random(30, t.r + 60);
          p = createVector(t.pos.x + Math.cos(a) * d, t.pos.y + Math.sin(a) * d);
          if (!this.carte.isFree(p.x, p.y, 16, 10)) p = this.carte.randomPoint(16);
        } else {
          p = this.carte.randomPoint(16);
        }
        this.addButin(p.x, p.y, this.randomDrop(kind));
      }
    };
    scatter(c.floorWeapons, 'arme');
    scatter(c.floorHeals, 'soin');
    scatter(c.ammoBoxes, 'munitions');
    scatter(c.materialPiles, 'materiau');
  }

  // Véhicules : quads et jeeps posés près des routes et des villes
  spawnVehicles() {
    const plan = { quad: CONFIG.vehicule.quads, jeep: CONFIG.vehicule.jeeps };
    for (const type of Object.keys(plan)) {
      for (let i = 0; i < plan[type]; i++) {
        let p = null;
        for (let tries = 0; tries < 60 && !p; tries++) {
          let candidate;
          if (this.carte.towns.length > 0 && random(1) < 0.7) {
            const t = this.carte.towns[Math.floor(random(this.carte.towns.length))];
            const a = random(TWO_PI);
            candidate = createVector(t.pos.x + Math.cos(a) * (t.r + random(10, 90)), t.pos.y + Math.sin(a) * (t.r + random(10, 90)));
          } else {
            candidate = this.carte.randomPoint(40);
          }
          if (this.carte.isFree(candidate.x, candidate.y, VEHICULES[type].r + 22, 20)) p = candidate;
        }
        if (p) this.vehicules.push(new Vehicule(p.x, p.y, type));
      }
    }
  }

  // Faune : loups (en meutes), cerfs (en hardes), bandes de corbeaux
  spawnFaune() {
    const f = CONFIG.faune;
    const spot = radius => this.carte.randomPoint(radius) || createVector(this.carte.cx, this.carte.cy);
    for (let i = 0; i < f.loups; i++) {
      const home = spot(60);
      const pack = i % 2 === 0 ? 2 : 1;            // des paires et des solitaires
      for (let k = 0; k < pack && this.loups.length < f.loups; k++) this.faune.push(new Loup(home.x + k * 26, home.y + k * 14));
    }
    for (let i = 0; i < f.cerfs; i += 4) {
      const home = spot(60);
      for (let k = 0; k < 4 && i + k < f.cerfs; k++) this.faune.push(new Cerf(home.x + random(-40, 40), home.y + random(-40, 40)));
    }
    for (let g = 0; g < f.corbeauxGroupes; g++) {
      const home = spot(30);
      for (let k = 0; k < f.corbeauxParGroupe; k++) this.faune.push(new Corbeau(home.x + random(-60, 60), home.y + random(-60, 60)));
    }
  }

  // Mémorise un combat (tir, explosion) : les corbeaux viennent tourner au-dessus
  noteCombat(pos) {
    const last = this.combats[this.combats.length - 1];
    if (last && this.time - last.t < 0.8 && p5.Vector.dist(last.pos, pos) < 150) { last.t = this.time; return; }
    this.combats.push({ pos: pos.copy(), t: this.time });
    if (this.combats.length > 12) this.combats.shift();
  }

  // Ordres du joueur à son équipe (touche T) : libre -> suivre -> tenir -> attaque
  cycleOrder() {
    const list = ['libre', 'suivre', 'tenir', 'attaque'];
    this.ordre = list[(list.indexOf(this.ordre) + 1) % list.length];
    this.holdPoint = this.ordre === 'tenir' ? this.joueur.pos.copy() : null;
    this.feed(`Ordre : ${Match.ORDRES[this.ordre]}`, true);
    this.events.push({ type: 'ordre', ordre: this.ordre });
  }

  // Contenu d'un coffre : une arme, souvent un soin et des munitions, parfois des matériaux
  chestLoot(legendary) {
    const c = CONFIG.butin;
    const weights = legendary ? [0, 0, 20, 45, 35] : c.chestRarity;
    const weapon = rollWeapon(weights);
    const drops = [weapon];
    const ammoType = WEAPONS[weapon.type].ammo;
    drops.push({ kind: 'munitions', type: ammoType, count: MUNITIONS[ammoType].boite * (legendary ? 2 : 1) });
    if (random(1) < (legendary ? 1 : 0.65)) drops.push(rollHeal());
    if (legendary) drops.push({ kind: 'bouclier', type: 'grand', count: 2 });
    if (random(1) < 0.3) drops.push({ kind: 'materiau', type: 'bois', count: 30 });
    return drops;
  }

  openChest(coffre, opener) {
    if (coffre.opened) return;
    coffre.opened = true;
    this.lootGrid.remove(coffre);
    const drops = this.chestLoot(coffre.legendary);
    drops.forEach((drop, i) => {
      const a = (i / drops.length) * TWO_PI + random(0.4);
      this.addButin(coffre.pos.x + Math.cos(a) * 40, coffre.pos.y + Math.sin(a) * 40, drop);
    });
    if (opener) opener.chestsOpened++;
    this.burst(coffre.pos, [255, 215, 90], 12, 3.5, 0.6);
    this.events.push({ type: 'chest', pos: coffre.pos.copy(), by: opener });
  }

  // ---------- Effets ----------

  burst(pos, color, count = 8, speed = 3, life = 0.5, size = 5) {
    for (let i = 0; i < count && this.sparks.length < 400; i++) {
      this.sparks.push(new Etincelle(pos.x, pos.y, color, speed, life, size));
    }
  }

  popup(pos, text, color) {
    this.popups.push({ pos: pos.copy(), text, color, life: 0.9, maxLife: 0.9 });
    if (this.popups.length > 30) this.popups.shift();
  }

  feed(text, important = false) {
    this.killfeed.push({ text, t: this.time, important });
    if (this.killfeed.length > 8) this.killfeed.shift();
  }

  // ---------- Monde perçu par les entités ----------

  makeWorld() {
    return {
      fighters: this.alive, grid: this.grid, lootGrid: this.lootGrid, storm: this.storm,
      bullets: this.bullets, carte: this.carte, bus: this.bus, time: this.time,
      vehicules: this.vehicules, teamSize: this.teamSize,
      ordre: this.ordre, holdPoint: this.holdPoint, leader: this.joueur, playerTeam: this.joueur.team,
      faune: this.faune, loups: this.loups, cerfs: this.cerfs, corbeaux: this.corbeaux, combats: this.combats
    };
  }

  // ---------- Boucle de simulation (pas fixe) ----------

  // input : entrées du joueur (voir Joueur.think)
  step(dt, input) {
    if (this.state === 'fin') return;
    if (input && input.order && this.teamMode && this.joueur.alive) this.cycleOrder();
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.alive = this.fighters.filter(f => f.alive);
    this.stepBus(dt, input);
    this.stepStorm(dt);
    this.stepAirdrops(dt);
    const world = this.makeWorld();
    this.stepFighters(dt, input, world);
    this.stepVehicles(dt, input);
    this.stepFaune(dt);
    this.stepInteractions(dt);
    this.stepRevive(dt);
    this.stepBleed(dt);
    this.stepBullets();
    this.stepEffects(dt);
    this.checkEnd();
  }

  stepBus(dt, input) {
    const bus = this.bus;
    if (!bus) return;
    bus.think(dt);
    bus.update();
    this.busTimer += dt;
    for (const f of this.alive) {
      if (f.phase !== 'bus') continue;
      f.pos.set(bus.pos.x, bus.pos.y);
      f.vel.set(bus.vel.x, bus.vel.y);
      const wants = f instanceof Joueur
        ? (f.wantsJump || this.busTimer >= CONFIG.match.autoJumpAfter)
        : f.shouldJump(bus);
      if (wants || bus.gone) this.jump(f);
    }
    if (this.alive.every(f => f.phase !== 'bus')) this.bus = null;
  }

  jump(f) {
    f.phase = 'chute';
    f.fallTime = CONFIG.match.fallTime;
    f.pos.add(random(-30, 30), random(-30, 30));
    f.vel.set(this.bus.vel.x * 0.5, this.bus.vel.y * 0.5);
    f.applyLimits();
    if (f instanceof Joueur) this.events.push({ type: 'jump' });
  }

  stepStorm(dt) {
    if (!this.stormStarted) {
      // la tempête démarre quand le bus est parti
      if (!this.bus) { this.stormStarted = true; this.state = 'jeu'; this.events.push({ type: 'storm', phase: 0 }); }
      else return;
    }
    this.storm.think(dt);
    this.storm.update();
    if (this.storm.phaseIndex !== this.lastStormPhase) {
      this.lastStormPhase = this.storm.phaseIndex;
      if (this.storm.phaseIndex > 0) this.events.push({ type: 'storm', phase: this.storm.phaseIndex });
    }
    // dégâts de la tempête
    for (const f of this.alive.slice()) {
      if (f.phase !== 'sol' && f.phase !== 'terre' && f.phase !== 'vehicule') continue;
      if (!f.alive) continue;
      if (!this.storm.inside(f.pos)) {
        f.stormTime = (f.stormTime || 0) + dt;
        if (f.takeDamage(this.storm.dps * dt)) this.lethal(f, null, 'tempête');
        if (f instanceof Joueur) f.inStorm = true;
      } else if (f instanceof Joueur) {
        f.inStorm = false;
      }
    }
  }

  stepAirdrops(dt) {
    if (this.stormStarted && this.storm.state === 'attente' && this.storm.phaseIndex !== this.lastDropPhase
      && this.storm.phaseIndex < this.storm.phases.length - 1) {
      this.lastDropPhase = this.storm.phaseIndex;
      const center = this.storm.nextCenter;
      const radius = this.storm.nextRadius * 0.7;
      let pos = null;
      for (let i = 0; i < 40 && !pos; i++) {
        const a = random(TWO_PI);
        const d = Math.sqrt(random(1)) * radius;
        const p = createVector(center.x + Math.cos(a) * d, center.y + Math.sin(a) * d);
        if (this.carte.isFree(p.x, p.y, 40, 10)) pos = p;
      }
      pos = pos || center.copy();
      this.largages.push(new Largage(pos.x, pos.y));
      this.events.push({ type: 'airdrop', pos: pos.copy() });
    }
    for (const drop of this.largages) {
      drop.think(dt);
      drop.update();
      if (drop.landed) {
        this.addCoffre(drop.pos.x, drop.pos.y, true);
        this.burst(drop.pos, [255, 190, 60], 20, 5, 0.9, 7);
        this.events.push({ type: 'landed', pos: drop.pos.copy() });
      }
    }
    this.largages = this.largages.filter(d => !d.landed);
  }

  stepFighters(dt, input, world) {
    for (const f of this.alive) {
      let bullets;
      if (f instanceof Joueur) bullets = f.think(world, input, dt);
      else bullets = f.think(world, dt);
      if (f.phase === 'chute' || f.phase === 'sol' || f.phase === 'terre') f.update();
      if (f.phase === 'chute' && f.fallTime <= 0) this.land(f);
      if (f.phase === 'sol' || f.phase === 'terre') this.resolveMovement(f);
      if (bullets && bullets.length > 0) {
        for (const b of bullets) this.bullets.push(b);
        const grenade = bullets[0].grenade;
        this.events.push({ type: 'shot', pos: f.pos.copy(), weapon: grenade ? 'grenade' : (f.weapon ? f.weapon.type : null), by: f });
        this.noteCombat(f.pos);
      }
    }
  }

  land(f) {
    f.phase = 'sol';
    f.fallTime = 0;
    f.invulnerable = CONFIG.match.landingShield;
    f.vel.mult(0.2);
    f.applyLimits();
    this.carte.clampToIsland(f.pos, 24);
    this.resolveMovement(f);
    this.burst(f.pos, [210, 190, 150], 8, 2.5, 0.5, 6);
    if (f instanceof Joueur) this.events.push({ type: 'land' });
  }

  // Collisions de mouvement : pousse hors des obstacles et des autres combattants, reste sur l'île
  resolveMovement(f) {
    for (const c of this.grid.query(f.pos.x, f.pos.y, f.r + 2)) {
      const dx = f.pos.x - c.pos.x;
      const dy = f.pos.y - c.pos.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const min = f.r + c.r;
      if (d < min) {
        const nx = dx / d;
        const ny = dy / d;
        f.pos.x += nx * (min - d);
        f.pos.y += ny * (min - d);
        const into = f.vel.x * nx + f.vel.y * ny;
        if (into < 0) { f.vel.x -= nx * into; f.vel.y -= ny * into; }
      }
    }
    for (const o of this.alive) {
      if (o === f || (o.phase !== 'sol' && o.phase !== 'terre')) continue;
      const dx = f.pos.x - o.pos.x;
      const dy = f.pos.y - o.pos.y;
      const d = Math.hypot(dx, dy);
      const min = (f.r + o.r) * 0.9;
      if (d < min && d > 0.001) {
        const push = (min - d) * 0.5;
        f.pos.x += (dx / d) * push;
        f.pos.y += (dy / d) * push;
      }
    }
    if (this.carte.clampToIsland(f.pos, 18)) f.vel.mult(0.5);
  }

  // ---------- Interactions : ramassage, coffres, récolte, construction ----------

  nearestInteractable(f) {
    const reach = CONFIG.joueur.pickupRadius;
    let best = null;
    let record = Infinity;
    for (const obj of this.lootGrid.query(f.pos.x, f.pos.y, reach)) {
      if (obj instanceof Butin && (obj.taken || obj.automatic)) continue;
      if (obj instanceof Coffre && obj.opened) continue;
      if (!(obj instanceof Butin) && !(obj instanceof Coffre)) continue;
      const d = p5.Vector.dist(f.pos, obj.pos);
      if (d < record) { record = d; best = obj; }
    }
    return best;
  }

  // Véhicule avec un siège libre à portée de main
  nearestVehicle(f, reach = 70) {
    let best = null;
    let record = Infinity;
    for (const v of this.vehicules) {
      if (v.dead || v.freeSeat < 0) continue;
      const d = p5.Vector.dist(f.pos, v.pos) - v.r;
      if (d <= reach && d < record) { record = d; best = v; }
    }
    return best;
  }

  boardVehicle(f, veh) {
    if (veh.board(f) < 0) return false;
    if (f instanceof Joueur) this.events.push({ type: 'board', vehicule: veh });
    return true;
  }

  leaveVehicle(f) {
    const veh = f.vehicle;
    if (!veh) return;
    const wasDriver = veh.driver === f;
    veh.leave(f);
    this.resolveMovement(f);
    if (wasDriver) {
      // le conducteur descend : les passagers descendent aussi (pas de pilote)
      for (const p of veh.riders) { veh.leave(p); this.resolveMovement(p); }
    }
  }

  takeButin(f, butin) {
    const { taken, dropped } = f.pickup(butin.drop);
    if (!taken) return false;
    butin.taken = true;
    this.lootGrid.remove(butin);
    if (dropped) {
      const a = random(TWO_PI);
      this.addButin(f.pos.x + Math.cos(a) * 36, f.pos.y + Math.sin(a) * 36, dropped);
    }
    if (f instanceof Joueur) this.events.push({ type: 'pickup', butin });
    return true;
  }

  stepInteractions(dt) {
    for (const f of this.alive.slice()) {
      // véhicule : descendre (E, ou demande du bot) ; monter (E près d'un véhicule, ou demande du bot)
      if (f.phase === 'vehicule') {
        if (f.wantsInteract || f.exitRequest) this.leaveVehicle(f);
        f.wantsInteract = false;
        f.exitRequest = false;
        continue;
      }
      if (f.phase !== 'sol') continue;
      // munitions et matériaux : on marche dessus
      for (const obj of this.lootGrid.query(f.pos.x, f.pos.y, f.r + 12)) {
        if (obj instanceof Butin && !obj.taken && obj.automatic) this.takeButin(f, obj);
      }
      if (f.wantsInteract) {
        const target = this.nearestInteractable(f);
        if (target instanceof Coffre) this.openChest(target, f);
        else if (target instanceof Butin) this.takeButin(f, target);
        else if (f instanceof Joueur) {
          const veh = this.nearestVehicle(f);
          if (veh) this.boardVehicle(f, veh);
        }
        if (f instanceof Joueur) f.wantsInteract = false;
      }
      if (f.boardRequest) {
        const veh = f.boardRequest;
        f.boardRequest = null;
        if (!veh.dead && p5.Vector.dist(f.pos, veh.pos) <= veh.r + f.r + 40) this.boardVehicle(f, veh);
      }
      if (f.swingNow) this.harvest(f);
      if (f.wantsBuild) this.build(f);
    }
    this.butins = this.butins.filter(b => !b.taken);
  }

  // Coup de pioche : l'arbre ou le rocher le plus proche devant le combattant
  harvest(f) {
    const c = CONFIG.joueur;
    let best = null;
    let record = Infinity;
    for (const col of this.grid.query(f.pos.x, f.pos.y, c.harvestRange + 40)) {
      const parent = col.parent;
      if (!(parent instanceof Arbre) && !(parent instanceof Rocher)) continue;
      const dx = col.pos.x - f.pos.x;
      const dy = col.pos.y - f.pos.y;
      const d = Math.hypot(dx, dy) - col.r;
      if (d > c.harvestRange) continue;
      if (Math.abs(Behaviors.angleDifference(f.aim, Math.atan2(dy, dx))) > 0.9) continue;
      if (d < record) { record = d; best = parent; }
    }
    if (!best) return false;
    const gained = best.harvest(c.harvestDamage);
    const type = best instanceof Arbre ? 'bois' : 'metal';
    f.mats[type] = Math.min(999, f.mats[type] + gained);
    if (type === 'bois') f.woodHarvested += gained;
    this.burst(best.pos, type === 'bois' ? [120, 190, 90] : [190, 195, 210], 5, 2.5, 0.4);
    if (f instanceof Joueur) {
      this.popup(best.pos, `+${gained} ${type}`, type === 'bois' ? [220, 170, 100] : [200, 215, 230]);
      this.events.push({ type: 'harvest' });
    }
    if (best.dead) {
      this.carte.removeEntity(best, best instanceof Arbre ? this.carte.trees : this.carte.rocks);
      this.burst(best.pos, [150, 110, 70], 14, 4, 0.7, 7);
    }
    return true;
  }

  // Construction d'un mur devant le combattant, perpendiculaire à sa direction
  build(f) {
    const c = CONFIG.joueur;
    f.wantsBuild = false;
    if (f.mats.bois < c.buildCost || f.wallTimer > 0) return false;
    const angle = f instanceof Joueur ? f.aim : f.buildAngle;
    const x = f.pos.x + Math.cos(angle) * c.wallDistance;
    const y = f.pos.y + Math.sin(angle) * c.wallDistance;
    if (!this.carte.inIsland(createVector(x, y), 30)) return false;
    f.mats.bois -= c.buildCost;
    f.wallTimer = c.wallCooldown;
    const wall = new Mur(x, y, angle + Math.PI / 2, f, c.wallHp);
    this.carte.addEntity(wall, this.murs);
    this.burst(wall.pos, [200, 160, 100], 6, 2.5, 0.4);
    if (f instanceof Joueur) this.events.push({ type: 'build' });
    return true;
  }

  // ---------- Véhicules : conduite, collisions, écrasement, destruction ----------

  stepVehicles(dt, input) {
    for (const veh of this.vehicules.slice()) {
      if (veh.dead) continue;
      const driver = veh.driver;
      let ctx = { move: null };
      if (driver instanceof Joueur) ctx = { move: driver.driveMove };
      else if (driver && driver.driveContext) ctx = driver.driveContext;
      veh.think(dt, ctx);
      veh.update();
      this.resolveVehicle(veh);
      this.ram(veh);
      for (const o of veh.riders) { o.pos.set(veh.pos.x, veh.pos.y); o.vel.set(veh.vel.x, veh.vel.y); }
      if (veh.dead) this.destroyVehicle(veh);
    }
  }

  // Collisions du véhicule avec les obstacles : repoussé, ralenti, abîmé ; arbres et murs cèdent
  resolveVehicle(veh) {
    for (const c of this.grid.query(veh.pos.x, veh.pos.y, veh.r + 2)) {
      const dx = veh.pos.x - c.pos.x;
      const dy = veh.pos.y - c.pos.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const min = veh.r + c.r;
      if (d >= min) continue;
      const nx = dx / d;
      const ny = dy / d;
      veh.pos.x += nx * (min - d);
      veh.pos.y += ny * (min - d);
      const into = -(veh.vel.x * nx + veh.vel.y * ny);
      if (into > 0) { veh.vel.x += nx * into; veh.vel.y += ny * into; }
      if (into > 2) {
        const parent = c.parent;
        veh.hit(into * (parent instanceof Mur ? 2 : 5));
        if (parent instanceof Arbre && into > 2.4) {
          parent.hp -= 80;
          if (parent.dead) { this.carte.removeEntity(parent, this.carte.trees); this.burst(parent.pos, [150, 110, 70], 14, 4, 0.7, 7); }
        } else if (parent instanceof Mur && parent.hit(into * 40)) {
          this.carte.removeEntity(parent, this.murs);
        }
        this.burst(veh.pos, [255, 200, 120], 4, 3, 0.3, 4);
      }
    }
    if (this.carte.clampToIsland(veh.pos, 30)) veh.vel.mult(0.4);
  }

  // Un véhicule lancé blesse les combattants qu'il percute (sauf les coéquipiers du conducteur)
  ram(veh) {
    const driver = veh.driver;
    if (!driver || veh.speed < CONFIG.vehicule.ramSpeed) return;
    for (const f of this.alive.slice()) {
      if ((f.phase !== 'sol' && f.phase !== 'terre') || f.vehicle === veh) continue;
      if (driver.isFriend(f) || f === driver || veh.ramTimers.has(f)) continue;
      if (p5.Vector.dist(f.pos, veh.pos) > veh.r + f.r + 2) continue;
      veh.ramTimers.set(f, 0.7);
      const damage = (veh.speed - CONFIG.vehicule.ramSpeed + 1) * CONFIG.vehicule.ramDamage;
      this.applyDamage(f, damage, driver, f.pos);
      veh.hit(4);
      this.events.push({ type: 'ram', pos: f.pos.copy() });
    }
  }

  destroyVehicle(veh) {
    for (const o of veh.riders) { veh.leave(o); this.resolveMovement(o); }
    this.vehicules = this.vehicules.filter(v => v !== veh);
    this.explode(veh.pos, { radius: 130, wall: 2 }, 85, null);
  }

  // ---------- Faune ----------

  stepFaune(dt) {
    if (this.faune.length === 0) return;
    const world = this.makeWorld();
    for (const a of this.faune.slice()) {
      const target = a.think(world, dt);
      a.update();
      if (!(a instanceof Corbeau)) this.resolveAnimal(a);
      if (target) this.bite(a, target);
      if (a instanceof Loup && a.state === 'chasse' && !a.howled) { a.howled = true; this.events.push({ type: 'howl', pos: a.pos.copy() }); }
      if (a.dead) this.killAnimal(a, null);
    }
    this.pings = this.corbeaux.filter(c => c.alerted).map(c => c.pos);
    this.combats = this.combats.filter(b => this.time - b.t < 12);
  }

  // Collisions d'un animal avec le décor, comme pour un véhicule
  resolveAnimal(a) {
    for (const c of this.grid.query(a.pos.x, a.pos.y, a.r + 2)) {
      const dx = a.pos.x - c.pos.x;
      const dy = a.pos.y - c.pos.y;
      const d = Math.hypot(dx, dy) || 0.001;
      const min = a.r + c.r;
      if (d >= min) continue;
      a.pos.x += (dx / d) * (min - d);
      a.pos.y += (dy / d) * (min - d);
      const into = a.vel.x * (dx / d) + a.vel.y * (dy / d);
      if (into < 0) { a.vel.x -= (dx / d) * into; a.vel.y -= (dy / d) * into; }
    }
    if (this.carte.clampToIsland(a.pos, 24)) a.vel.mult(0.5);
  }

  // Morsure d'un loup
  bite(wolf, prey) {
    this.applyDamage(prey, CONFIG.faune.loupBite, null, prey.pos, 'loup');
    this.events.push({ type: 'bite', pos: prey.pos.copy() });
  }

  // Coup sur un animal ; retourne true s'il est mort
  hurtAnimal(a, damage, owner, pos) {
    const dead = a instanceof Loup ? a.wound(damage, owner) : a.hit(damage);
    this.burst(pos, [200, 60, 50], 4, 2.5, 0.3, 4);
    if (owner instanceof Joueur) this.events.push({ type: 'hitmarker', killed: dead });
    if (dead) this.killAnimal(a, owner);
    return dead;
  }

  killAnimal(a, killer) {
    this.faune = this.faune.filter(o => o !== a);
    this.burst(a.pos, [190, 60, 50], 10, 3, 0.6, 6);
    if (a instanceof Cerf) this.addButin(a.pos.x, a.pos.y, makeHeal('bandage', 3));
    else if (a instanceof Loup && random(1) < 0.5) this.addButin(a.pos.x, a.pos.y, makeHeal('bandage', 2));
    if (killer instanceof Joueur) this.feed(a instanceof Loup ? 'Tu as abattu un loup' : 'Tu as abattu un cerf', true);
    this.events.push({ type: 'faune_mort', pos: a.pos.copy(), espece: a.constructor.name });
  }

  // ---------- Équipe : réanimation et hémorragie ----------

  // Un coéquipier à terre se relève si un autre le soigne en maintenant E près de lui
  stepRevive(dt) {
    for (const f of this.fighters) if (f.phase === 'terre') f.revivingNow = false;
    for (const f of this.alive.slice()) {
      if (f.phase !== 'sol' || !f.holdInteract) continue;
      let target = null;
      let record = CONFIG.equipe.reviveRange;
      for (const o of this.alive) {
        if (o.phase !== 'terre' || !f.isFriend(o)) continue;
        const d = p5.Vector.dist(f.pos, o.pos);
        if (d <= record) { record = d; target = o; }
      }
      if (!target) continue;
      target.revivingNow = true;
      target.reviveProgress += dt / CONFIG.equipe.reviveTime;
      if (target.reviveProgress >= 1) this.revive(target, f);
    }
    for (const f of this.alive) {
      if (f.phase === 'terre' && !f.revivingNow) f.reviveProgress = Math.max(0, f.reviveProgress - dt * 0.8);
    }
  }

  revive(target, medic) {
    target.phase = 'sol';
    target.hp = CONFIG.equipe.reviveHp;
    target.shield = 0;
    target.bleed = 0;
    target.reviveProgress = 0;
    target.invulnerable = 1;
    medic.revives++;
    this.feed(`${medic.name} a relevé ${target.name}`, medic instanceof Joueur || target instanceof Joueur);
    this.events.push({ type: 'revive', medic, target, pos: target.pos.copy() });
  }

  // À terre, on perd de la vie : sans secours on meurt
  stepBleed(dt) {
    for (const f of this.alive.slice()) {
      if (f.phase !== 'terre') continue;
      f.bleed += dt;
      f.hp -= CONFIG.equipe.bleedRate * dt;
      if (f.hp <= 0) this.eliminate(f, null, 'hémorragie');
    }
  }

  // Mise à terre (mode équipe) : le combattant rampe et attend un coéquipier
  knock(f, killer) {
    if (f.vehicle) this.leaveVehicle(f);
    f.phase = 'terre';
    f.hp = CONFIG.equipe.downedHp;
    f.shield = 0;
    f.bleed = 0;
    f.reviveProgress = 0;
    f.revivingNow = false;
    f.cancelUse();
    f.cancelReload();
    f.invulnerable = 0.3;
    this.burst(f.pos, f.skin.body, 10, 3, 0.5, 6);
    const text = killer && killer !== f ? `${killer.name} a mis ${f.name} à terre` : `${f.name} est à terre`;
    this.feed(text, killer instanceof Joueur || f instanceof Joueur);
    this.events.push({ type: 'knock', victim: f, killer, pos: f.pos.copy() });
  }

  // Dégâts mortels : en équipe on est d'abord mis à terre, sinon éliminé
  lethal(f, killer, cause = 'balle') {
    if (!f.alive) return;
    if (f.phase !== 'terre' && this.hasStandingTeammate(f)) this.knock(f, killer);
    else this.eliminate(f, killer, cause);
  }

  // ---------- Balles et explosions ----------

  stepBullets() {
    for (const b of this.bullets) {
      b.step();
      let best = null;
      const obstacle = this.grid.segmentHit(b.prev, b.pos, b.r);
      if (obstacle) best = { t: obstacle.t, kind: 'obstacle', obj: obstacle.obj };
      if (!b.grenade) {
        for (const f of this.alive) {
          if (f === b.owner || (b.owner && b.owner.isFriend(f)) || b.touched.has(f)) continue;
          if (f.phase !== 'sol' && f.phase !== 'terre') continue;
          if (Math.abs(f.pos.x - b.pos.x) > 80 || Math.abs(f.pos.y - b.pos.y) > 80) continue;
          const t = b.hitFraction(f.pos, f.r);
          if (t !== null && (best === null || t < best.t)) best = { t, kind: 'fighter', obj: f };
        }
        for (const a of this.faune) {
          if (a instanceof Corbeau || a.dead || b.touched.has(a)) continue;
          if (Math.abs(a.pos.x - b.pos.x) > 80 || Math.abs(a.pos.y - b.pos.y) > 80) continue;
          const t = b.hitFraction(a.pos, a.r);
          if (t !== null && (best === null || t < best.t)) best = { t, kind: 'animal', obj: a };
        }
        for (const veh of this.vehicules) {
          if (veh.dead || (b.owner && b.owner.vehicle === veh) || b.touched.has(veh)) continue;
          const driver = veh.driver;
          if (b.owner && driver && b.owner.isFriend(driver)) continue;
          if (Math.abs(veh.pos.x - b.pos.x) > 110 || Math.abs(veh.pos.y - b.pos.y) > 110) continue;
          const t = b.hitFraction(veh.pos, veh.r);
          if (t !== null && (best === null || t < best.t)) best = { t, kind: 'vehicle', obj: veh };
        }
      }
      if (!best) {
        // fin de course sans impact : les explosifs explosent
        if (b.dead && b.blast && !b.exploded) this.explodeBullet(b, b.pos);
        continue;
      }
      const hitPos = createVector(b.prev.x + (b.pos.x - b.prev.x) * best.t, b.prev.y + (b.pos.y - b.prev.y) * best.t);
      if (best.kind === 'fighter') {
        this.damageFighter(best.obj, b, hitPos);
        b.touched.add(best.obj);
        if (b.pierce > 0 && !b.blast) b.pierce--; else b.spent = true;
      } else if (best.kind === 'animal') {
        this.hurtAnimal(best.obj, b.damage * CONFIG.match.damageScale, b.owner, hitPos);
        b.touched.add(best.obj);
        if (b.pierce > 0 && !b.blast) b.pierce--; else b.spent = true;
      } else if (best.kind === 'vehicle') {
        best.obj.hit(b.damage * CONFIG.match.damageScale * 1.2);
        b.touched.add(best.obj);
        this.burst(hitPos, [255, 220, 150], 3, 2, 0.25, 3);
        b.spent = true;
      } else {
        this.hitObstacle(best.obj.parent, b, hitPos);
        b.spent = true;
      }
      if (b.spent && b.blast && !b.exploded) this.explodeBullet(b, hitPos);
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  hitObstacle(parent, bullet, pos) {
    this.burst(pos, [230, 225, 200], 3, 2, 0.25, 3);
    if (parent instanceof Mur && parent.hit(bullet.damage * 1.5)) {
      this.carte.removeEntity(parent, this.murs);
      this.burst(parent.pos, [180, 140, 90], 12, 4, 0.6, 6);
    }
  }

  explodeBullet(bullet, pos) {
    bullet.exploded = true;
    this.explode(pos, bullet.blast, bullet.damage, bullet.owner);
  }

  // Explosion : dégâts décroissants avec la distance sur les combattants (pas de tir allié ;
  // le lanceur subit la moitié), les murs, les arbres et les véhicules
  explode(pos, blast, damage, owner) {
    const radius = blast.radius;
    const scale = CONFIG.match.damageScale;
    const falloff = d => 1 - 0.65 * Math.min(1, d / radius);
    for (const f of this.alive.slice()) {
      if (f.phase !== 'sol' && f.phase !== 'terre') continue;
      const d = p5.Vector.dist(f.pos, pos);
      if (d > radius + f.r) continue;
      if (owner && owner !== f && owner.isFriend(f)) continue;
      const self = owner === f ? 0.5 : 1;
      this.applyDamage(f, damage * falloff(d) * scale * self, owner || null, f.pos);
    }
    for (const wall of this.murs.slice()) {
      const d = p5.Vector.dist(wall.pos, pos);
      if (d > radius + wall.r) continue;
      if (wall.hit(damage * (blast.wall || 2) * falloff(d))) {
        this.carte.removeEntity(wall, this.murs);
        this.burst(wall.pos, [180, 140, 90], 12, 4, 0.6, 6);
      }
    }
    for (const tree of this.carte.trees.slice()) {
      if (p5.Vector.dist(tree.pos, pos) > radius * 0.8) continue;
      tree.hp -= damage;
      if (tree.dead) this.carte.removeEntity(tree, this.carte.trees);
    }
    for (const a of this.faune.slice()) {
      if (a instanceof Corbeau) continue;
      const d = p5.Vector.dist(a.pos, pos);
      if (d <= radius + a.r) this.hurtAnimal(a, damage * falloff(d) * scale, owner, a.pos);
    }
    this.noteCombat(pos);
    for (const veh of this.vehicules.slice()) {
      const d = p5.Vector.dist(veh.pos, pos);
      if (d > radius + veh.r || (owner && owner.vehicle === veh)) continue;
      veh.hit(damage * 1.2 * falloff(d) * scale);
    }
    this.burst(pos, [255, 190, 80], 26, 7, 0.7, 9);
    this.burst(pos, [90, 80, 70], 14, 3, 1, 12);
    if (this.joueur && p5.Vector.dist(this.joueur.pos, pos) < 500) this.shake = Math.max(this.shake, 9);
    this.events.push({ type: 'explosion', pos: pos.copy(), radius });
  }

  damageFighter(f, bullet, pos) {
    return this.applyDamage(f, bullet.damage * CONFIG.match.damageScale, bullet.owner, pos);
  }

  // Applique des dégâts (déjà mis à l'échelle) ; retourne les points réellement perdus
  applyDamage(f, amount, owner, pos, cause = 'balle') {
    if (!f.alive) return 0;
    if (f.invulnerable > 0) { this.burst(pos, [255, 255, 255], 3, 2, 0.2, 3); return 0; }
    const before = f.hp + f.shield;
    const killed = f.takeDamage(amount);
    const dealt = Math.max(0, before - Math.max(0, f.hp + f.shield));
    if (owner && owner !== f) owner.damageDealt += dealt;
    this.burst(pos, [255, 90, 90], 3, 2.5, 0.3, 4);
    if (owner instanceof Joueur) {
      this.popup(pos, String(Math.round(dealt)), killed ? [255, 90, 90] : [255, 240, 150]);
      this.events.push({ type: 'hitmarker', killed });
    }
    if (f instanceof Joueur) {
      this.shake = Math.max(this.shake, 4);
      const angle = owner ? Math.atan2(owner.pos.y - f.pos.y, owner.pos.x - f.pos.x) : 0;
      this.events.push({ type: 'hurt', angle, amount: dealt });
    }
    if (killed) this.lethal(f, owner, cause);
    return dealt;
  }

  // ---------- Éliminations ----------

  eliminate(victim, killer, cause = 'balle') {
    if (!victim.alive) return;
    if (victim.vehicle) this.leaveVehicle(victim);
    victim.alive = false;
    victim.phase = 'mort';
    victim.using = null;
    victim.killedBy = killer && killer !== victim ? killer.name : null;
    if (killer && killer !== victim) killer.kills++;
    const drops = victim.dropAll();
    drops.forEach((drop, i) => {
      const a = (i / Math.max(1, drops.length)) * TWO_PI + random(0.5);
      this.addButin(victim.pos.x + Math.cos(a) * 34, victim.pos.y + Math.sin(a) * 34, drop);
    });
    this.burst(victim.pos, victim.skin.body, 22, 5, 0.9, 7);
    const text = killer && killer !== victim
      ? `${killer.name} a éliminé ${victim.name}`
      : `${victim.name} est tombé (${cause})`;
    this.feed(text, killer instanceof Joueur || victim instanceof Joueur);
    this.events.push({ type: 'elimination', victim, killer, cause, pos: victim.pos.copy() });
    if (killer instanceof Joueur && killer !== victim) this.events.push({ type: 'kill', victim });
    if (victim instanceof Joueur) this.events.push({ type: 'death', killer, cause });
    this.alive = this.alive.filter(f => f.alive);
    // classement : toute l'équipe est classée quand son dernier membre tombe
    const mates = this.fighters.filter(f => f.alive && f.team === victim.team);
    if (mates.length === 0) {
      const placement = this.teamsAlive() + 1;
      for (const f of this.fighters) if (f.team === victim.team) f.placement = placement;
    } else if (mates.every(m => m.phase === 'terre')) {
      // il ne reste que des coéquipiers à terre : ils tombent avec l'équipe
      for (const m of mates) this.eliminate(m, killer, 'équipe');
    }
  }

  // ---------- Effets visuels ----------

  stepEffects(dt) {
    for (const e of this.sparks) e.step(dt);
    this.sparks = this.sparks.filter(e => !e.dead);
    for (const p of this.popups) p.life -= dt;
    this.popups = this.popups.filter(p => p.life > 0);
    this.killfeed = this.killfeed.filter(k => this.time - k.t < 7);
  }

  // ---------- Fin de partie ----------

  checkEnd() {
    const alive = this.fighters.filter(f => f.alive);
    if (this.teamsAlive() > 1 || this.state === 'fin') return;
    this.state = 'fin';
    this.winner = alive[0] || null;
    if (this.winner) {
      for (const f of alive) f.placement = 1;
      this.events.push({ type: 'victory', winner: this.winner });
    }
    this.finish();
  }

  // Résultats du joueur et enregistrement génétique des bots
  finish() {
    const p = this.joueur;
    if (p.alive) p.placement = 1;
    this.result = {
      placement: p.placement,
      kills: p.kills,
      damage: Math.round(p.damageDealt),
      survival: p.survival,
      chests: p.chestsOpened,
      wood: Math.round(p.woodHarvested),
      won: p.placement === 1,
      fighters: this.teamCount,
      revives: p.revives,
      teamSize: this.teamSize
    };
    const evolution = this.options.evolution;
    if (evolution) {
      for (const bot of this.fighters) {
        if (!(bot instanceof Bot) || !bot.brain) continue;
        evolution.record(bot.brain, {
          kills: bot.kills,
          placement: bot.alive ? 1 : bot.placement,
          fighters: this.teamCount,
          survival: bot.survival
        });
      }
    }
  }

  // Cible de la caméra spectateur : un coéquipier vivant d'abord, sinon le combattant vivant le plus proche
  spectateTarget() {
    let alive = this.fighters.filter(f => f.alive);
    if (alive.length === 0) return null;
    const mates = alive.filter(f => f.team === this.joueur.team);
    if (mates.length > 0) alive = mates;
    const p = this.joueur.pos;
    return alive.reduce((best, f) => p5.Vector.dist(f.pos, p) < p5.Vector.dist(best.pos, p) ? f : best, alive[0]);
  }
}
