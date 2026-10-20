// Véhicule conduisible : quad (1 place, rapide) et jeep (3 places, solide). C'est un
// Vehicle comme les autres : la conduite est un comportement de steering —
// le conducteur fournit une direction, la vitesse désirée est maxSpeed dans cette
// direction, la force est limitée à maxForce (d'où l'inertie et les dérapages).
//   - humain : comportement « conduite » (direction du clavier) ou freinage sans commande ;
//   - bot : comportement complexe « ia » = évitement d'obstacles + seek vers la destination.
// Les collisions, les écrasements et l'explosion sont des règles de scène (Match).

const VEHICULES = {
  quad: { nom: 'Quad', seats: 1, maxSpeed: 5.8, maxForce: 0.17, hp: 140, r: 20, w: 34, l: 54, color: [255, 120, 60] },
  jeep: { nom: 'Jeep', seats: 3, maxSpeed: 4.7, maxForce: 0.12, hp: 280, r: 28, w: 48, l: 78, color: [96, 150, 96] }
};

// Comportements personnalisés enregistrés dans le BehaviorManager
BehaviorManager.register('conduite', (v, ctx) => v.driveForce(ctx.move));
BehaviorManager.register('freinage', v => v.brakeForce());

class Vehicule extends Vehicle {
  constructor(x, y, type = 'quad') {
    super(x, y);
    const def = VEHICULES[type];
    this.type = type;
    this.def = def;
    this.nom = def.nom;
    this.r = def.r;
    this.maxSpeed = def.maxSpeed;
    this.maxForce = def.maxForce;
    this.maxHp = def.hp;
    this.hp = def.hp;
    this.vel.set(0, 0);
    this.occupants = new Array(def.seats).fill(null);   // occupants[0] = conducteur
    this.angle = random(TWO_PI);                          // orientation affichée
    this.age = 0;
    this.flash = 0;
    this.ramTimers = new Map();                           // combattant -> délai avant un nouvel impact
    this.pathSpacingInFrames = 1000000;
    // comportements complexes : conduite humaine, conduite par un bot
    this.behaviors.define('humain', [{ name: 'conduite', type: 'conduite', weight: 1 }]);
    this.behaviors.define('ia', [
      { name: 'avoid', type: 'avoid', args: ['obstacles'], weight: 3 },
      { name: 'destination', type: 'seek', args: ['destination'], weight: 1 }
    ]);
    this.behaviors.use('humain');
  }

  get driver() { return this.occupants[0]; }
  get passengers() { return this.occupants.slice(1).filter(Boolean); }
  get riders() { return this.occupants.filter(Boolean); }
  get freeSeat() { return this.occupants.findIndex(o => o === null); }
  get speed() { return this.vel.mag(); }
  get dead() { return this.hp <= 0; }

  // Comportement de conduite : vitesse désirée dans la direction demandée
  driveForce(move) {
    const desired = createVector(move ? move.x : 0, move ? move.y : 0);
    if (desired.magSq() === 0) return this.brakeForce();
    desired.setMag(this.maxSpeed);
    return this.steerToward(desired);
  }

  // Sans commande, on ralentit (force plus faible que l'accélération)
  brakeForce() {
    return this.steerToward(createVector(0, 0)).mult(0.6);
  }

