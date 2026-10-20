// Animal : base commune de la faune (loup, cerf, corbeau). C'est un Vehicle : il se déplace
// par steering uniquement (BehaviorManager hérité). Il ajoute seulement des points de vie, un
// éclat de dégât et l'interface que les combattants attendent d'une cible (alive, phase, vitality…).
class Animal extends Vehicle {
  constructor(x, y, hp) {
    super(x, y);
    this.maxHp = hp;
    this.hp = hp;
    this.flash = 0;
    this.age = 0;
    this.vel.set(0, 0);
    this.pathSpacingInFrames = 1000000;
    this.angle = random(TWO_PI);          // orientation affichée
  }

  get alive() { return this.hp > 0; }
  get dead() { return this.hp <= 0; }
  get phase() { return 'sol'; }           // une cible au sol comme une autre
  get vitality() { return this.hp; }
  get team() { return -2; }               // l'équipe -2 n'est amie de personne
  isFriend() { return false; }
  bestWeapon() { return null; }

  // Retourne true si le coup est mortel
  hit(damage) {
    this.hp -= damage;
    this.flash = 0.12;
    return this.hp <= 0;
  }
  takeDamage(damage) { return this.hit(damage); }

  tick(dt) {
    this.age += dt;
    this.flash = Math.max(0, this.flash - dt);
  }

  faceVelocity(minSpeed = 0.3) {
    if (this.vel.mag() > minSpeed) this.angle = Math.atan2(this.vel.y, this.vel.x);
  }

  // Obstacles proches sous la forme attendue par avoid()
  static obstaclesAround(world, pos, radius = 140) {
    return world.grid.query(pos.x, pos.y, radius).map(o => ({ pos: o.pos, r: o.r }));
  }

  // Ligne de vue entre deux points (arbres, rochers, bâtiments, murs)
  static sees(world, a, b) {
    return !world.grid.segmentHit(a, b, 0);
  }

  // Rappel vers l'île (cercle approché par le rayon du rivage)
  static islandContext(world, pos) {
    return {
      center: createVector(world.carte.cx, world.carte.cy),
      radius: world.carte.shoreRadius(pos) - CONFIG.island.shoreMargin,
      margin: 120
    };
  }
}
