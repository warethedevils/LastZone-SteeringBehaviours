// Coffre : s'ouvre avec E et libère du butin (le tirage est fait par le Match).
class Coffre extends Vehicle {
  constructor(x, y, legendary = false) {
    super(x, y);
    this.r = 20;
    this.maxSpeed = 0;
    this.maxForce = 0;
    this.vel.set(0, 0);
    this.opened = false;
    this.legendary = legendary;       // coffre de largage
    this.age = 0;
  }

  show() {
    this.age += 1 / 60;
    const [r, g, b] = this.legendary ? [255, 215, 90] : [245, 185, 50];
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    fill(0, 0, 0, 55);
    ellipse(3, 8, 44, 18);
    if (!this.opened) {
      blendMode(ADD);
      const pulse = 0.6 + 0.4 * Math.sin(this.age * 4);
      fill(r, g, b, 30 + 25 * pulse);
      circle(0, 0, this.legendary ? 120 : 84);
      blendMode(BLEND);
    }
    const open = this.opened;
    fill(open ? 70 : r * 0.55, open ? 55 : g * 0.55, open ? 35 : b * 0.55);
    stroke(open ? color(90, 70, 45) : color(r, g, b));
    strokeWeight(2.5);
    rect(-19, -13, 38, 26, 5);
    fill(open ? 60 : r, open ? 45 : g, open ? 30 : b);
    noStroke();
    rect(-19, -13, 38, open ? 6 : 12, 5);
    if (!open) {
      fill(255, 245, 200);
      rect(-4, -4, 8, 9, 2);
    }
    pop();
  }
}
