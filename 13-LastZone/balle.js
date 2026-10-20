// Balle : projectile à vitesse constante, balayé à chaque pas pour que les tirs
// rapides (sniper) ne traversent ni cible ni obstacle. Elle vit jusqu'à
// avoir parcouru la portée de l'arme.
class Balle extends Vehicle {
  // extra : { blast: { radius, wall }, pierce, grenade } pour roquettes, carreaux perforants, grenades
  constructor(x, y, angle, speed, damage, range, owner, tint, extra = {}) {
    super(x, y);
    this.r = CONFIG.balle.r;
    this.maxSpeed = speed;
    this.maxForce = 0;
    this.vel = createVector(Math.cos(angle), Math.sin(angle)).mult(speed);
    this.damage = damage;
    this.range = range;
    this.travelled = 0;
    this.owner = owner;
    this.tint = tint || [255, 235, 160];
    this.prev = this.pos.copy();
    this.spent = false;
    this.blast = extra.blast || null;       // explosion à l'impact ou en fin de course
    this.pierce = extra.pierce || 0;         // combattants traversés en plus du premier
    this.grenade = !!extra.grenade;          // une grenade ne touche personne : elle explose en fin de course
    this.touched = new Set();
    this.exploded = false;
    this.pathSpacingInFrames = 1000000;
  }

  step() {
    this.prev = this.pos.copy();
    this.update();
    this.travelled += this.vel.mag();
  }

  get dead() { return this.spent || this.travelled >= this.range; }

  // Fraction t ∈ [0,1] du segment parcouru ce pas où la balle touche le disque, ou null
  hitFraction(center, radius) {
    const dx = this.pos.x - this.prev.x;
    const dy = this.pos.y - this.prev.y;
    return Grille.segmentCircle(this.prev, dx, dy, Math.hypot(dx, dy), center, radius + this.r);
  }

  show() {
    if (this.grenade) {
      push();
      noStroke();
      fill(0, 0, 0, 80);
      ellipse(this.pos.x + 3, this.pos.y + 5, 12, 6);
      fill(50, 70, 40);
      stroke(140, 210, 90);
      strokeWeight(2);
      circle(this.pos.x, this.pos.y, 11);
      pop();
      return;
    }
    const [r, g, b] = this.tint;
    const tail = p5.Vector.sub(this.pos, p5.Vector.mult(this.vel, 2.2));
    push();
    stroke(r, g, b, 90);
    strokeWeight(6);
    line(this.pos.x, this.pos.y, tail.x, tail.y);
    stroke(255, 255, 255, 235);
    strokeWeight(2.5);
    line(this.pos.x, this.pos.y, tail.x, tail.y);
    pop();
  }
}
