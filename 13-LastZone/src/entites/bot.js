// Bot : adversaire autonome. Chaque bot possède un CERVEAU (réseau de neurones,
// voir cerveau.js) qui choisit son état d'action à partir de capteurs normalisés ;
// chaque état compose ensuite des steering behaviors (somme pondérée) :
//   bus -> chute (arrive vers le point d'atterrissage) ->
//   butin (arrive vers le butin) / errance (wander + zone) /
//   combat (anneau d'engagement + esquive des balles + visée à interception) /
//   fuite (flee) / soin (utilise un soin à l'abri) / zone (seek vers la zone sûre).
// Sans cerveau, le bot suit des règles écrites à la main : c'est le « professeur »
// qui sert à pré-entraîner les réseaux (imitation) et de point de comparaison.
// Toutes les distances de perception sont limitées (rayon + ligne de vue).

// Comportements personnalisés du bot, enregistrés dans le BehaviorManager : le contexte
// (ctx) est rempli à chaque image par movementContext().
BehaviorManager.register('esquive', (v, ctx) => ctx.dodgeForce || null);
BehaviorManager.register('seekSiHorsZone', (v, ctx) => (ctx.zoneOutside ? v.seek(ctx.zoneTarget) : null));

// Comportements COMPLEXES du bot : un ensemble de comportements de base par état d'action.
// Chaque poids est relu dans CONFIG (weightKey) : le Labo les règle en direct.
const BOT_COMMUN = [
  { name: 'avoid', type: 'avoid', args: ['obstacles'], weightKey: 'bot.weights.avoid' },
  { name: 'shore', type: 'stayInside', args: ['island'], weight: 3 },
  { name: 'separation', type: 'separate', args: ['neighbors'], weightKey: 'bot.weights.separation' },
  { name: 'dodge', type: 'esquive', weightKey: 'bot.weights.dodge' }
];
const BOT_COMPORTEMENTS = {
  butin: [...BOT_COMMUN, { name: 'loot', type: 'arrive', args: ['lootPos'], weightKey: 'bot.weights.loot' }],
  zone: [...BOT_COMMUN, { name: 'zone', type: 'seek', args: ['zoneTarget'], weightKey: 'bot.weights.zone' }],
  errance: [...BOT_COMMUN, { name: 'wander', type: 'wander', weightKey: 'bot.weights.wander' },
    { name: 'zoneSoft', type: 'seek', args: ['zoneTarget'], weight: 0.45 }],
  fuite: [...BOT_COMMUN, { name: 'flee', type: 'flee', args: ['threatPos'], weightKey: 'bot.weights.flee' },
    { name: 'zoneSoft', type: 'seek', args: ['zoneTarget'], weight: 0.6 }],
  combat: [...BOT_COMMUN, { name: 'engage', type: 'arrive', args: ['ringPoint'], weightKey: 'bot.weights.engage' },
    { name: 'zoneOut', type: 'seekSiHorsZone', weight: 0.8 }],
  soin: [...BOT_COMMUN, { name: 'wander', type: 'wander', weight: 0.25 }],
  // mode équipe : aller relever un coéquipier, rejoindre le groupe, rejoindre un véhicule, ramper vers un allié
  secours: [...BOT_COMMUN, { name: 'rescue', type: 'arrive', args: ['rescuePos'], weight: 1.4 }],
  regroupe: [...BOT_COMMUN, { name: 'ally', type: 'arrive', args: ['allyPos'], weight: 1 },
    { name: 'wander', type: 'wander', weight: 0.3 }],
  vehicule: [...BOT_COMMUN, { name: 'ride', type: 'arrive', args: ['vehiclePos'], weight: 1.3 }],
  // ordres du joueur à son équipe : formation en boids, tenir un point, assaut
  escouade: [...BOT_COMMUN,
    { name: 'formation', type: 'arriveBehind', args: ['leaderPos', 75], weight: 1.3 },
    { name: 'groupCohesion', type: 'cohesion', args: ['mates'], weight: 0.5 },
    { name: 'groupAlign', type: 'align', args: ['mates'], weight: 0.6 }],
  tenir: [...BOT_COMMUN, { name: 'hold', type: 'arrive', args: ['holdPos'], weight: 1.5 }],
  assaut: [...BOT_COMMUN, { name: 'push', type: 'seek', args: ['enemyPos'], weight: 1.2 }],
  ramper: [{ name: 'avoid', type: 'avoid', args: ['obstacles'], weight: 2 },
    { name: 'ally', type: 'arrive', args: ['allyPos'], weight: 1 }]
};
// gain du réseau de neurones -> comportement qu'il amplifie ou atténue
const BOT_GAINS = { butin: 'loot', zone: 'zone', engagement: 'engage', fuite: 'flee', esquive: 'dodge', errance: 'wander' };

