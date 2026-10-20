// Grille spatiale : index des obstacles et du butin pour ne traiter que le
// voisinage utile d'une entité (perception limitée, collisions, lignes de tir).
// Structure de données, pas une entité du monde.
//
// Les objets stockés ont une position `pos` et un rayon `r`.

class Grille {
  constructor(width, height, cell = 128) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.cells = new Map();
    this.stamp = 0;
  }

  key(cx, cy) { return cy * this.cols + cx; }

  clampCell(c, max) { return Math.min(max - 1, Math.max(0, c)); }

  // Cellules recouvertes par le disque (x, y, radius)
  range(x, y, radius) {
    const c = this.cell;
    return {
      x0: this.clampCell(Math.floor((x - radius) / c), this.cols),
      x1: this.clampCell(Math.floor((x + radius) / c), this.cols),
      y0: this.clampCell(Math.floor((y - radius) / c), this.rows),
      y1: this.clampCell(Math.floor((y + radius) / c), this.rows)
    };
  }

  insert(obj) {
    const { x0, x1, y0, y1 } = this.range(obj.pos.x, obj.pos.y, obj.r || 0);
    obj._cells = [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cy);
        let bucket = this.cells.get(k);
        if (!bucket) { bucket = []; this.cells.set(k, bucket); }
        bucket.push(obj);
        obj._cells.push(k);
      }
    }
  }

  remove(obj) {
    if (!obj._cells) return;
    for (const k of obj._cells) {
      const bucket = this.cells.get(k);
      if (!bucket) continue;
      const i = bucket.indexOf(obj);
      if (i >= 0) bucket.splice(i, 1);
    }
    obj._cells = null;
  }

  clear() { this.cells.clear(); }

  // Objets dont le disque touche le disque (x, y, radius), sans doublon
  query(x, y, radius) {
    const { x0, x1, y0, y1 } = this.range(x, y, radius);
    this.stamp++;
    const found = [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const obj of bucket) {
          if (obj._seen === this.stamp) continue;
          obj._seen = this.stamp;
          const dx = obj.pos.x - x;
          const dy = obj.pos.y - y;
          const reach = radius + (obj.r || 0);
          if (dx * dx + dy * dy <= reach * reach) found.push(obj);
        }
      }
    }
    return found;
  }

  // Premier objet touché par le segment a -> b (disque élargi de `margin`), ou null.
  // `filter(obj)` permet d'ignorer certains objets. Retourne { obj, t } : t = fraction du segment.
  segmentHit(a, b, margin = 0, filter = null) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(length / (this.cell * 0.5)));
    let best = null;
    this.stamp++;
    for (let i = 0; i <= steps; i++) {
      const px = a.x + (dx * i) / steps;
      const py = a.y + (dy * i) / steps;
      const { x0, x1, y0, y1 } = this.range(px, py, 0);
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const bucket = this.cells.get(this.key(cx, cy));
          if (!bucket) continue;
          for (const obj of bucket) {
            if (obj._seen === this.stamp) continue;
            obj._seen = this.stamp;
            if (filter && !filter(obj)) continue;
            const t = Grille.segmentCircle(a, dx, dy, length, obj.pos, (obj.r || 0) + margin);
            if (t !== null && (best === null || t < best.t)) best = { obj, t };
          }
        }
      }
    }
    return best;
  }

  // Fraction t ∈ [0,1] du premier contact du segment avec le disque, ou null.
  static segmentCircle(a, dx, dy, length, center, radius) {
    const fx = a.x - center.x;
    const fy = a.y - center.y;
    if (fx * fx + fy * fy <= radius * radius) return 0;
    if (length === 0) return null;
    const A = dx * dx + dy * dy;
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - radius * radius;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const root = Math.sqrt(disc);
    const t = (-B - root) / (2 * A);
    return t >= 0 && t <= 1 ? t : null;
  }
}
