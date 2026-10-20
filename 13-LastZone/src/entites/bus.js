// Bus de combat : traverse l'île en suivant un chemin rectiligne (path following).
// Les combattants y sont embarqués au départ et sautent quand ils le décident.
class Bus extends Vehicle {
  // chemin : Chemin.line(entrée, sortie)
  constructor(chemin) {
    const start = chemin.points[0];
    super(start.x, start.y);
    this.chemin = chemin;
    this.r = 40;
    this.maxSpeed = CONFIG.match.busSpeed;
    this.maxForce = 0.2;
    const projection = chemin.project(this.pos);
    this.vel = p5.Vector.sub(chemin.pointAhead(projection, 60), this.pos).setMag(this.maxSpeed);
    this.riders = [];
    this.gone = false;
    this.age = 0;
    this.pathSpacingInFrames = 1000000;
    // comportement de base : suivi de chemin (anticipation 20 images, point visé 80 px devant)
    this.behaviors.add('chemin', 'followPath', 1, { args: ['chemin', 20, 80, 1] });
  }

  think(dt) {
    this.age += dt;
    this.behaviors.apply({ chemin: this.chemin });
    // arrivé au bout du trajet : le bus quitte la carte
    if (this.progress >= 0.985) this.gone = true;
  }

  // Fraction du trajet parcourue (0 -> 1)
  get progress() {
    const a = this.chemin.points[0];
    const b = this.chemin.points[1];
    const ab = p5.Vector.sub(b, a);
    return Math.min(1, Math.max(0, p5.Vector.sub(this.pos, a).dot(ab) / ab.magSq()));
  }

  show() {
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    fill(0, 0, 0, 50);
    ellipse(24, 40, 150, 70);
    rotate(this.vel.heading());
    // ballon
    fill(70, 140, 255);
    stroke(20, 50, 130);
    strokeWeight(3);
    ellipse(-10, 0, 120, 74);
    noStroke();
    fill(255, 255, 255, 60);
    ellipse(-20, -12, 70, 24);
    // bus
    fill(255, 210, 60);
    stroke(120, 80, 10);
    strokeWeight(3);
    rect(-44, -16, 88, 32, 10);
    fill(40, 60, 100);
    noStroke();
    for (let i = -3; i <= 3; i++) rect(i * 11 - 4, -9, 9, 8, 2);
    fill(255, 255, 255, 220);
    rect(36, -10, 5, 20, 2);
    pop();
  }
}