class Bot extends Combattant {
  // individu : Cerveau (réseau + personnalité) ou Genome (bot à règles)
  constructor(x, y, name, skin, individu, difficulty = CONFIG.difficulte.normal) {
    super(x, y, name, skin);
    this.brain = individu instanceof Cerveau ? individu : null;
    this.genome = this.brain ? this.brain.genome : individu;
    this.diff = difficulty;
    this.state = 'bus';
    this.landing = null;
    this.jumpJitter = random(-250, 250);
    this.target = null;               // ennemi poursuivi
    this.targetVisible = false;
    this.lootTarget = null;
    this.lootTimer = 0;
    this.blacklist = new Map();       // butin inaccessible -> date de fin d'interdiction
    this.strafeSign = random(1) < 0.5 ? -1 : 1;
    this.strafeTimer = random(0.5, CONFIG.bot.strafeEvery);
    this.thinkTimer = random(0.25);
    this.groundTime = 0;
    this.calmTime = random(CONFIG.bot.calmMin, CONFIG.bot.calmMax);
    this.reactionTimer = 0;
    this.clock = 0;
    this.wantsInteract = false;
    this.wantsBuild = false;
    this.buildAngle = 0;
    this.zoneTarget = createVector(x, y);
    this.zoneOver = -999;
    // réglages fournis par le réseau : manière de combattre et gains de steering (0 = neutre)
    this.mods = { idealScale: 0, aimTol: 0, buildBias: 0, gains: new Array(Cerveau.GAINS.length).fill(0) };
    this.recorder = null;             // si défini, les décisions des règles y sont enregistrées
    this.features = null;             // dernier vecteur de capteurs (affichage)
    this.mats.bois = Math.floor(random(0, 50));
    this.distanceCercle = CONFIG.bot.wanderDistance;
    this.wanderRadius = CONFIG.bot.wanderRadius;
    this.displaceRange = CONFIG.bot.wanderDisplace;
    this.debugInfo = null;
    this.boardRequest = null;         // véhicule que le bot veut monter (traité par le Match)
    this.exitRequest = false;         // le bot veut descendre
    this.driveContext = null;         // consigne de conduite lue par le véhicule
    this.vehicleCooldown = random(4, 14);
    this.vehicleTarget = null;
    this.driveTime = 0;
    this.zoneRadius = 0;
    this.vel = p5.Vector.random2D().mult(0.2);
    this.applyLimits();
    for (const name of Object.keys(BOT_COMPORTEMENTS)) this.behaviors.define(name, BOT_COMPORTEMENTS[name]);
    this.behaviors.use('errance');
  }

  get neural() { return this.brain !== null; }

  // Multiplicateur de poids d'une force, réglé par le réseau (1 pour un bot à règles)
  gain(name) {
    return 1 + 0.6 * this.mods.gains[Cerveau.GAINS.indexOf(name)];
  }

  applyLimits() {
    const c = CONFIG.bot;
    if (this.phase === 'chute') {
      this.maxSpeed = CONFIG.match.airSpeed;
      this.maxForce = 0.7;
      return;
    }
    this.maxSpeed = c.maxSpeed * (this.zoneOver > -c.zoneMargin ? 1.22 : 1) * this.speedFactor;
    this.maxForce = c.maxForce;
  }

  // ---------- Largage ----------

  // Le bot saute quand le bus est assez proche de son point d'atterrissage
  shouldJump(bus) {
    if (!this.landing) return true;
    const reach = CONFIG.match.airSpeed * 60 * CONFIG.match.fallTime * 0.55 + this.jumpJitter;
    return p5.Vector.dist(bus.pos, this.landing) <= reach;
  }

  // ---------- Perception ----------

