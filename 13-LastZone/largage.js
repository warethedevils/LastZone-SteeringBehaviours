// Largage : caisse sous parachute qui descend vers un point de la zone (wander
// léger = le vent). À l'atterrissage, le Match la remplace par un coffre
// légendaire. Les bots cupides s'y précipitent.
class Largage extends Vehicle {
  constructor(x, y, fallTime = 14) {
    super(x, y);
    this.r = 24;
    this.fall = fallTime;
    this.fallTotal = fallTime;
    this.maxSpeed = 0.9;
    this.maxForce = 0.03;
    this.distanceCercle = 40;
    this.wanderRadius = 16;
    this.displaceRange = 0.25;
    this.vel = p5.Vector.random2D().mult(0.4);
    this.landed = false;
    this.age = 0;
    this.behaviors.add('vent', 'wander', 1);       // le vent : errance légère
  }

  think(dt) {
    this.fall -= dt;
    this.age += dt;
    if (this.fall <= 0) { this.landed = true; return; }
    this.behaviors.apply({});
  }

  // 1 au départ du largage, 0 à l'atterrissage
  get altitude() { return Math.max(0, this.fall / this.fallTotal); }

  show() {
    const h = this.altitude;
    push();
    translate(this.pos.x, this.pos.y);
    blendMode(ADD);
    fill(255, 190, 60, 40 + 20 * Math.sin(this.age * 5));
    circle(0, 0, 90 + 40 * (1 - h));
    blendMode(BLEND);
    noStroke();
    fill(0, 0, 0, 55);
    ellipse(0, 8, 44 * (1 - 0.4 * h), 18);
    const lift = -90 * h;
    if (h > 0.02) {
      fill(255, 120, 70, 230);
      ellipse(0, lift - 46, 90, 54);
      stroke(255, 255, 255, 190);
      strokeWeight(1.5);
      line(-34, lift - 36, -14, lift - 4);
      line(34, lift - 36, 14, lift - 4);
    }
    noStroke();
    fill(255, 195, 60);
    stroke(120, 80, 20);
    strokeWeight(2.5);
    rect(-17, lift - 14, 34, 28, 4);
    pop();
  }
}
