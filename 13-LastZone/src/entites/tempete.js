// Tempête : la zone sûre. Un cercle qui se resserre en plusieurs phases
// (attente puis réduction). Son centre est un Vehicle : il glisse vers le centre
// de la zone suivante par `arrive` (steering), pendant que le rayon diminue
// linéairement. Pendant l'attente, la prochaine zone est annoncée sur la carte.
// Hors du cercle, les combattants subissent `dps` dégâts par seconde.

class Tempete extends Vehicle {
  // islandCenter : centre de l'île ; limits : { cx, cy, radius } de l'île
  constructor(island) {
    super(island.cx, island.cy);
    const c = CONFIG.tempete;
    this.island = island;
    this.phases = c.phases;
    this.speed = c.speedFactor;
    this.phaseIndex = 0;
    this.state = 'attente';          // attente | reduction | fini
    this.timer = 0;
    this.r = c.startRadius;
    this.fromRadius = this.r;
    this.nextCenter = this.pos.copy();
    this.nextRadius = this.r;
    this.maxForce = 0.02;
    this.maxSpeed = 0.5;
    this.vel.set(0, 0);
    this.pathSpacingInFrames = 1000000;
    this.behaviors.add('centre', 'arrive', 1, { args: ['prochainCentre'] });   // le centre glisse vers la zone suivante
    this.pickNextZone();
  }

  get phase() { return this.phases[Math.min(this.phaseIndex, this.phases.length - 1)]; }

  // Choisit la zone suivante : toujours entièrement contenue dans la zone actuelle
  pickNextZone() {
    const phase = this.phase;
    this.nextRadius = phase.radius;
    const slack = Math.max(0, this.r - phase.radius);
    const offset = p5.Vector.random2D().mult(random(0, slack * 0.85));
    this.nextCenter = p5.Vector.add(this.pos, offset);
    // on reste sur l'île autant que possible
    const toIsland = p5.Vector.sub(this.nextCenter, createVector(this.island.cx, this.island.cy));
    const limit = Math.max(0, this.island.radius - phase.radius * 0.6);
    if (toIsland.mag() > limit) {
      toIsland.setMag(limit);
      this.nextCenter = p5.Vector.add(createVector(this.island.cx, this.island.cy), toIsland);
    }
  }

  get duration() {
    const phase = this.phase;
    return (this.state === 'attente' ? phase.wait : phase.shrink) / this.speed;
  }

  // Secondes restantes avant la fin de l'étape en cours
  get timeLeft() { return Math.max(0, this.duration - this.timer); }

  get dps() { return this.phase.dps; }

  get finished() { return this.state === 'fini'; }

  // Un point est-il dans la zone sûre ? (seuil inclusif)
  inside(point) {
    return p5.Vector.dist(point, this.pos) <= this.r;
  }

  // Distance au bord de la zone : positive dehors, négative dedans
  overshoot(point) {
    return p5.Vector.dist(point, this.pos) - this.r;
  }

  think(dt) {
    if (this.state === 'fini') return;
    this.timer += dt;
    if (this.state === 'attente') {
      this.vel.mult(0.9);
      if (this.timer >= this.duration) {
        this.state = 'reduction';
        this.timer = 0;
        this.fromRadius = this.r;
        // vitesse du centre : rejoindre la zone suivante avant la fin de la réduction
        const distance = p5.Vector.dist(this.pos, this.nextCenter);
        this.maxSpeed = Math.max(0.2, (distance / (this.duration * 60)) * 1.8);
        this.maxForce = this.maxSpeed * 0.1;
      }
      return;
    }
    // réduction : rayon linéaire, centre par arrive
    const t = Math.min(1, this.timer / this.duration);
    this.r = this.fromRadius + (this.nextRadius - this.fromRadius) * t;
    this.behaviors.apply({ prochainCentre: this.nextCenter });
    if (t >= 1) {
      this.r = this.nextRadius;
      this.phaseIndex++;
      this.timer = 0;
      this.vel.set(0, 0);
      if (this.phaseIndex >= this.phases.length) {
        this.state = 'fini';
        this.phaseIndex = this.phases.length - 1;
      } else {
        this.state = 'attente';
        this.pickNextZone();
      }
    }
  }

  // Dessin monde : voile violet hors de la zone, murs de la tempête
  show(view) {
    push();
    // voile : grand anneau violet autour de la zone, calculé par un contour évidé
    noStroke();
    fill(120, 40, 200, 70);
    beginShape();
    const big = 6000;
    vertex(this.pos.x - big, this.pos.y - big);
    vertex(this.pos.x + big, this.pos.y - big);
    vertex(this.pos.x + big, this.pos.y + big);
    vertex(this.pos.x - big, this.pos.y + big);
    beginContour();
    const n = 90;
    for (let i = 0; i < n; i++) {
      const a = -(i / n) * TWO_PI;
      vertex(this.pos.x + Math.cos(a) * this.r, this.pos.y + Math.sin(a) * this.r);
    }
    endContour();
    endShape(CLOSE);
    noFill();
    for (let i = 0; i < 3; i++) {
      stroke(190, 120, 255, 200 - i * 60);
      strokeWeight(6 - i * 2);
      circle(this.pos.x, this.pos.y, (this.r + i * 5) * 2);
    }
    // prochaine zone annoncée pendant l'attente
    if (this.state === 'attente' && this.nextRadius < this.r) {
      stroke(255, 255, 255, 190);
      strokeWeight(3);
      drawingContext.setLineDash([16, 12]);
      circle(this.nextCenter.x, this.nextCenter.y, this.nextRadius * 2);
      drawingContext.setLineDash([]);
    }
    pop();
  }
}