  // L'ennemi le plus proche et visible dans le rayon de perception, ou null
  senseEnemy(world) {
    const range = CONFIG.bot.perception * this.diff.perception;
    const candidates = [];
    for (const f of world.fighters) {
      if (f === this || !f.alive || (f.phase !== 'sol' && f.phase !== 'vehicule') || this.isFriend(f)) continue;
      const d = p5.Vector.dist(this.pos, f.pos);
      if (d <= range) candidates.push({ f, d });
    }
    // un loup qui chasse un combattant proche est une menace comme une autre
    for (const w of world.loups || []) {
      const d = p5.Vector.dist(this.pos, w.pos);
      if (d <= range * 0.6 && w.state === 'chasse') candidates.push({ f: w, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const { f, d } of candidates.slice(0, 3)) {
      if (!world.grid.segmentHit(this.pos, f.pos, 0)) return { enemy: f, distance: d, visible: true, count: candidates.length };
    }
    return candidates.length
      ? { enemy: candidates[0].f, distance: candidates[0].d, visible: false, count: candidates.length } : null;
  }

  // Valeur du butin pour ce bot (selon ses besoins)
  lootValue(obj) {
    const best = this.bestWeapon();
    if (obj instanceof Coffre) return obj.opened ? 0 : 46;
    if (obj instanceof Largage) return 70 * this.genome.genes.cupidite;
    if (!(obj instanceof Butin) || obj.taken) return 0;
    const d = obj.drop;
    if (d.kind === 'arme') {
      if (!best) return 100 + d.rarity * 25;
      return weaponDps(d) > weaponDps(best.item) * 1.15 ? 30 + d.rarity * 28 : 4;
    }
    if (d.kind === 'munitions') {
      if (!best) return 6;
      return this.ammo[d.type] < 40 ? 32 : 5;
    }
    if (d.kind === 'grenade') return 12;          // lancées en combat à portée moyenne
    if (d.kind === 'soin') return this.hp < 70 ? 40 : 14;
    if (d.kind === 'bouclier') return this.shield < 60 ? 42 : 16;
    return 6;
  }

  chooseLoot(world) {
    const nearby = world.lootGrid.query(this.pos.x, this.pos.y, CONFIG.bot.lootPerception);
    let best = null;
    let bestScore = 0;
    for (const obj of nearby) {
      if ((this.blacklist.get(obj) || 0) > this.clock) continue;
      const value = this.lootValue(obj);
      if (value <= 0) continue;
      const score = value / (p5.Vector.dist(this.pos, obj.pos) + 80);
      if (score > bestScore) { bestScore = score; best = obj; }
    }
    return best;
  }

  // Butin visé : on garde la cible courante tant qu'elle existe et reste atteignable
  currentLoot(world) {
    const t = this.lootTarget;
    if (t && (t.taken || t.opened || this.lootTimer > CONFIG.bot.lootGiveUp)) {
      if (this.lootTimer > CONFIG.bot.lootGiveUp) this.blacklist.set(t, this.clock + 25);
      this.lootTarget = null;
    }
    if (!this.lootTarget) {
      this.lootTarget = this.chooseLoot(world);
      this.lootTimer = 0;
    }
    return this.lootTarget;
  }

  // Zone visée : la zone suivante si la tempête va bouger bientôt (anticipation)
  updateZone(world) {
    const storm = world.storm;
    const g = this.genome.genes;
    let center = storm.pos;
    let radius = storm.r;
    if (storm.state === 'attente' && storm.timeLeft < 15 + 55 * g.anticipation && storm.nextRadius < storm.r) {
      center = storm.nextCenter;
      radius = storm.nextRadius;
    }
    this.zoneTarget = center.copy();
    this.zoneRadius = radius;
    this.zoneOver = p5.Vector.dist(this.pos, center) - radius;
  }

  // Indice d'un soin utilisable maintenant (sinon -1) : soin si PV < plafond, potion si bouclier < plafond
  healIndex() {
    let best = -1;
    this.inventory.forEach((item, i) => {
      if (!item || (item.kind !== 'soin' && item.kind !== 'bouclier')) return;
      const def = SOINS[item.type];
      const usable = item.kind === 'soin' ? this.hp < def.cap : this.shield < def.cap;
      if (!usable) return;
      // priorité aux PV quand ils sont bas, sinon au bouclier
      const urgent = item.kind === 'soin' ? this.hp < 75 : this.shield < 50;
      if (urgent && (best < 0 || item.kind === 'soin')) best = i;
      else if (best < 0) best = i;
    });
    return best;
  }

  // ---------- Contexte de décision (commun aux règles et au réseau) ----------

  perceive(world) {
    const g = this.genome.genes;
    let sensed = this.senseEnemy(world);
    // juste après l'atterrissage on fouille : on ignore les ennemis sauf si on est attaqué
    const calming = this.groundTime < this.calmTime && this.lastHit > 3;
    if (calming) sensed = null;
    const previous = this.target;
    this.target = sensed ? sensed.enemy : null;
    this.targetVisible = sensed ? sensed.visible : false;
    if (this.target && this.target !== previous) {
      this.reactionTimer = CONFIG.bot.reaction / this.diff.reaction * random(0.7, 1.3);
    }
    this.updateZone(world);
    const best = this.bestWeapon();
    const armed = !!best && (best.item.mag > 0 || this.ammo[WEAPONS[best.item.type].ammo] > 0);
    const loot = this.currentLoot(world);
    return {
      sensed, armed, best, loot,
      visible: !!sensed && sensed.visible,
      distance: sensed ? sensed.distance : Infinity,
      outside: this.zoneOver > 0,
      zoneUrgent: this.zoneOver > -CONFIG.bot.zoneMargin,
      hurtLimit: 12 + g.prudence * 55,
      healIndex: this.healIndex(),
      calm: !sensed || !sensed.visible || sensed.distance > 320,
      calmLeft: calming ? (this.calmTime - this.groundTime) : 0,
      world
    };
  }

  // Capteurs normalisés (entrées du réseau) — voir Cerveau.INPUT_LABELS
  senses(c) {
    const g = this.genome.genes;
    const w = c.world;
    const storm = w.storm;
    const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
    const toZone = p5.Vector.sub(this.zoneTarget, this.pos);
    const zoneDist = toZone.mag() || 1;
    const sensed = c.sensed;
    const enemy = sensed ? sensed.enemy : null;
    const toEnemy = enemy ? p5.Vector.sub(enemy.pos, this.pos) : null;
    const eDist = toEnemy ? toEnemy.mag() || 1 : 0;
    const weapon = c.best ? c.best.item : null;
    const stats = weapon ? weaponStats(weapon) : null;
    const enemyWeapon = enemy && enemy.bestWeapon ? enemy.bestWeapon() : null;
    let bulletsNear = 0;
    for (const b of w.bullets) if (b.owner !== this && p5.Vector.dist(b.pos, this.pos) < 240) bulletsNear++;
    const loot = c.loot;
    const norm = name => (g[name] - Genome.RANGES[name][0]) / (Genome.RANGES[name][1] - Genome.RANGES[name][0]);
    return [
      this.hp / 100, this.shield / 100, c.armed ? 1 : 0,
      weapon ? clamp(weaponDps(weapon) / 150) : 0,
      weapon ? weapon.mag / stats.mag : 0,
      stats ? clamp(this.ammo[stats.ammo] / 60) : 0,
      this.hasHeal('soin') ? 1 : 0, this.hasHeal('bouclier') ? 1 : 0,
      clamp(this.mats.bois / 100), this.using ? 1 : 0, this.reloading ? 1 : 0,
      clamp(1 - this.lastHit / 5), clamp(c.calmLeft / 20),
      clamp(this.zoneOver / 500, -1, 1), c.zoneUrgent ? 1 : 0, c.outside ? 1 : 0,
      clamp(storm.timeLeft / 60), storm.state === 'reduction' ? 1 : 0,
      toZone.x / zoneDist, toZone.y / zoneDist,
      c.visible ? 1 : 0, enemy ? 1 : 0, clamp(eDist / 600),
      toEnemy ? toEnemy.x / eDist : 0, toEnemy ? toEnemy.y / eDist : 0,
      enemy ? clamp(enemy.vitality / 200) : 0,
      enemyWeapon ? 1 : 0,
      sensed ? clamp(sensed.count / 5) : 0,
      loot ? 1 : 0, loot ? clamp(p5.Vector.dist(this.pos, loot.pos) / 600) : 1, loot ? clamp(this.lootValue(loot) / 100) : 0,
      clamp(bulletsNear / 5),
      norm('agressivite'), norm('prudence'), norm('precision'), norm('cupidite'), norm('anticipation'), norm('reflexe'),
      clamp((this.diff.perception - 0.8) / 0.4),
      enemyWeapon ? clamp(weaponDps(enemyWeapon.item) / 150) : 0,
      clamp(this.nearestCover(w) / 200),
      clamp(this.vel.mag() / Math.max(0.1, this.maxSpeed))
    ];
  }

  // Distance au bord de l'obstacle le plus proche (200 si rien alentour)
  nearestCover(world) {
    let best = 200;
    for (const o of world.grid.query(this.pos.x, this.pos.y, 200)) {
      best = Math.min(best, Math.max(0, p5.Vector.dist(this.pos, o.pos) - o.r));
    }
    return best;
  }

  // États permis (le réseau ne peut pas choisir l'impossible)
  validStates(c) {
    return Cerveau.STATES.map(state => {
      switch (state) {
        case 'butin': return !!c.loot;
        case 'combat': return c.visible && c.armed;
        case 'fuite': return c.visible;
        case 'soin': return c.healIndex >= 0;
        default: return true;
      }
    });
  }

  // Règles écrites à la main : le « professeur » (imitation) et le bot de référence
  rules(c) {
    const g = this.genome.genes;
    if (c.healIndex >= 0 && c.calm && this.vitality < 100 + c.hurtLimit
      && (this.hp < 60 + 20 * g.prudence || this.shield < 20 * g.prudence)) {
      const item = this.inventory[c.healIndex];
      const needed = item.kind === 'soin' ? this.hp < 75 : this.shield < 50;
      if (needed) return 'soin';
    }
    if (c.visible && this.vitality < c.hurtLimit && c.distance < 520) return 'fuite';
    const engageRange = (260 + 380 * g.agressivite) * this.diff.perception;
    const provoked = this.lastHit < 3;
    if (c.visible && c.armed && (c.distance < engageRange || provoked) && (!c.outside || c.distance < 240)) return 'combat';
    if (!c.armed) return c.loot ? 'butin' : (c.zoneUrgent ? 'zone' : 'errance');
    if (c.zoneUrgent) return 'zone';
    // fouille : déterministe (le réseau peut l'apprendre exactement) — un bot cupide ramasse même le butin de faible valeur
    const greed = 0.25 + 0.75 * g.cupidite;
    const value = c.loot ? this.lootValue(c.loot) / 100 : 0;
    return c.loot && value + greed * 0.8 > 0.65 ? 'butin' : 'errance';
  }

  // ---------- Décision ----------

  decide(world) {
    const c = this.perceive(world);
    if (this.using) { this.state = 'soin'; return; }
    const valid = this.validStates(c);
    let state;
    if (this.brain) {
      this.features = this.senses(c);
      const decision = this.brain.decide(this.features, valid);
      state = decision.state;
      this.mods = { idealScale: decision.idealScale, aimTol: decision.aimTol, buildBias: decision.buildBias,
        gains: decision.gains || new Array(Cerveau.GAINS.length).fill(0) };
    } else {
      state = this.rules(c);
      if (this.recorder) {
        this.features = this.senses(c);
        const y = new Array(Cerveau.OUTPUTS).fill(0);
        y[Cerveau.STATES.indexOf(state)] = 1;
        this.recorder.push({ x: this.features, y });
      }
    }
    this.enter(state, c);
  }

  // Applique les effets de bord de l'état choisi
  enter(state, c) {
    if (state === 'soin') {
      if (c.healIndex < 0) state = 'errance';
      else {
        this.select(c.healIndex);
        if (!this.startUse()) state = 'errance';
      }
    }
    this.state = state;
  }

  // ---------- Pilotage ----------

  // world : { fighters, grid, lootGrid, storm, bullets, carte }
  // Retourne les balles tirées pendant ce pas.
  think(world, dt) {
    this.tick(dt);
    this.clock += dt;
    this.wantsInteract = false;
    this.wantsBuild = false;
    if (this.phase === 'bus' || this.phase === 'mort') return [];

    if (this.phase === 'chute') {
      this.fallTime -= dt;
      this.applyLimits();
      const target = this.landing || world.storm.pos;
      this.applyForce(this.seek(target, true));
      return [];
    }

    this.holdInteract = false;
    this.boardRequest = null;
    this.exitRequest = false;
    this.driveContext = null;
    this.vehicleCooldown = Math.max(0, this.vehicleCooldown - dt);
    if (this.phase === 'terre') return this.crawl(world, dt);
    if (this.phase === 'vehicule') return this.thinkInVehicle(world, dt);

    this.groundTime += dt;
    this.reactionTimer = Math.max(0, this.reactionTimer - dt);
    this.thinkTimer -= dt;
    this.strafeTimer -= dt;
    this.lootTimer += dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.22 + random(0.12);
      this.decide(world);
    } else {
      this.updateZone(world);
    }
    if (this.strafeTimer <= 0) {
      this.strafeTimer = CONFIG.bot.strafeEvery * random(0.6, 1.4);
      this.strafeSign = random(1) < 0.5 ? -1 : 1;
    }
    this.applyLimits();

    // contexte de mouvement, puis comportements complexes de l'état courant (BehaviorManager)
    const ctx = this.movementContext(world);
    let bullets = [];
    const mode = this.teamMode(world, ctx);
    if (mode) {
      this.behaviors.use(mode);
      this.debugInfo = { forces: this.behaviors.apply(ctx), state: mode };
      return bullets;
    }
    switch (this.state) {
      case 'butin':
        if (this.lootTarget && p5.Vector.dist(this.pos, this.lootTarget.pos) <= CONFIG.joueur.pickupRadius * 0.8) this.wantsInteract = true;
        break;
      case 'fuite':
        if (this.target) this.maybeBuildWall(dt);
        break;
      case 'combat':
        if (this.target) bullets = this.fight(world, dt, ctx);
        break;
      default:
    }
    this.behaviors.use(this.state in BOT_COMPORTEMENTS ? this.state : 'errance');
    for (const gain of Object.keys(BOT_GAINS)) this.behaviors.setScale(BOT_GAINS[gain], this.gain(gain));
    // l'esquive dépend du réflexe du génome
    this.behaviors.setScale('dodge', this.gain('esquive') * (0.3 + this.genome.genes.reflexe) * this.diff.reaction);

    // recharge quand rien ne se passe
    if (this.state !== 'combat' && this.weapon && this.weapon.mag < this.stats.mag * 0.5) this.startReload();

    this.debugInfo = { forces: this.behaviors.apply(ctx), state: this.state };
    return bullets;
  }

  // ---------- Équipe et véhicules ----------

  nearestMate(world, filter) {
    let best = null;
    let record = Infinity;
    for (const f of world.fighters) {
      if (f === this || !f.alive || !this.isFriend(f) || !filter(f)) continue;
      const d = p5.Vector.dist(this.pos, f.pos);
      if (d < record) { record = d; best = f; }
    }
    return best;
  }

  // Véhicule à rejoindre : libre ou conduit par un coéquipier, sinon rien
  chooseVehicle(world) {
    let best = null;
    let record = Infinity;
    for (const v of world.vehicules || []) {
      if (v.dead || v.freeSeat < 0) continue;
      const mateDriver = !!v.driver && this.isFriend(v.driver);
      if (v.driver && !mateDriver) continue;
      const d = p5.Vector.dist(this.pos, v.pos);
      if (d > (mateDriver ? 650 : 330) || d >= record) continue;
      record = d;
      best = v;
    }
    return best;
  }

  // Comportement d'équipe / de transport qui remplace l'état du réseau tant qu'il s'applique.
  // Retourne le nom du comportement complexe à utiliser, ou null.
  teamMode(world, ctx) {
    const threat = this.target && this.targetVisible && p5.Vector.dist(this.pos, this.target.pos) < 330;
    // 1. relever un coéquipier à terre
    const downed = this.nearestMate(world, f => f.phase === 'terre');
    if (downed && !threat && p5.Vector.dist(this.pos, downed.pos) < 700) {
      ctx.rescuePos = downed.pos;
      if (p5.Vector.dist(this.pos, downed.pos) < CONFIG.equipe.reviveRange * 0.8) this.holdInteract = true;
      return 'secours';
    }
    // 2. monter dans un véhicule proche (d'autant plus volontiers que la zone presse, ou que le chef y est)
    const order = world.ordre;
    const leader = world.leader;
    const ordered = !!order && order !== 'libre' && world.teamSize > 1 && leader !== this
      && this.team === world.playerTeam && !!leader && leader.alive;
    if (!threat && this.vehicleCooldown <= 0 && this.groundTime > 4) {
      if (!this.vehicleTarget || this.vehicleTarget.dead || this.vehicleTarget.freeSeat < 0) {
        this.vehicleTarget = null;
        const chiefCar = ordered && order === 'suivre' && leader.vehicle && leader.vehicle.freeSeat >= 0
          && p5.Vector.dist(this.pos, leader.vehicle.pos) < 700;
        if (chiefCar) this.vehicleTarget = leader.vehicle;
        else if (random(1) < (this.zoneOver > -200 ? 0.05 : 0.008)) this.vehicleTarget = this.chooseVehicle(world);
      }
      const v = this.vehicleTarget;
      if (v) {
        const d = p5.Vector.dist(this.pos, v.pos);
        if (d > 700) this.vehicleTarget = null;
        else if (d <= v.r + this.r + 30) { this.boardRequest = v; this.vehicleTarget = null; }
        else { ctx.vehiclePos = v.pos; return 'vehicule'; }
      }
    }
    // 2b. ordres du joueur (sauf si la tempête presse ou qu'un ennemi est tout près)
    if (ordered && !threat && this.zoneOver <= -CONFIG.bot.zoneMargin) {
      const mates = world.fighters.filter(f => f.alive && f.team === this.team && f !== this && f !== leader && f.phase === 'sol');
      if (order === 'suivre') {
        ctx.leaderPos = leader.pos;
        ctx.mates = mates.filter(f => p5.Vector.dist(f.pos, this.pos) < 300);
        return 'escouade';
      }
      if (order === 'tenir' && world.holdPoint) {
        const index = Math.max(0, mates.concat(this).sort((a, b) => a.name < b.name ? -1 : 1).indexOf(this));
        const angle = (index / Math.max(1, mates.length + 1)) * TWO_PI;
        ctx.holdPos = createVector(world.holdPoint.x + Math.cos(angle) * 80, world.holdPoint.y + Math.sin(angle) * 80);
        return 'tenir';
      }
      if (order === 'attaque') {
        let best = null;
        let record = 1100;
        for (const f of world.fighters) {
          if (!f.alive || f.phase !== 'sol' || f.team === this.team) continue;
          const d = p5.Vector.dist(this.pos, f.pos);
          if (d < record) { record = d; best = f; }
        }
        if (best) { ctx.enemyPos = best.pos; return 'assaut'; }
      }
    }
    // 3. rester groupé avec l'équipe quand on fouille
    if (world.teamSize > 1 && this.state === 'errance' && !threat) {
      const mate = this.nearestMate(world, f => f.phase === 'sol');
      if (mate && p5.Vector.dist(this.pos, mate.pos) > 380) { ctx.allyPos = mate.pos; return 'regroupe'; }
    }
    return null;
  }

  // À terre : on rampe vers un coéquipier debout, sans pouvoir tirer
  crawl(world, dt) {
    this.applyLimits();
    this.updateZone(world);
    const mate = this.nearestMate(world, f => f.phase === 'sol' || f.phase === 'vehicule');
    const ctx = this.movementContext(world);
    ctx.allyPos = mate ? mate.pos : null;
    this.behaviors.use('ramper');
    this.debugInfo = { forces: this.behaviors.apply(ctx), state: 'terre' };
    return [];
  }

  // Dans un véhicule : le conducteur fonce vers la zone (ou écrase un ennemi proche), les
  // passagers tirent ; on descend au cœur de la zone, au bout d'un moment ou véhicule en feu.
  thinkInVehicle(world, dt) {
    const veh = this.vehicle;
    this.driveTime += dt;
    this.reactionTimer = Math.max(0, this.reactionTimer - dt);
    this.thinkTimer -= dt;
    this.updateZone(world);
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.22 + random(0.12);
      const previous = this.target;
      const sensed = this.senseEnemy(world);
      this.target = sensed ? sensed.enemy : null;
      this.targetVisible = sensed ? sensed.visible : false;
      if (this.target && this.target !== previous) this.reactionTimer = CONFIG.bot.reaction / this.diff.reaction * random(0.7, 1.3);
    }
    const core = Math.max(140, 0.45 * this.zoneRadius);
    const inCore = p5.Vector.dist(veh.pos, this.zoneTarget) < core;
    if (inCore || this.driveTime > 40 || veh.hp < veh.maxHp * 0.25) {
      this.exitRequest = true;
      this.vehicleCooldown = 18;
      this.driveTime = 0;
      return [];
    }
    if (veh.driver === this) {
      const ram = this.target && this.targetVisible && p5.Vector.dist(veh.pos, this.target.pos) < 420 && veh.hp > veh.maxHp * 0.4;
      this.driveContext = {
        ai: true,
        destination: ram ? this.target.pos : this.zoneTarget,
        obstacles: world.grid.query(veh.pos.x, veh.pos.y, 190).map(o => ({ pos: o.pos, r: o.r }))
      };
      return [];
    }
    // passager : tire sur la cible
    if (this.target && this.stats) {
      this.chooseWeapon(p5.Vector.dist(this.pos, this.target.pos));
      const s = this.stats;
      if (s) return this.aimAndFire(this.target, s, dt);
    }
    return [];
  }

