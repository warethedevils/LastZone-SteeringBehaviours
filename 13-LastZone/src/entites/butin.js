// Butin posé au sol : arme, soin, bouclier, munitions ou matériaux. Il porte
// la donnée `drop` (voir armes.js) et ne bouge pas (Vehicle immobile).
//   drop = { kind: 'arme', type, rarity, mag } | { kind: 'soin' | 'bouclier', type, count }
//        | { kind: 'munitions', type, count } | { kind: 'materiau', type, count }
class Butin extends Vehicle {
  constructor(x, y, drop) {
    super(x, y);
    this.drop = drop;
    this.r = 14;
    this.maxSpeed = 0;
    this.maxForce = 0;
    this.vel.set(0, 0);
    this.taken = false;
    this.phase = random(TWO_PI);
    this.age = 0;
  }

  // Les munitions et matériaux se ramassent en marchant dessus
  get automatic() { return this.drop.kind === 'munitions' || this.drop.kind === 'materiau'; }

  get rarity() { return this.drop.kind === 'arme' ? this.drop.rarity : 0; }

  get color() {
    const d = this.drop;
    if (d.kind === 'arme') return RARITES[d.rarity].color;
    if (d.kind === 'munitions') return MUNITIONS[d.type].color;
    if (d.kind === 'materiau') return MATERIAUX[d.type].color;
    if (d.kind === 'grenade') return EXPLOSIFS.grenade.color;
    return SOINS[d.type].color;
  }

  get label() {
    const d = this.drop;
    if (d.kind === 'arme') return `${WEAPONS[d.type].nom} (${RARITES[d.rarity].nom})`;
    if (d.kind === 'munitions') return `${MUNITIONS[d.type].nom} ×${d.count}`;
    if (d.kind === 'materiau') return `${MATERIAUX[d.type].nom} ×${d.count}`;
    if (d.kind === 'grenade') return `${EXPLOSIFS.grenade.nom} ×${d.count}`;
    return `${SOINS[d.type].nom}${d.count > 1 ? ' ×' + d.count : ''}`;
  }

  get icon() {
    const d = this.drop;
    if (d.kind === 'arme') return WEAPONS[d.type].court;
    if (d.kind === 'munitions') return '•';
    if (d.kind === 'materiau') return d.type === 'bois' ? '▤' : '▦';
    if (d.kind === 'grenade') return EXPLOSIFS.grenade.court;
    return SOINS[d.type].court;
  }

  show() {
    this.age += 1 / 60;
    const [r, g, b] = this.color;
    const bob = Math.sin(this.age * 3 + this.phase) * 2;
    const high = this.drop.kind === 'arme' && this.drop.rarity >= 2;
    push();
    translate(this.pos.x, this.pos.y);
    if (typeof viewCounter === 'number') rotate(viewCounter);
    noStroke();
    fill(0, 0, 0, 50);
    ellipse(2, 5, 28, 14);
    if (high) {
      blendMode(ADD);
      fill(r, g, b, 35 + 18 * Math.sin(this.age * 4));
      circle(0, bob, 52);
      fill(r, g, b, 60);
      circle(0, bob, 32);
      blendMode(BLEND);
    }
    fill(r * 0.35, g * 0.35, b * 0.35);
    stroke(r, g, b);
    strokeWeight(2.2);
    rect(-13, -10 + bob, 26, 20, 5);
    noStroke();
    fill(255, 255, 255, 235);
    textAlign(CENTER, CENTER);
    textSize(this.drop.kind === 'arme' ? 10 : 13);
    text(this.icon, 0, bob);
    pop();
  }
}
