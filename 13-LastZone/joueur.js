// Le joueur. ZQSD/WASD pilote une VITESSE DÉSIRÉE (steering = désirée - vitesse
// actuelle, force limitée), la souris oriente le viseur. Ses actions de scène
// (interagir, construire, sauter, frapper à la pioche) sont déclarées ici et
// exécutées par le Match, qui connaît le monde.

class Joueur extends Combattant {
  constructor(x, y, name, skin) {
    super(x, y, name, skin);
    this.wantsInteract = false;
    this.wantsBuild = false;
    this.wantsJump = false;
    this.swingNow = false;
    this.moving = false;
    this.driveMove = null;           // commande de conduite lue par le véhicule (siège conducteur)
    this.behaviors.add('commande', 'commande', 1);   // ZQSD pilote la vitesse désirée
  }

  // input : { move: {x,y}, aim: {x,y} (point monde), fire, firePressed, sprint,
  //           reload, interact, holdInteract, grenade, build, jump, slot (0-4 ou null), scroll (-1/0/1) }
  // Retourne les balles tirées pendant ce pas.
  think(world, input, dt) {
    this.tick(dt);
    this.applyLimits();
    this.wantsInteract = !!input.interact;
    this.holdInteract = !!input.holdInteract;
    this.wantsBuild = !!input.build;
    this.wantsJump = !!input.jump;
    this.swingNow = false;
    this.aim = Math.atan2(input.aim.y - this.pos.y, input.aim.x - this.pos.x);
    this.aimDist = Math.hypot(input.aim.x - this.pos.x, input.aim.y - this.pos.y);
    const move = input.move;
    this.moving = move.x !== 0 || move.y !== 0;

    this.driveMove = null;
    if (this.phase === 'bus' || this.phase === 'mort') return [];
    if (this.phase === 'terre') {
      // à terre : on rampe, on ne peut rien faire d'autre
      this.holdInteract = false;
      this.behaviors.apply({ move, speed: CONFIG.joueur.maxSpeed * this.speedFactor });
      return [];
    }
    if (this.phase === 'chute') {
      this.fallTime -= dt;
      this.behaviors.apply({ move, speed: CONFIG.match.airSpeed });
      return [];
    }

    if (this.phase === 'vehicule') {
      // le conducteur pilote ; les passagers tirent depuis leur siège
      if (this.seat === 0) this.driveMove = move;
      this.holdInteract = false;
      if (input.slot !== null && input.slot !== undefined) this.select(input.slot);
      if (input.reload) this.startReload();
      if (this.seat > 0) {
        if (input.grenade) { const g = this.throwGrenade(this.aimDist); if (g) return [g]; }
        const weapon = this.item;
        if (weapon && weapon.kind === 'arme') return this.tryFire(input.fire || input.firePressed, input.firePressed);
      }
      return [];
    }

    if (input.grenade) { const g = this.throwGrenade(this.aimDist); if (g) return [g]; }
    if (input.slot !== null && input.slot !== undefined) this.select(input.slot);
    if (input.scroll) {
      const n = this.inventory.length;
      this.select((this.slot + input.scroll + n) % n);
    }
    const c = CONFIG.joueur;
    const speed = c.maxSpeed * (input.sprint && !this.using ? c.sprintFactor : 1) * this.speedFactor;
    this.maxSpeed = Math.max(this.maxSpeed, speed);   // le sprint relève la limite de vitesse
    this.behaviors.apply({ move, speed });

    if (input.reload) this.startReload();

    const item = this.item;
    // un simple clic (front montant) suffit pour une arme semi-automatique
    if (item && item.kind === 'arme') return this.tryFire(input.fire || input.firePressed, input.firePressed);
    if (item && item.kind === 'grenade') {
      if (input.firePressed) { const g = this.throwGrenade(this.aimDist); if (g) return [g]; }
    } else if (item && (item.kind === 'soin' || item.kind === 'bouclier')) {
      if (input.firePressed) this.startUse();
    } else if (input.fire && this.harvestTimer <= 0) {
      this.swingNow = true;
      this.harvestTimer = c.harvestCooldown;
      this.swing = 0.22;
    }
    return [];
  }
}