  // Données lues par les comportements : obstacles proches, voisins, île, cibles
  movementContext(world) {
    const neighbors = world.fighters.filter(f => f !== this && f.alive && f.phase === 'sol'
      && p5.Vector.dist(f.pos, this.pos) < 70);
    return {
      obstacles: world.grid.query(this.pos.x, this.pos.y, 150).map(o => ({ pos: o.pos, r: o.r })),
      neighbors,
      island: {
        center: createVector(world.carte.cx, world.carte.cy),
        radius: world.carte.shoreRadius(this.pos) - CONFIG.island.shoreMargin,
        margin: 120
      },
      lootPos: this.lootTarget ? this.lootTarget.pos : null,
      zoneTarget: this.zoneTarget,
      zoneOutside: this.zoneOver > 0,
      threatPos: this.target ? this.target.pos : null,
      ringPoint: null,
      rescuePos: null, allyPos: null, vehiclePos: null,
      leaderPos: null, mates: [], holdPos: null, enemyPos: null,
      dodgeForce: this.dodgeForce(world)
    };
  }

  // Balle ennemie la plus menaçante dans un rayon proche
  dodgeForce(world) {
    let best = null;
    let record = 240;
    for (const b of world.bullets) {
      if (b.owner === this || b.dead || (b.owner && this.isFriend(b.owner)) || b.grenade) continue;
      const d = p5.Vector.dist(b.pos, this.pos);
      if (d < record) { record = d; best = b; }
    }
    return best ? Behaviors.sidestep(this, best.pos, best.vel, 34) : null;
  }

