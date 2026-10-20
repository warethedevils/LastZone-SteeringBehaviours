// Vehicle : la classe de base de TOUS les objets animés du jeu.
//
// Version enrichie du Vehicle fourni dans 4-Wander (modification de cette copie
// autorisée explicitement par l'utilisateur) :
//   - tous les comportements de BASE de Reynolds sont des méthodes de Vehicle :
//     seek, arrive, flee, pursue, evade, wander, separate, align, cohesion,
//     avoid (évitement d'obstacles), boundaries (confinement), followPath ;
//   - chaque Vehicle possède par défaut un BehaviorManager (this.behaviors) qui
//     permet d'ajouter / retirer / activer / désactiver des comportements, de les
//     pondérer, et de sauvegarder / charger des comportements COMPLEXES (ensembles
//     nommés de comportements de base).
// Les sous-classes n'ajoutent que des comportements personnalisés ou composés.
//
// Loi commune : steering = vitesse désirée - vitesse actuelle, limité à maxForce.

// =====================================================================
// BehaviorManager : gestionnaire de comportements
// =====================================================================
class BehaviorManager {
  // Registre des comportements nommés : nom -> (vehicle, contexte, ...args) => p5.Vector | null
  // Les entrées sérialisables référencent un nom du registre (et des clés du contexte).
  static registry = {};

  static register(name, fn) {
    BehaviorManager.registry[name] = fn;
  }

  constructor(owner) {
    this.owner = owner;
    this.entries = new Map();     // nom -> { name, type, fn, weight, weightKey, args, enabled, scale }
    this.complex = new Map();     // nom -> [{ type, weight, args, name? }]
    this.activeComplex = null;
  }

  // ---------- Ajouter / retirer ----------

  // Ajoute un comportement. `behavior` est soit une fonction (vehicle, ctx) => force,
  // soit le nom d'un comportement du registre. options : { args: [clés du contexte...],
  // weightKey: 'chemin.dans.CONFIG' (poids relu à chaque image), enabled: bool }
  add(name, behavior, weight = 1, options = {}) {
    const fn = typeof behavior === 'function' ? behavior : null;
    const type = typeof behavior === 'string' ? behavior : (options.type || null);
    if (!fn && !BehaviorManager.registry[type]) throw new Error('comportement inconnu : ' + behavior);
    this.entries.set(name, {
      name, type, fn, weight, args: options.args || [], weightKey: options.weightKey || null,
      enabled: options.enabled !== false, scale: 1
    });
    return this;
  }

  remove(name) { return this.entries.delete(name); }
  clear() { this.entries.clear(); this.activeComplex = null; }
  has(name) { return this.entries.has(name); }
  get(name) { return this.entries.get(name) || null; }
  names() { return Array.from(this.entries.keys()); }

  enable(name, on = true) {
    const e = this.entries.get(name);
    if (e) e.enabled = on;
    return !!e;
  }
  disable(name) { return this.enable(name, false); }
  toggle(name) {
    const e = this.entries.get(name);
    if (e) e.enabled = !e.enabled;
    return e ? e.enabled : false;
  }
  isEnabled(name) { const e = this.entries.get(name); return !!e && e.enabled; }

  setWeight(name, weight) {
    const e = this.entries.get(name);
    if (e) { e.weight = weight; e.weightKey = null; }
    return !!e;
  }

  // Facteur appliqué en plus du poids (par exemple réglé par un réseau de neurones)
  setScale(name, scale) {
    const e = this.entries.get(name);
    if (e) e.scale = scale;
    return !!e;
  }

  // Poids effectif d'une entrée (poids lu dans CONFIG si weightKey est défini)
  weightOf(e) {
    let w = e.weight;
    if (e.weightKey && typeof CONFIG !== 'undefined') {
      const v = e.weightKey.split('.').reduce((o, k) => (o === undefined ? undefined : o[k]), CONFIG);
      if (typeof v === 'number') w = v;
    }
    return w * e.scale;
  }