  // ctx humain : { move } ; ctx bot : { ai: true, destination, obstacles }
  think(dt, ctx = {}) {
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);
    for (const [f, t] of this.ramTimers) {
      if (t - dt <= 0) this.ramTimers.delete(f); else this.ramTimers.set(f, t - dt);
    }
    if (!this.driver) {
      this.behaviors.use('humain');
      this.behaviors.apply({ move: null });
    } else if (ctx.ai) {
      this.behaviors.use('ia');
      this.behaviors.apply(ctx);
    } else {
      this.behaviors.use('humain');
      this.behaviors.apply(ctx);
    }
    if (this.vel.mag() > 0.4) this.angle = Math.atan2(this.vel.y, this.vel.x);
  }

  hit(damage) {
    this.hp -= damage;
    this.flash = 0.12;
    return this.hp <= 0;
  }

  // Monte dans le premier siège libre ; retourne le numéro du siège ou -1
  board(f) {
    const seat = this.freeSeat;
    if (seat < 0 || this.dead) return -1;
    this.occupants[seat] = f;
    f.vehicle = this;
    f.seat = seat;
    f.phase = 'vehicule';
    f.cancelUse();
    f.cancelReload();
    f.vel.set(this.vel.x, this.vel.y);
    return seat;
  }

  // Descend (sur le côté du véhicule)
  leave(f) {
    const i = this.occupants.indexOf(f);
    if (i >= 0) this.occupants[i] = null;
    f.vehicle = null;
    f.seat = -1;
    f.phase = 'sol';
    const side = createVector(-Math.sin(this.angle), Math.cos(this.angle));
    const sign = i % 2 === 0 ? 1 : -1;
    f.pos = createVector(this.pos.x + side.x * (this.r + f.r + 8) * sign, this.pos.y + side.y * (this.r + f.r + 8) * sign);
    f.vel.set(0, 0);
  }

  show() {
    const def = this.def;
    const [r, g, b] = def.color;
    const flash = this.flash > 0;
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    fill(0, 0, 0, 70);
    ellipse(6, 9, def.l * 1.1, def.w * 1.2);
    rotate(this.angle);
    // roues
    fill(25, 25, 30);
    const wx = def.l * 0.32, wy = def.w * 0.56;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) rect(sx * wx - 7, sy * wy - 4, 14, 8, 3);
    // carrosserie
    stroke(r * 0.4, g * 0.4, b * 0.4);
    strokeWeight(2.5);
    fill(flash ? 255 : r, flash ? 255 : g, flash ? 255 : b);
    rect(-def.l / 2, -def.w / 2, def.l, def.w, this.type === 'quad' ? 9 : 7);
    noStroke();
    fill(255, 255, 255, 50);
    rect(-def.l / 2 + 4, -def.w / 2 + 3, def.l - 8, def.w * 0.35, 5);
    if (this.type === 'jeep') {
      fill(30, 50, 70, 220);                    // pare-brise
      rect(def.l * 0.12, -def.w / 2 + 5, def.l * 0.2, def.w - 10, 3);
      stroke(20, 30, 20);
      strokeWeight(3);
      line(-def.l * 0.3, -def.w / 2 + 3, -def.l * 0.3, def.w / 2 - 3);   // arceau
    } else {
      fill(30, 30, 38);                         // guidon et selle
      rect(def.l * 0.12, -def.w / 2 + 3, 5, def.w - 6, 2);
      rect(-def.l * 0.3, -def.w * 0.22, def.l * 0.3, def.w * 0.44, 4);
    }
    noStroke();
    fill(255, 255, 210, 200);                   // phares
    circle(def.l / 2 - 3, -def.w * 0.28, 5);
    circle(def.l / 2 - 3, def.w * 0.28, 5);
    pop();
    // occupants
    this.occupants.forEach((o, i) => {
      if (!o) return;
      push();
      translate(this.pos.x, this.pos.y);
      rotate(this.angle);
      const off = this.type === 'quad' ? 0 : (i === 0 ? -def.w * 0.18 : (i === 1 ? def.w * 0.2 : 0));
      const ox = this.type === 'quad' ? -2 : (i === 2 ? -def.l * 0.28 : def.l * 0.05);
      stroke(o.skin.body[0] * 0.4, o.skin.body[1] * 0.4, o.skin.body[2] * 0.4);
      strokeWeight(2);
      fill(...o.skin.body);
      circle(ox, off, 15);
      pop();
    });
    // barre de vie quand abîmé
    if (this.hp < this.maxHp) {
      push();
      noStroke();
      fill(0, 0, 0, 150);
      rect(this.pos.x - 24, this.pos.y - this.r - 18, 48, 6, 3);
      fill(this.hp > this.maxHp * 0.3 ? color(120, 230, 120) : color(255, 90, 90));
      rect(this.pos.x - 24, this.pos.y - this.r - 18, 48 * Math.max(0, this.hp / this.maxHp), 6, 3);
      pop();
    }
  }
}
