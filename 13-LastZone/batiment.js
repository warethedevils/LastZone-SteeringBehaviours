// Bâtiment : maison pleine (toit coloré) qui sert de couvert. Sa collision est
// une chaîne de disques le long de son grand côté. Indestructible.
class Batiment extends Vehicle {
  constructor(x, y, w, h, roof) {
    super(x, y);
    this.w = w;
    this.h = h;
    this.roof = roof;               // [r, g, b]
    this.maxSpeed = 0;
    this.maxForce = 0;
    this.vel.set(0, 0);
    const horizontal = w >= h;
    const short = Math.min(w, h);
    const long = Math.max(w, h);
    const radius = short / 2;
    const count = Math.max(1, Math.ceil((long - short) / (radius * 1.2)) + 1);
    this.r = Math.hypot(w, h) / 2;  // rayon englobant
    this.colliders = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1) - 0.5) * (long - short);
      const px = x + (horizontal ? t : 0);
      const py = y + (horizontal ? 0 : t);
      this.colliders.push({ pos: createVector(px, py), r: radius * 0.95, parent: this, kind: 'batiment' });
    }
  }

  // Un point (x, y) est-il sur l'emprise du bâtiment (marge incluse) ?
  covers(x, y, margin = 0) {
    return Math.abs(x - this.pos.x) <= this.w / 2 + margin && Math.abs(y - this.pos.y) <= this.h / 2 + margin;
  }

  show() {
    const [r, g, b] = this.roof;
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    fill(0, 0, 0, 60);
    rect(-this.w / 2 + 8, -this.h / 2 + 10, this.w, this.h, 6);
    fill(r * 0.55, g * 0.55, b * 0.55);
    rect(-this.w / 2, -this.h / 2, this.w, this.h, 6);
    fill(r, g, b);
    rect(-this.w / 2 + 5, -this.h / 2 + 5, this.w - 10, this.h - 10, 4);
    fill(255, 255, 255, 38);
    rect(-this.w / 2 + 5, -this.h / 2 + 5, this.w - 10, (this.h - 10) / 2, 4);
    stroke(r * 0.6, g * 0.6, b * 0.6);
    strokeWeight(2);
    if (this.w >= this.h) line(-this.w / 2 + 5, 0, this.w / 2 - 5, 0);
    else line(0, -this.h / 2 + 5, 0, this.h / 2 - 5);
    noStroke();
    fill(r * 0.45, g * 0.45, b * 0.45);
    rect(this.w * 0.2, -this.h * 0.28, 14, 14, 2);
    pop();
  }
}
