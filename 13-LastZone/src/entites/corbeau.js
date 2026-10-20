// Corbeau : il vole en bande (séparation + alignement + cohésion, les trois règles de Reynolds)
// et, quand un combat éclate à proximité, la bande vient tourner au-dessus : les corbeaux
// qui encerclent un combat sont repérés sur la minimap (signal d'alerte pour le joueur).
//   vol    : boids + errance ;
//   alerte : boids + seek d'un point qui orbite autour du combat.
// Ils volent : aucune collision, ils ne sont pas des cibles.

class Corbeau extends Animal {
  constructor(x, y) {
    super(x, y, 1);
    const c = CONFIG.faune;
    this.r = 5;
    this.state = 'vol';
    this.battle = null;               // combat suivi : { pos, t }
    this.thinkTimer = random(0.3);
    this.phaseFlap = random(TWO_PI);
    this.distanceCercle = 60;
    this.wanderRadius = 30;
    this.displaceRange = 0.35;
    this.maxForce = c.corbeauForce;
    this.maxSpeed = c.corbeauSpeed;
    this.vel = p5.Vector.random2D().mult(this.maxSpeed * 0.6);
    const flock = [
      { name: 'separation', type: 'separate', args: ['near'], weight: 1.8 },
      { name: 'alignment', type: 'align', args: ['flock'], weight: 1.1 },
      { name: 'cohesion', type: 'cohesion', args: ['flock'], weight: 1 }
    ];
    this.behaviors.define('vol', [...flock, { name: 'wander', type: 'wander', weight: 0.7 },
      { name: 'shore', type: 'stayInside', args: ['island'], weight: 1.5 }]);
    this.behaviors.define('alerte', [...flock, { name: 'orbit', type: 'seek', args: ['orbitPoint'], weight: 1.3 }]);
    this.behaviors.use('vol');
  }

  get alerted() { return this.state === 'alerte'; }

  // Le dernier combat récent (< 7 s) à moins de 650 px, sinon null
  senseBattle(world) {
    let best = null;
    let record = CONFIG.faune.corbeauRange;
    for (const b of world.combats) {
      if (world.time - b.t > 7) continue;
      const d = p5.Vector.dist(this.pos, b.pos);
      if (d < record) { record = d; best = b; }
    }
    return best;
  }

  think(world, dt) {
    this.tick(dt);
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.3 + random(0.2);
      this.battle = this.senseBattle(world);
      this.state = this.battle ? 'alerte' : 'vol';
    }
    const flock = world.corbeaux.filter(o => o !== this && p5.Vector.dist(o.pos, this.pos) < 200);
    const near = flock.filter(o => p5.Vector.dist(o.pos, this.pos) < 30);
    // point qui tourne autour du combat : la bande l'encercle
    let orbitPoint = null;
    if (this.battle) {
      const a = this.age * 0.9 + this.phaseFlap;
      orbitPoint = createVector(this.battle.pos.x + Math.cos(a) * 130, this.battle.pos.y + Math.sin(a) * 130);
    }
    this.behaviors.use(this.state);
    this.behaviors.apply({ flock, near, island: Animal.islandContext(world, this.pos), orbitPoint });
    this.faceVelocity(0.2);
  }

  show() {
    const flap = Math.sin(this.age * 14 + this.phaseFlap);
    push();
    translate(this.pos.x, this.pos.y - 26);      // en l'air : décalé de son ombre
    noStroke();
    rotate(this.angle);
    fill(18, 18, 26);
    ellipse(0, 0, 11, 5);
    triangle(5, 0, 9, -1, 9, 1);
    fill(32, 32, 44);
    const w = 9 + flap * 4;
    triangle(-1, 0, -4, -w, 3, -1);
    triangle(-1, 0, -4, w, 3, 1);
    pop();
    push();
    noStroke();
    fill(0, 0, 0, 40);
    ellipse(this.pos.x + 2, this.pos.y + 4, 11, 5);
    pop();
  }
}