  // ---------- Calcul et application ----------

  // Calcule les forces pondérées de tous les comportements actifs : { nom: p5.Vector }
  compute(ctx = {}) {
    const forces = {};
    for (const e of this.entries.values()) {
      if (!e.enabled) continue;
      const w = this.weightOf(e);
      if (w === 0) continue;
      const raw = e.fn ? e.fn(this.owner, ctx) : BehaviorManager.registry[e.type](this.owner, ctx, ...e.args);
      if (!raw) continue;
      forces[e.name] = raw.copy().mult(w);
    }
    return forces;
  }

  // Calcule puis applique les forces au véhicule (applyForce) ; retourne les forces appliquées
  apply(ctx = {}) {
    const forces = this.compute(ctx);
    for (const name of Object.keys(forces)) this.owner.applyForce(forces[name]);
    return forces;
  }

  // ---------- Comportements complexes (ensembles nommés) ----------

  // Définit un comportement complexe : une liste de comportements de base du registre.
  // entries : [{ type, weight, args?, name?, weightKey? }]
  define(name, entries) {
    this.complex.set(name, entries.map(e => ({ ...e })));
    return this;
  }

  // Remplace les comportements actuels par ceux du comportement complexe `name`
  use(name) {
    const definition = this.complex.get(name);
    if (!definition) return false;
    if (this.activeComplex === name) return true;
    this.entries.clear();
    for (const d of definition) this.add(d.name || d.type, d.type, d.weight, { args: d.args, weightKey: d.weightKey, enabled: d.enabled });
    this.activeComplex = name;
    return true;
  }

  // ---------- Sauvegarde / chargement ----------

  // Description JSON de l'état courant (comportements actifs) : seuls les comportements
  // du registre sont sérialisables
  describe() {
    return Array.from(this.entries.values()).filter(e => e.type).map(e => ({
      name: e.name, type: e.type, weight: e.weight, weightKey: e.weightKey, args: e.args, enabled: e.enabled
    }));
  }

  // Sauvegarde les comportements complexes définis et l'état courant
  save() {
    const complex = {};
    for (const [name, list] of this.complex) complex[name] = list;
    return JSON.stringify({ complex, active: this.activeComplex, current: this.describe() });
  }

  // Recharge ce qui a été sauvegardé (les comportements doivent exister dans le registre)
  load(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    this.complex.clear();
    for (const name of Object.keys(data.complex || {})) this.define(name, data.complex[name]);
    this.entries.clear();
    this.activeComplex = null;
    for (const d of data.current || []) {
      if (!BehaviorManager.registry[d.type]) continue;
      this.add(d.name, d.type, d.weight, { args: d.args, weightKey: d.weightKey, enabled: d.enabled });
    }
    this.activeComplex = data.active || null;
    return this;
  }
}

// =====================================================================
// Vehicle
// =====================================================================
class Vehicle {
  static debug = false;

  constructor(x, y, image, pathColor = "white") {
    this.pos = createVector(x, y);
    this.vel = createVector(1, 0);
    this.acc = createVector(0, 0);
    this.maxSpeed = 4;
    this.maxForce = 0.2;
    this.r = 46;

    // sprite image du véhicule
    this.image = image;

    // pour comportement arrive
    this.slowRadius = 100;

    // pour comportement wander
    this.distanceCercle = 150;
    this.wanderRadius = 50;
    this.wanderTheta = -Math.PI / 2;
    this.displaceRange = 0.3;

    // trainée derrière les véhicules
    this.path = [];
    this.pathLength = 10;
    this.pathSpacingInFrames = 5;
    this.pathColor = "white";

    // gestionnaire de comportements (ajout / retrait / activation / sauvegarde)
    this.behaviors = new BehaviorManager(this);
  }

