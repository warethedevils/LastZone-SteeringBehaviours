// Carte : génère l'île (forme, villes, maisons, forêts, rochers) et fournit les
// requêtes dont les autres modules ont besoin (rivage, emplacements libres,
// villes). Constructeur de monde : ce n'est pas une entité ; les éléments qu'elle
// crée (Arbre, Rocher, Batiment) sont des Vehicle. Le fond est dessiné par
// renderTerrain() dans une image pré-calculée.

const NOMS_VILLES = ['Port-Brume', 'Pins Perdus', 'Fort-Cendre', 'Val Doré', 'Mont Vertige',
  'Les Silos', 'Anse Corail', 'Croix-du-Nord', 'Lac Miroir'];
const TOITS = [[214, 76, 66], [66, 130, 214], [232, 190, 66], [86, 190, 150], [226, 128, 64], [150, 96, 200]];

class Carte {
  constructor() {
    const isl = CONFIG.island;
    this.cx = isl.cx;
    this.cy = isl.cy;
    this.radius = isl.radius;
    this.phases = [random(TWO_PI), random(TWO_PI), random(TWO_PI)];
    this.towns = [];
    this.houses = [];
    this.trees = [];
    this.rocks = [];
    this.roads = [];
    this.chestSpots = [];
  }

  // ---------- Forme de l'île ----------

  // Rayon du rivage dans la direction theta
  radiusAt(theta) {
    const [p1, p2, p3] = this.phases;
    return this.radius * (1 + 0.09 * Math.sin(2 * theta + p1) + 0.06 * Math.sin(3 * theta + p2)
      + 0.035 * Math.sin(5 * theta + p3));
  }

  // Rayon du rivage vu depuis un point (même direction que ce point depuis le centre)
  shoreRadius(pos) {
    return this.radiusAt(Math.atan2(pos.y - this.cy, pos.x - this.cx));
  }

  // Le point est-il sur l'île, avec une marge par rapport au rivage ?
  inIsland(pos, margin = 0) {
    return Math.hypot(pos.x - this.cx, pos.y - this.cy) <= this.shoreRadius(pos) - margin;
  }

  // Ramène un point trop proche de la mer à l'intérieur (règle de scène)
  clampToIsland(pos, margin = 20) {
    const dx = pos.x - this.cx;
    const dy = pos.y - this.cy;
    const distance = Math.hypot(dx, dy);
    const limit = this.shoreRadius(pos) - margin;
    if (distance <= limit || distance === 0) return false;
    pos.x = this.cx + (dx / distance) * limit;
    pos.y = this.cy + (dy / distance) * limit;
    return true;
  }

  // ---------- Génération ----------

  // grid : Grille où sont insérés les colliders
  generate(grid) {
    this.grid = grid;
    this.placeTowns();
    this.placeForests();
    this.placeRocks();
    this.buildRoads();
    return this;
  }

  addEntity(entity, list) {
    list.push(entity);
    for (const c of entity.colliders) this.grid.insert(c);
  }

  removeEntity(entity, list) {
    for (const c of entity.colliders) this.grid.remove(c);
    const i = list.indexOf(entity);
    if (i >= 0) list.splice(i, 1);
  }

  // Un cercle (x, y, r) est-il libre d'obstacles et sur l'île ?
  isFree(x, y, r, margin = 20) {
    const p = createVector(x, y);
    if (!this.inIsland(p, margin + 40)) return false;
    return this.grid.query(x, y, r).length === 0;
  }

  randomPoint(radius = 30, tries = 80) {
    for (let i = 0; i < tries; i++) {
      const angle = random(TWO_PI);
      const dist = Math.sqrt(random(1)) * (this.radius * 0.95);
      const x = this.cx + Math.cos(angle) * dist;
      const y = this.cy + Math.sin(angle) * dist;
      if (this.isFree(x, y, radius)) return createVector(x, y);
    }
    return createVector(this.cx, this.cy);
  }

  placeTowns() {
    const [lo, hi] = CONFIG.carte.housesPerTown;
    const names = NOMS_VILLES.slice().sort(() => random(1) - 0.5);
    for (let t = 0; t < CONFIG.carte.towns && this.towns.length < CONFIG.carte.towns; t++) {
      let center = null;
      for (let tries = 0; tries < 200 && !center; tries++) {
        const angle = random(TWO_PI);
        const dist = (t === 0 ? random(0, 250) : random(350, this.radius * 0.72));
        const p = createVector(this.cx + Math.cos(angle) * dist, this.cy + Math.sin(angle) * dist);
        if (!this.inIsland(p, 260)) continue;
        if (this.towns.every(o => p5.Vector.dist(o.pos, p) > 560)) center = p;
      }
      if (!center) continue;
      const town = { name: names[this.towns.length % names.length], pos: center, r: 190, houses: [], size: 0 };
      const count = Math.floor(random(lo, hi + 1));
      for (let h = 0; h < count; h++) {
        for (let tries = 0; tries < 40; tries++) {
          const a = random(TWO_PI);
          const d = random(40, town.r);
          const w = random(70, 120);
          const ht = random(60, 100);
          const x = center.x + Math.cos(a) * d;
          const y = center.y + Math.sin(a) * d;
          const blocked = this.houses.some(o => Math.abs(o.pos.x - x) < (o.w + w) / 2 + 36
            && Math.abs(o.pos.y - y) < (o.h + ht) / 2 + 36);
          if (blocked || !this.inIsland(createVector(x, y), 200)) continue;
          const roof = TOITS[Math.floor(random(TOITS.length))];
          const house = new Batiment(x, y, w, ht, roof);
          this.addEntity(house, this.houses);
          town.houses.push(house);
          // un coffre devant la maison
          const side = random(1) < 0.5 ? 1 : -1;
          const vertical = random(1) < 0.5;
          this.chestSpots.push({
            x: x + (vertical ? 0 : side * (w / 2 + 28)),
            y: y + (vertical ? side * (ht / 2 + 28) : 0),
            town
          });
          break;
        }
      }
      town.size = town.houses.length;
      this.towns.push(town);
    }
  }

