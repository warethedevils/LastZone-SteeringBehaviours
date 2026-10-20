// Loup : prédateur de l'île. États (comportements complexes du BehaviorManager) :
//   rode   : errance + séparation et légère cohésion avec la meute ;
//   chasse : poursuite (pursue) du combattant repéré, plus vite que lui — mais le loup se fatigue :
//            l'endurance baisse pendant la chasse puis il doit se reposer (vitesse réduite) ;
//   fuite  : flee quand il est trop blessé.
// Il mord au contact ; le Match applique les dégâts (voir stepFaune).

class Loup extends Animal {
  constructor(x, y) {
    super(x, y, CONFIG.faune.loupHp);
    const c = CONFIG.faune;
    this.r = 11;
    this.state = 'rode';
    this.prey = null;
    this.threat = null;
    this.stamina = 1;
    this.tired = false;
    this.biteTimer = 0;
    this.thinkTimer = random(0.3);
    this.chaseTime = 0;
    this.howled = false;
    this.distanceCercle = 90;
    this.wanderRadius = 35;
    this.displaceRange = 0.3;
    this.maxForce = c.loupForce;
    this.maxSpeed = c.loupWalk;
    const base = [
      { name: 'avoid', type: 'avoid', args: ['obstacles'], weight: 3 },
      { name: 'shore', type: 'stayInside', args: ['island'], weight: 3 },
      { name: 'separation', type: 'separate', args: ['near'], weight: 1.2 }
    ];
    this.behaviors.define('rode', [...base,
      { name: 'wander', type: 'wander', weight: 0.9 },
      { name: 'cohesion', type: 'cohesion', args: ['pack'], weight: 0.35 }]);
    this.behaviors.define('chasse', [...base, { name: 'pursue', type: 'pursue', args: ['prey'], weight: 1.7 }]);
    this.behaviors.define('fuite', [...base, { name: 'flee', type: 'flee', args: ['threatPos'], weight: 2.2 }]);
    this.behaviors.use('rode');
  }

  // Proie : le combattant visible le plus proche dans le rayon de perception
  senseFood(world) {
    const range = CONFIG.faune.loupPerception;
    let best = null;
    let record = range;
    for (const f of world.fighters) {
      if (!f.alive || f.phase !== 'sol' || f.invulnerable > 0) continue;
      const d = p5.Vector.dist(this.pos, f.pos);
      if (d < record && Animal.sees(world, this.pos, f.pos)) { record = d; best = f; }
    }
    return best;
  }

  // Retourne le combattant mordu ce pas (ou null)
  think(world, dt) {
    const c = CONFIG.faune;
    this.tick(dt);
    this.biteTimer = Math.max(0, this.biteTimer - dt);
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.25 + random(0.15);
      this.decide(world);
    }
    // endurance : elle baisse en chasse, remonte au repos
    if (this.state === 'chasse') this.stamina = Math.max(0, this.stamina - dt / c.loupStamina);
    else this.stamina = Math.min(1, this.stamina + dt / c.loupRecovery);
    if (this.stamina <= 0) this.tired = true;
    if (this.tired && this.stamina >= 0.6) this.tired = false;
    this.maxSpeed = this.state === 'chasse' && !this.tired ? c.loupRun
      : (this.state === 'fuite' ? c.loupRun * 0.85 : (this.tired ? c.loupWalk * 0.7 : c.loupWalk));

    const pack = world.loups.filter(l => l !== this && p5.Vector.dist(l.pos, this.pos) < 280);
    const near = pack.filter(l => p5.Vector.dist(l.pos, this.pos) < 50);
    const ctx = {
      obstacles: Animal.obstaclesAround(world, this.pos),
      island: Animal.islandContext(world, this.pos),
      pack, near,
      prey: this.prey && this.prey.alive ? this.prey : null,
      threatPos: this.threat ? this.threat.pos : null
    };
    this.behaviors.use(this.state);
    this.behaviors.apply(ctx);
    this.faceVelocity();

    // morsure au contact
    const prey = ctx.prey;
    if (prey && this.biteTimer <= 0 && this.state === 'chasse' && p5.Vector.dist(this.pos, prey.pos) <= this.r + prey.r + 7) {
      this.biteTimer = c.loupBiteDelay;
      return prey;
    }
    return null;
  }

  decide(world) {
    const c = CONFIG.faune;
    if (this.hp < this.maxHp * 0.3 && this.threat) { this.state = 'fuite'; return; }
    if (this.state === 'fuite') {
      if (!this.threat || p5.Vector.dist(this.pos, this.threat.pos) > 520) { this.state = 'rode'; this.threat = null; }
      return;
    }
    if (this.prey && (!this.prey.alive || this.prey.phase !== 'sol' || p5.Vector.dist(this.pos, this.prey.pos) > c.loupPerception * 1.4)) this.prey = null;
    if (!this.prey) this.prey = this.senseFood(world);
    if (this.prey && !this.tired) {
      if (this.state !== 'chasse') this.howled = false;
      this.state = 'chasse';
    } else {
      this.state = 'rode';
    }
  }

  // Un tir le met en fuite s'il est affaibli, sinon il se retourne contre le tireur
  wound(damage, owner) {
    const dead = this.hit(damage);
    if (owner && owner.pos) {
      this.threat = owner;
      if (!this.prey) this.prey = owner;
    }
    return dead;
  }

  show() {
    const flash = this.flash > 0;
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    fill(0, 0, 0, 55);
    ellipse(3, 6, 36, 16);
    rotate(this.angle);
    const run = this.state === 'chasse' && !this.tired;
    const stride = Math.sin(this.age * (run ? 18 : 9)) * (run ? 4 : 2);
    fill(flash ? 255 : 110, flash ? 255 : 112, flash ? 255 : 122);
    ellipse(-2, 0, 30, 14);
    fill(flash ? 255 : 90, flash ? 255 : 92, flash ? 255 : 102);
    triangle(-14, -3, -14, 3, -26 - stride * 0.5, stride * 0.4);               // queue
    fill(flash ? 255 : 128, flash ? 255 : 130, flash ? 255 : 140);
    ellipse(14, 0, 14, 11);                                                    // tête
    fill(flash ? 255 : 110, flash ? 255 : 112, flash ? 255 : 122);
    triangle(12, -4, 16, -4, 14, -10);
    triangle(12, 4, 16, 4, 14, 10);
    fill(this.state === 'chasse' ? color(255, 80, 60) : color(250, 220, 90));
    circle(17, -2.5, 2.4);
    circle(17, 2.5, 2.4);
    stroke(70, 72, 80);
    strokeWeight(3);
    line(6, -5, 6 + stride, -9);
    line(6, 5, 6 - stride, 9);
    line(-9, -5, -9 - stride, -9);
    line(-9, 5, -9 + stride, 9);
    pop();
    if (this.hp < this.maxHp) this.healthBar();
  }

  healthBar() {
    push();
    noStroke();
    fill(0, 0, 0, 140);
    rect(this.pos.x - 16, this.pos.y - 24, 32, 5, 2);
    fill(255, 120, 90);
    rect(this.pos.x - 16, this.pos.y - 24, 32 * Math.max(0, this.hp / this.maxHp), 5, 2);
    pop();
  }
}