  // ---------------------------------------------------------------
  // Comportements de base. Chacun retourne une force (p5.Vector) limitée à maxForce.
  // ---------------------------------------------------------------

  // steering = vitesse désirée - vitesse actuelle, limité à maxForce
  steerToward(desired) {
    const steering = p5.Vector.sub(desired, this.vel);
    steering.limit(this.maxForce);
    return steering;
  }

  // Seek : se diriger vers un point. arrival = true : ralentit près de la cible (arrive)
  seek(target, arrival = false) {
    let force = p5.Vector.sub(target, this.pos);
    let desiredSpeed = this.maxSpeed;
    if (arrival) {
      const distance = force.mag();
      if (distance < this.slowRadius) {
        desiredSpeed = map(distance, 0, this.slowRadius, 0, this.maxSpeed);
      }
    }
    force.setMag(desiredSpeed);
    force.sub(this.vel);
    force.limit(this.maxForce);
    return force;
  }

  arrive(target) {
    // 2nd argument true enables the arrival behavior
    return this.seek(target, true);
  }

  // Flee : la vitesse désirée s'éloigne du point
  flee(target) {
    const desired = p5.Vector.sub(this.pos, target);
    if (desired.magSq() === 0) desired.set(1, 0);
    desired.setMag(this.maxSpeed);
    return this.steerToward(desired);
  }

  // Point où sera `other` dans T images, T proportionnel à la distance (plafonné)
  predictPosition(other, maxFrames = 30) {
    const distance = p5.Vector.dist(this.pos, other.pos);
    const frames = this.maxSpeed > 0 ? Math.min(maxFrames, distance / this.maxSpeed) : 0;
    return p5.Vector.add(other.pos, p5.Vector.mult(other.vel, frames));
  }

  // Pursue : seek vers la position future de la cible
  pursue(vehicle, maxFrames = 30) {
    const target = this.predictPosition(vehicle, maxFrames);
    if (Vehicle.debug) {
      push();
      fill(0, 255, 0);
      noStroke();
      circle(target.x, target.y, 10);
      pop();
    }
    return this.seek(target);
  }

  // Evade : fuite depuis la position future de la cible
  evade(vehicle, maxFrames = 30) {
    return this.flee(this.predictPosition(vehicle, maxFrames));
  }

  wander() {
    // point devant le véhicule, centre du cercle
    let pointDevant = this.vel.copy();
    pointDevant.setMag(this.distanceCercle);
    pointDevant.add(this.pos);

    // On calcule le point SUR LE CERCLE : il fait un angle wanderTheta avec
    // le centre du cercle ; l'angle final est l'angle du véhicule + cet angle
    let theta = this.wanderTheta + this.vel.heading();
    let pointSurLeCercle = createVector(0, 0);
    pointSurLeCercle.x = this.wanderRadius * cos(theta);
    pointSurLeCercle.y = this.wanderRadius * sin(theta);
    pointSurLeCercle.add(pointDevant);

    if (Vehicle.debug) {
      push();
      fill("red");
      noStroke();
      circle(pointDevant.x, pointDevant.y, 8);
      noFill();
      stroke(255);
      circle(pointDevant.x, pointDevant.y, this.wanderRadius * 2);
      stroke(255, 255, 255, 80);
      line(this.pos.x, this.pos.y, pointDevant.x, pointDevant.y);
      fill("green");
      noStroke();
      circle(pointSurLeCercle.x, pointSurLeCercle.y, 16);
      pop();
    }

    // entre chaque image on déplace aléatoirement le point vert en changeant un peu son angle
    this.wanderTheta += random(-this.displaceRange, this.displaceRange);

    // D'après l'article de Reynolds, la force est le vecteur qui va du centre du
    // véhicule à ce point vert, limité à maxForce
    let force = p5.Vector.sub(pointSurLeCercle, this.pos);
    force.setMag(this.maxForce);
    return force;
  }