  maybeBuildWall(dt) {
    if (this.mats.bois < CONFIG.joueur.buildCost || this.wallTimer > 0 || !this.target) return;
    if (random(1) < dt * 1.2 * (1 + this.mods.buildBias)) {
      this.wantsBuild = true;
      this.buildAngle = Math.atan2(this.target.pos.y - this.pos.y, this.target.pos.x - this.pos.x);
    }
  }

  // Combat : anneau d'engagement autour de la cible, visée, tir
  fight(world, dt, ctx) {
    const t = this.target;
    const g = this.genome.genes;
    this.chooseWeapon(p5.Vector.dist(this.pos, t.pos));
    const s = this.stats;
    if (!s) return [];
    const ideal = constrain(s.range * (0.62 - 0.32 * g.agressivite) * (1 + 0.35 * this.mods.idealScale), 90, 460);
    const radial = p5.Vector.sub(this.pos, t.pos);
    if (radial.magSq() === 0) radial.set(1, 0);
    const angle = radial.heading() + 0.55 * this.strafeSign;
    const ring = createVector(t.pos.x + Math.cos(angle) * ideal, t.pos.y + Math.sin(angle) * ideal);
    ctx.ringPoint = ring;
    if (this.lastHit < 0.5) this.maybeBuildWall(dt);
    return this.aimAndFire(t, s, dt);
  }

