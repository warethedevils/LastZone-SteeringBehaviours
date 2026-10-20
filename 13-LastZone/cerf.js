// Cerf : proie. Il vit en harde (cohésion + alignement + séparation, les trois règles des boids)
// et fuit (evade, avec anticipation de la trajectoire) les combattants et les loups qui s'approchent.
// Inoffensif ; un cerf abattu laisse un soin.

class Cerf extends Animal {
  constructor(x, y) {
    super(x, y, CONFIG.faune.cerfHp);
    const c = CONFIG.faune;
    this.r = 12;
    this.state = 'paitre';
    this.threat = null;
    this.thinkTimer = random(0.3);
    this.distanceCercle = 70;
    this.wanderRadius = 30;
    this.displaceRange = 0.25;
    this.maxForce = c.cerfForce;
    this.maxSpeed = c.cerfWalk;
    const base = [
      { name: 'avoid', type: 'avoid', args: ['obstacles'], weight: 3 },
      { name: 'shore', type: 'stayInside', args: ['island'], weight: 3 },
      { name: 'separation', type: 'separate', args: ['near'], weight: 1.5 }
    ];
    this.behaviors.define('paitre', [...base,
      { name: 'wander', type: 'wander', weight: 0.7 },
      { name: 'cohesion', type: 'cohesion', args: ['herd'], weight: 0.9 },
      { name: 'alignment', type: 'align', args: ['herd'], weight: 0.5 }]);
    this.behaviors.define('fuite', [...base,
      { name: 'evade', type: 'evade', args: ['threat'], weight: 2.6 },
      { name: 'cohesion', type: 'cohesion', args: ['herd'], weight: 0.4 }]);
    this.behaviors.use('paitre');
  }

  // Menace : le combattant ou le loup le plus proche dans le rayon d'alerte
  senseDanger(world) {
    const range = CONFIG.faune.cerfAlert;
    let best = null;
    let record = range;
    const consider = o => {
      const d = p5.Vector.dist(this.pos, o.pos);
      if (d < record) { record = d; best = o; }
    };
    for (const f of world.fighters) if (f.alive && (f.phase === 'sol' || f.phase === 'vehicule')) consider(f);
    for (const l of world.loups) consider(l);
    return best;
  }

  think(world, dt) {
    const c = CONFIG.faune;
    this.tick(dt);
    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = 0.2 + random(0.1);
      this.threat = this.senseDanger(world);
      this.state = this.threat ? 'fuite' : 'paitre';
    }
    this.maxSpeed = this.state === 'fuite' ? c.cerfRun : c.cerfWalk;
    const herd = world.cerfs.filter(o => o !== this && p5.Vector.dist(o.pos, this.pos) < 340);
    const near = herd.filter(o => p5.Vector.dist(o.pos, this.pos) < 55);
    this.behaviors.use(this.state);
    this.behaviors.apply({
      obstacles: Animal.obstaclesAround(world, this.pos),
      island: Animal.islandContext(world, this.pos),
      herd, near,
      threat: this.threat
    });
    this.faceVelocity();
  }

  show() {
    const flash = this.flash > 0;
    const run = this.state === 'fuite';
    const stride = Math.sin(this.age * (run ? 16 : 6)) * (run ? 4 : 1.5);
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    fill(0, 0, 0, 55);
    ellipse(3, 6, 40, 18);
    rotate(this.angle);
    stroke(110, 76, 44);
    strokeWeight(3);
    line(7, -6, 7 + stride, -10);
    line(7, 6, 7 - stride, 10);
    line(-9, -6, -9 - stride, -10);
    line(-9, 6, -9 + stride, 10);
    noStroke();
    fill(flash ? 255 : 160, flash ? 255 : 112, flash ? 255 : 66);
    ellipse(-1, 0, 32, 16);
    fill(flash ? 255 : 235, flash ? 255 : 225, flash ? 255 : 200);
    ellipse(-14, 0, 6, 6);                                      // queue claire
    fill(flash ? 255 : 150, flash ? 255 : 104, flash ? 255 : 60);
    ellipse(16, 0, 14, 10);                                     // tête
    stroke(214, 190, 150);
    strokeWeight(2);
    line(16, -3, 20, -11);
    line(20, -11, 24, -9);
    line(16, 3, 20, 11);
    line(20, 11, 24, 9);                                        // bois
    pop();
    if (this.hp < this.maxHp) {
      push();
      noStroke();
      fill(0, 0, 0, 140);
      rect(this.pos.x - 16, this.pos.y - 26, 32, 5, 2);
      fill(120, 230, 120);
      rect(this.pos.x - 16, this.pos.y - 26, 32 * Math.max(0, this.hp / this.maxHp), 5, 2);
      pop();
    }
  }
}
