// Mur : fortification construite par un combattant (Q). Arrête les balles, se
// détruit sous les tirs. Collision : trois disques alignés sur la largeur.
class Mur extends Vehicle {
  constructor(x, y, angle, owner, hp) {
    super(x, y);
    this.angle = angle;               // direction de la largeur du mur
    this.owner = owner;
    this.maxHp = hp;
    this.hp = hp;
    this.length = 78;
    this.r = this.length / 2;
    this.maxSpeed = 0;
    this.maxForce = 0;
    this.vel.set(0, 0);
    this.flash = 0;
    this.age = 0;
    this.colliders = [-1, 0, 1].map(i => ({
      pos: createVector(x + Math.cos(angle) * i * 26, y + Math.sin(angle) * i * 26),
      r: 15, parent: this, kind: 'mur'
    }));
  }

  // Dégâts reçus ; retourne true si le mur est détruit
  hit(damage) {
    this.hp -= damage;
    this.flash = 0.12;
    return this.hp <= 0;
  }

  get dead() { return this.hp <= 0; }

  show() {
    this.age += 1 / 60;
    const rise = Math.min(1, this.age / 0.25);              // animation de montée
    const flash = this.flash > 0;
    this.flash = Math.max(0, this.flash - 1 / 60);
    const health = this.hp / this.maxHp;
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.angle);
    noStroke();
    fill(0, 0, 0, 60);
    rect(-this.length / 2 + 4, -9 + 5, this.length, 20, 3);
    fill(flash ? 255 : 150 + 40 * health, flash ? 255 : 105 + 30 * health, flash ? 255 : 60);
    stroke(70, 45, 25);
    strokeWeight(2);
    rect(-this.length / 2, -9 * rise, this.length, 18 * rise, 3);
    stroke(90, 60, 32);
    strokeWeight(1.5);
    for (let i = -1; i <= 1; i++) line(i * 26, -8 * rise, i * 26, 8 * rise);
    pop();
  }
}