  // Séparation : s'éloigner des voisins (poids 1/d², plus le voisin est proche plus il compte)
  separate(neighbors) {
    const sum = createVector(0, 0);
    let count = 0;
    for (const other of neighbors) {
      if (other === this) continue;
      const diff = p5.Vector.sub(this.pos, other.pos);
      const d = Math.max(diff.mag(), 0.001);
      diff.div(d * d);
      sum.add(diff);
      count++;
    }
    if (count === 0 || sum.magSq() === 0) return createVector(0, 0);
    sum.setMag(this.maxSpeed);
    return this.steerToward(sum);
  }

  // Alignement : adopter la vitesse moyenne des voisins
  align(neighbors) {
    if (neighbors.length === 0) return createVector(0, 0);
    const sum = createVector(0, 0);
    for (const other of neighbors) sum.add(other.vel);
    if (sum.magSq() === 0) return createVector(0, 0);
    sum.setMag(this.maxSpeed);
    return this.steerToward(sum);
  }

  // Cohésion : viser le centre de masse des voisins
  cohesion(neighbors) {
    if (neighbors.length === 0) return createVector(0, 0);
    const center = createVector(0, 0);
    for (const other of neighbors) center.add(other.pos);
    center.div(neighbors.length);
    const desired = p5.Vector.sub(center, this.pos);
    if (desired.magSq() === 0) return createVector(0, 0);
    desired.setMag(this.maxSpeed);
    return this.steerToward(desired);
  }

  // Évitement d'obstacles circulaires [{ pos, r }] : on regarde devant (vecteur « ahead »
  // proportionnel à la vitesse) et on se pousse loin du centre de l'obstacle le plus menaçant
  avoid(obstacles, lookAhead = 24, margin = 8) {
    const speed = this.vel.mag();
    if (speed < 0.0001 || obstacles.length === 0) return createVector(0, 0);
    const ahead = this.vel.copy().setMag(lookAhead + speed * 8);
    const tip = p5.Vector.add(this.pos, ahead);
    const mid = p5.Vector.add(this.pos, p5.Vector.mult(ahead, 0.5));
    let worst = null;
    let worstGap = Infinity;
    let worstPoint = null;
    for (const obstacle of obstacles) {
      if (obstacle === this) continue;
      for (const probe of [tip, mid, this.pos]) {
        const gap = p5.Vector.dist(probe, obstacle.pos) - (obstacle.r + this.r + margin);
        if (gap < worstGap) { worstGap = gap; worst = obstacle; worstPoint = probe; }
      }
    }
    if (!worst || worstGap >= 0) return createVector(0, 0);
    const desired = p5.Vector.sub(worstPoint, worst.pos);
    if (desired.magSq() === 0) desired.set(-this.vel.y, this.vel.x);
    desired.setMag(this.maxSpeed);
    return this.steerToward(desired);
  }

  // Confinement dans un rectangle { x, y, w, h } : près d'un bord, la vitesse désirée
  // est « réfléchie » comme au billard
  boundaries(rect, margin = 25) {
    let desired = null;
    if (this.pos.x < rect.x + margin) desired = createVector(this.maxSpeed, this.vel.y);
    else if (this.pos.x > rect.x + rect.w - margin) desired = createVector(-this.maxSpeed, this.vel.y);
    if (this.pos.y < rect.y + margin) desired = createVector(desired ? desired.x : this.vel.x, this.maxSpeed);
    else if (this.pos.y > rect.y + rect.h - margin) desired = createVector(desired ? desired.x : this.vel.x, -this.maxSpeed);
    if (!desired) return createVector(0, 0);
    if (desired.magSq() === 0) desired.set(this.maxSpeed, 0);
    desired.setMag(this.maxSpeed);
    return this.steerToward(desired);
  }