  inTown(x, y, margin = 0) {
    return this.towns.some(t => Math.hypot(t.pos.x - x, t.pos.y - y) < t.r + margin);
  }

  placeForests() {
    const target = CONFIG.carte.trees;
    const centers = [];
    for (let i = 0; i < 16; i++) {
      const p = this.randomPoint(60);
      if (!this.inTown(p.x, p.y, 120)) centers.push(p);
    }
    let guard = 0;
    while (this.trees.length < target && guard++ < target * 30) {
      const forest = random(1) < 0.78 && centers.length > 0;
      let x, y;
      if (forest) {
        const c = centers[Math.floor(random(centers.length))];
        const a = random(TWO_PI);
        const d = Math.abs(random(-1, 1) + random(-1, 1)) * 170;
        x = c.x + Math.cos(a) * d;
        y = c.y + Math.sin(a) * d;
      } else {
        const p = this.randomPoint(40);
        x = p.x; y = p.y;
      }
      if (this.inTown(x, y, 30)) continue;
      const tree = new Arbre(x, y, random(0.85, 1.25));
      if (!this.isFree(x, y, tree.r + 22)) continue;
      this.addEntity(tree, this.trees);
    }
  }

  placeRocks() {
    let guard = 0;
    while (this.rocks.length < CONFIG.carte.rocks && guard++ < 600) {
      const p = this.randomPoint(70);
      if (this.inTown(p.x, p.y, 60)) continue;
      const rock = new Rocher(p.x, p.y, random(30, 56));
      if (!this.isFree(p.x, p.y, rock.r + 25)) continue;
      this.addEntity(rock, this.rocks);
    }
  }

  // Routes : chaque ville est reliée à la plus proche déjà reliée
  buildRoads() {
    const linked = [this.towns[0]];
    const rest = this.towns.slice(1);
    while (rest.length > 0) {
      let best = null;
      for (const t of rest) {
        for (const l of linked) {
          const d = p5.Vector.dist(t.pos, l.pos);
          if (!best || d < best.d) best = { t, l, d };
        }
      }
      this.roads.push([best.l.pos.copy(), best.t.pos.copy()]);
      linked.push(best.t);
      rest.splice(rest.indexOf(best.t), 1);
    }
  }

  // Ville de poids donné (taille) tirée au hasard, pour l'atterrissage des bots
  randomTown(preferBig = 0.5) {
    const weights = this.towns.map(t => 1 + t.size * preferBig);
    return this.towns[rollIndex(weights)];
  }

  // ---------- Rendu du fond (une seule fois) ----------

  // g : p5.Graphics ; scale : réduction du fond par rapport au monde
  renderTerrain(g, scale = 0.5) {
    g.push();
    g.scale(scale);
    g.noStroke();
    g.background(28, 104, 168);
    g.stroke(255, 255, 255, 22);
    g.strokeWeight(3);
    for (let i = 0; i < 160; i++) {
      const x = random(WORLD.w), y = random(WORLD.h);
      g.line(x, y, x + random(30, 90), y + random(-4, 4));
    }
    const ring = (inflate, r, gr, b, a = 255) => {
      g.noStroke();
      g.fill(r, gr, b, a);
      g.beginShape();
      for (let i = 0; i < 160; i++) {
        const theta = (i / 160) * TWO_PI;
        const rad = this.radiusAt(theta) + inflate;
        g.vertex(this.cx + Math.cos(theta) * rad, this.cy + Math.sin(theta) * rad);
      }
      g.endShape(CLOSE);
    };
    ring(150, 40, 130, 190, 120);
    ring(70, 70, 160, 205, 255);
    ring(30, 236, 218, 158);
    ring(-8, 98, 170, 88);
    // taches d'herbe
    g.noStroke();
    for (let i = 0; i < 700; i++) {
      const p = this.randomPoint(0, 5);
      g.fill(random(70, 120), random(150, 195), random(60, 100), 60);
      g.ellipse(p.x, p.y, random(60, 200), random(40, 140));
    }
    // routes et places
    g.stroke(204, 184, 140);
    g.strokeWeight(34);
    g.strokeCap(ROUND);
    for (const [a, b] of this.roads) g.line(a.x, a.y, b.x, b.y);
    g.stroke(226, 208, 168);
    g.strokeWeight(4);
    for (const [a, b] of this.roads) g.line(a.x, a.y, b.x, b.y);
    g.noStroke();
    for (const t of this.towns) {
      g.fill(176, 176, 168);
      g.circle(t.pos.x, t.pos.y, t.r * 2.1);
      g.fill(190, 190, 182);
      g.circle(t.pos.x, t.pos.y, t.r * 1.5);
    }
    g.pop();
  }
}
