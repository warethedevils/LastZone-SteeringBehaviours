// Chemin fermé (5-2-PathFollowing / 5-3-PathFollowingComplex).
// Le Sanctuaire et les Veilleurs le suivent ; il est dessiné comme une rivière
// de lumière. C'est un décor de scène (comme la classe Path du dépôt),
// pas une entité qui bouge.

class Chemin {
  constructor(radius = 38) {
    this.radius = radius;   // demi-largeur du couloir
    this.points = [];
    this.lengths = [];      // longueur de chaque segment i -> i+1
    this.total = 0;
  }

  addPoint(x, y) {
    this.points.push(createVector(x, y));
    this.computeLengths();
  }

  computeLengths() {
    this.lengths = [];
    this.total = 0;
    const n = this.points.length;
    for (let i = 0; i < n; i++) {
      const length = p5.Vector.dist(this.points[i], this.points[(i + 1) % n]);
      this.lengths.push(length);
      this.total += length;
    }
  }

  // Courbe fermée aléatoire dans le rectangle donné (forme de haricot / trèfle).
  static random(bounds, radius, count) {
    const chemin = new Chemin(radius);
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    const rx = bounds.w / 2 - radius - 90;
    const ry = bounds.h / 2 - radius - 70;
    const a = random(0.12, 0.2), b = random(0.06, 0.12);
    const k1 = floor(random(2, 4)), k2 = floor(random(3, 6));
    const p1 = random(TWO_PI), p2 = random(TWO_PI);
    const amplitude = 1 + a + b;
    for (let i = 0; i < count; i++) {
      const theta = (i / count) * TWO_PI;
      const m = (1 + a * Math.sin(k1 * theta + p1) + b * Math.sin(k2 * theta + p2)) / amplitude;
      chemin.points.push(createVector(cx + Math.cos(theta) * rx * m, cy + Math.sin(theta) * ry * m));
    }
    chemin.computeLengths();
    return chemin;
  }

  // Trajet rectiligne a -> b (le Bus de combat). Chemin « fermé » à deux points :
  // le véhicule qui arrive en b est quand même guidé par le segment, il sera
  // retiré de la scène une fois sorti de la carte.
  static line(a, b, corridor = 40) {
    const chemin = new Chemin(corridor);
    chemin.points.push(createVector(a.x, a.y));
    chemin.points.push(createVector(b.x, b.y));
    chemin.computeLengths();
    return chemin;
  }

  // Anneau ondulé autour d'un centre (orbite du Serpent autour du Noyau)
  static ring(center, radius, count, corridor, wobble = 0.18) {
    const chemin = new Chemin(corridor);
    const phase = random(TWO_PI);
    for (let i = 0; i < count; i++) {
      const theta = (i / count) * TWO_PI;
      const r = radius * (1 + wobble * Math.sin(3 * theta + phase));
      chemin.points.push(createVector(center.x + Math.cos(theta) * r, center.y + Math.sin(theta) * r * 0.82));
    }
    chemin.computeLengths();
    return chemin;
  }

  // Point le plus proche du chemin pour la position donnée (segments bornés).
  // Retourne { point, distance, index, t }.
  project(position) {
    const n = this.points.length;
    let best = null;
    for (let i = 0; i < n; i++) {
      const a = this.points[i];
      const b = this.points[(i + 1) % n];
      const ab = p5.Vector.sub(b, a);
      const lengthSq = ab.magSq();
      let t = lengthSq === 0 ? 0 : p5.Vector.sub(position, a).dot(ab) / lengthSq;
      t = constrain(t, 0, 1);
      const point = p5.Vector.add(a, p5.Vector.mult(ab, t));
      const distance = p5.Vector.dist(position, point);
      if (!best || distance < best.distance) best = { point, distance, index: i, t };
    }
    return best;
  }

  // Point situé `distance` plus loin le long du chemin (dans le sens des points).
  pointAhead(projection, distance) {
    const n = this.points.length;
    let index = projection.index;
    let remaining = distance;
    let current = projection.point.copy();
    while (remaining > 0) {
      const end = this.points[(index + 1) % n];
      const toEnd = p5.Vector.dist(current, end);
      if (remaining <= toEnd) {
        const direction = p5.Vector.sub(end, current);
        if (direction.magSq() > 0) current.add(direction.setMag(remaining));
        return current;
      }
      remaining -= toEnd;
      current = end.copy();
      index = (index + 1) % n;
    }
    return current;
  }

  // Point à l'abscisse curviligne s (pour répartir des Veilleurs sur la boucle).
  pointAtLength(s) {
    if (this.total === 0) return this.points[0].copy();
    let remaining = ((s % this.total) + this.total) % this.total;
    const n = this.points.length;
    for (let i = 0; i < n; i++) {
      if (remaining <= this.lengths[i]) {
        const a = this.points[i];
        const b = this.points[(i + 1) % n];
        const t = this.lengths[i] === 0 ? 0 : remaining / this.lengths[i];
        return p5.Vector.lerp(a, b, t);
      }
      remaining -= this.lengths[i];
    }
    return this.points[0].copy();
  }

  // Distance d'un point au chemin
  distanceTo(position) {
    return this.project(position).distance;
  }

  // Rivière de lumière
  show(time) {
    push();
    noFill();
    strokeJoin(ROUND);
    strokeCap(ROUND);
    blendMode(ADD);
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.4);
    stroke(30, 90, 140, 22 + pulse * 10);
    strokeWeight(this.radius * 2);
    this.trace();
    stroke(60, 150, 210, 16);
    strokeWeight(this.radius * 1.2);
    this.trace();
    stroke(160, 220, 255, 26);
    strokeWeight(1.5);
    this.trace();
    blendMode(BLEND);
    pop();
  }

  trace() {
    beginShape();
    for (const p of this.points) vertex(p.x, p.y);
    endShape(CLOSE);
  }
}