  // Visée à interception (rotation limitée) puis tir ; lance une grenade à portée moyenne
  aimAndFire(t, s, dt) {
    const g = this.genome.genes;
    const gap = p5.Vector.dist(this.pos, t.pos);
    if (this.targetVisible && this.reactionTimer <= 0 && gap > 110 && gap < EXPLOSIFS.grenade.speed * EXPLOSIFS.grenade.fuse * 60
      && this.inventory.some(it => it && it.kind === 'grenade') && random(1) < dt * 0.6) {
      const grenade = this.throwGrenade(gap);
      if (grenade) return [grenade];
    }
    const lead = Behaviors.leadPoint(this.pos, t.pos, t.vel, s.speed);
    const desired = Math.atan2(lead.y - this.pos.y, lead.x - this.pos.x);
    const turn = CONFIG.bot.aimTurn * (0.6 + 0.8 * g.precision) * this.diff.reaction;
    const diff = Behaviors.angleDifference(this.aim, desired);
    this.aim += constrain(diff, -turn, turn);
    const remaining = Math.abs(Behaviors.angleDifference(this.aim, desired));
    const distance = p5.Vector.dist(this.pos, t.pos);
    const tolerance = (0.07 + (1 - g.precision) * 0.1) * (1 + 0.4 * this.mods.aimTol);
    if (this.targetVisible && this.reactionTimer <= 0 && distance <= s.range * 0.95 && remaining < tolerance) {
      const quality = constrain(g.precision * this.diff.aim, 0.3, 1);
      const error = (random(-1, 1) + random(-1, 1)) * 0.5 * (1 - quality) * 0.22;
      return this.tryFire(true, true, error);
    }
    if (this.weapon && this.weapon.mag === 0) this.startReload();
    return [];
  }

  // Choisit l'arme la plus adaptée à la distance (parmi celles utilisables)
  chooseWeapon(distance) {
    if (this.reloading || this.cooldown > 0.05 || this.using) return;
    let bestIndex = -1;
    let bestScore = -Infinity;
    this.inventory.forEach((item, index) => {
      if (!item || item.kind !== 'arme') return;
      const s = weaponStats(item);
      if (item.mag <= 0 && this.ammo[s.ammo] <= 0) return;
      let score = weaponDps(item);
      if (distance > s.range * 0.9) score *= 0.2;
      if (item.type === 'pompe' && distance > 260) score *= 0.35;
      if (item.type === 'sniper' && distance < 260) score *= 0.4;
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    if (bestIndex >= 0 && bestIndex !== this.slot) this.select(bestIndex);
  }
}
