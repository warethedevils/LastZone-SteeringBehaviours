// Arbre : obstacle qui arrête les balles et qu'on peut abattre à la pioche
// (récolte de bois). Vehicle immobile comme toute entité visible.
class Arbre extends Vehicle {
  constructor(x, y, size = 1) {
    super(x, y);
    this.r = 18 * size;                 // rayon de collision (le feuillage est plus large)
    this.canopy = 34 * size;
    this.maxHp = 80;
    this.hp = this.maxHp;
    this.maxSpeed = 0;
    this.maxForce = 0;
    this.vel.set(0, 0);
    this.shade = random(0.85, 1.1);
    this.sway = random(TWO_PI);
    this.colliders = [{ pos: this.pos, r: this.r, parent: this, kind: 'arbre' }];
    this.hitFlash = 0;
  }

  // Un coup de pioche : retourne la quantité de bois récoltée
  harvest(damage) {
    this.hp -= damage;
    this.hitFlash = 0.15;
    return 15 + (this.hp <= 0 ? 20 : 0);
  }

  get dead() { return this.hp <= 0; }

  show() {
    const sway = Math.sin(frameCount * 0.02 + this.sway) * 1.5;
    const flash = this.hitFlash > 0;
    this.hitFlash = Math.max(0, this.hitFlash - 1 / 60);
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    fill(0, 0, 0, 55);
    ellipse(7, 9, this.canopy * 1.9, this.canopy * 1.5);
    fill(32 * this.shade, 94 * this.shade, 44 * this.shade);
    circle(sway, sway, this.canopy * 2);
    fill(46 * this.shade, 124 * this.shade, 58 * this.shade);
    circle(sway - 3, sway - 4, this.canopy * 1.45);
    fill(70 * this.shade, 156 * this.shade, 78 * this.shade, 230);
    circle(sway - 6, sway - 8, this.canopy * 0.8);
    if (flash) { fill(255, 255, 255, 70); circle(0, 0, this.canopy * 2); }
    pop();
  }
}