  // Suivi de chemin (Reynolds) : on projette la position FUTURE sur le chemin et on vise
  // un point plus loin sur ce chemin. path : objet avec project(point), pointAhead(proj, d), radius.
  // Dans le couloir la force est atténuée par insideGain (0 = on ne fait rien sur la route).
  followPath(path, predictFrames = 20, aheadDistance = 30, insideGain = 0.5) {
    const future = p5.Vector.add(this.pos, p5.Vector.mult(this.vel, predictFrames));
    const projection = path.project(future);
    const target = path.pointAhead(projection, aheadDistance);
    const force = this.seek(target);
    if (projection.distance <= path.radius) force.mult(insideGain);
    return force;
  }

  // ---------------------------------------------------------------
  // Locomotion (inchangée)
  // ---------------------------------------------------------------

  applyForce(force) {
    this.acc.add(force);
  }

  update() {
    this.vel.add(this.acc);
    this.vel.limit(this.maxSpeed);
    this.pos.add(this.vel);
    this.acc.set(0, 0);

    // on rajoute la position courante dans le tableau du chemin
    // On ne va pas mémoriser toutes les positions mais seulement une tous les x frames
    // et on limite la taille maximale du chemin à this.pathLength
    if (frameCount % this.pathSpacingInFrames === 0) {
      this.path.push(this.pos.copy());
    }
    if (this.path.length > this.pathLength) {
      this.path.shift();
    }
  }

  show() {
    // dessin du chemin avec un dégradé couleur arc-en-ciel
    this.path.forEach((p, index) => {
      let inter = map(index, this.path.length, 0, 0, 1);
      this.pathColor = lerpColor(color("red"), color("blue"), inter);
      stroke(this.pathColor);
      fill(this.pathColor);
      circle(p.x, p.y, 3);
    });

    // dessin du vaisseau avec image
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading() - PI / 2);
    imageMode(CENTER);
    image(this.image, 0, 0, this.r * 2, this.r * 2);
    pop();
  }

  edges() {
    if (this.pos.x > width + this.r) {
      this.pos.x = -this.r;
    } else if (this.pos.x < -this.r) {
      this.pos.x = width + this.r;
    }
    if (this.pos.y > height + this.r) {
      this.pos.y = -this.r;
    } else if (this.pos.y < -this.r) {
      this.pos.y = height + this.r;
    }
  }
}

// =====================================================================
// Comportements de base enregistrés par défaut : utilisables par nom dans un
// BehaviorManager (et donc sauvegardables). args = clés du contexte.
// =====================================================================
BehaviorManager.register('seek', (v, ctx, key) => (ctx[key] ? v.seek(ctx[key]) : null));
BehaviorManager.register('arrive', (v, ctx, key) => (ctx[key] ? v.arrive(ctx[key]) : null));
BehaviorManager.register('flee', (v, ctx, key) => (ctx[key] ? v.flee(ctx[key]) : null));
BehaviorManager.register('pursue', (v, ctx, key) => (ctx[key] ? v.pursue(ctx[key]) : null));
BehaviorManager.register('evade', (v, ctx, key) => (ctx[key] ? v.evade(ctx[key]) : null));
BehaviorManager.register('wander', v => v.wander());
BehaviorManager.register('separate', (v, ctx, key = 'neighbors') => v.separate(ctx[key] || []));
BehaviorManager.register('align', (v, ctx, key = 'neighbors') => v.align(ctx[key] || []));
BehaviorManager.register('cohesion', (v, ctx, key = 'neighbors') => v.cohesion(ctx[key] || []));
BehaviorManager.register('avoid', (v, ctx, key = 'obstacles') => v.avoid(ctx[key] || []));
BehaviorManager.register('boundaries', (v, ctx, key = 'rect') => (ctx[key] ? v.boundaries(ctx[key]) : null));
BehaviorManager.register('followPath', (v, ctx, key = 'path', predictFrames = 20, aheadDistance = 30, insideGain = 0.5) =>
  (ctx[key] ? v.followPath(ctx[key], predictFrames, aheadDistance, insideGain) : null));
