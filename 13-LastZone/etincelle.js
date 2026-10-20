// Étincelle : particule d'effet (impacts, éliminations, poussière d'atterrissage).
// Entité visible donc Vehicle ; le frottement passe par une force de pilotage.
// comportement personnalisé : frottement (force opposée à la vitesse)
BehaviorManager.register('frottement', v => v.vel.copy().mult(-0.07));

class Etincelle extends Vehicle {
  constructor(x, y, color, speed = 3, life = 0.6, size = 5) {
    super(x, y);
    this.r = 2;
    this.maxSpeed = speed;
    this.maxForce = 1;
    this.vel = p5.Vector.random2D().mult(random(0.3, 1) * speed);
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.pathSpacingInFrames = 1000000;
    this.behaviors.add('frottement', 'frottement', 1);   // force opposée à la vitesse
  }

  step(dt) {
    this.behaviors.apply({});
    this.update();
    this.life -= dt;
  }

  get dead() { return this.life <= 0; }

  show() {
    const t = Math.max(0, this.life / this.maxLife);
    const [r, g, b] = this.color;
    push();
    noStroke();
    fill(r, g, b, 230 * t);
    circle(this.pos.x, this.pos.y, this.size * (0.4 + t));
    pop();
  }
}
