// Rocher : obstacle massif qui arrête les balles ; la pioche en tire du métal.
class Rocher extends Vehicle {
  constructor(x, y, r) {
    super(x, y);
    this.r = r;
    this.maxHp = 150;
    this.hp = this.maxHp;
    this.maxSpeed = 0;
    this.maxForce = 0;
    this.vel.set(0, 0);
    this.shape = [];
    const sides = 9;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TWO_PI;
      const k = random(0.78, 1.08);
      this.shape.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
    }
    this.colliders = [{ pos: this.pos, r: this.r * 0.92, parent: this, kind: 'rocher' }];
    this.hitFlash = 0;
  }

  harvest(damage) {
    this.hp -= damage;
    this.hitFlash = 0.15;
    return 12 + (this.hp <= 0 ? 25 : 0);
  }

  get dead() { return this.hp <= 0; }

  show() {
    const flash = this.hitFlash > 0;
    this.hitFlash = Math.max(0, this.hitFlash - 1 / 60);
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    fill(0, 0, 0, 55);
    ellipse(6, 8, this.r * 2.1, this.r * 1.7);
    fill(flash ? 200 : 122, flash ? 205 : 128, flash ? 215 : 140);
    stroke(80, 85, 98);
    strokeWeight(2);
    beginShape();
    for (const [x, y] of this.shape) vertex(x, y);
    endShape(CLOSE);
    noStroke();
    fill(160, 166, 178, 200);
    beginShape();
    for (const [x, y] of this.shape) vertex(x * 0.6 - 4, y * 0.6 - 5);
    endShape(CLOSE);
    pop();
  }
}
