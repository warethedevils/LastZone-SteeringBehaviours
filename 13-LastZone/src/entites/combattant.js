// Combattant : ce que partagent le joueur et les bots — points de vie et
// bouclier, inventaire à 5 emplacements (pioche + 4), munitions, matériaux,
// tir avec cadence / chargeur / rechargement, soins, ramassage, phases de jeu
// (bus -> chute -> sol). Le mouvement vient de forces de steering appliquées avec
// applyForce(), la locomotion reste celle de Vehicle.

// comportement personnalisé enregistré dans le BehaviorManager : suivre une commande de déplacement
BehaviorManager.register('commande', (v, ctx) => v.commandForce(ctx.move, ctx.speed));

class Combattant extends Vehicle {
  constructor(x, y, name, skin) {
    super(x, y);
    this.r = CONFIG.joueur.r;
    this.name = name;
    this.skin = skin || { body: [90, 150, 255], accent: [255, 255, 255] };
    this.hp = 100;
    this.shield = 0;
    this.phase = 'sol';              // bus | chute | sol | mort
    this.inventory = [{ kind: 'pioche' }, null, null, null, null];
    this.slot = 0;
    this.ammo = { legere: 0, moyenne: 0, cartouche: 0, lourde: 0, roquette: 0, fleche: 0 };
    this.mats = { bois: 0, metal: 0 };
    this.aim = 0;                    // angle du viseur (rad)
    this.cooldown = 0;
    this.reloading = false;
    this.reloadTimer = 0;
    this.using = null;               // { slot, t, total }
    this.harvestTimer = 0;
    this.wallTimer = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.chestsOpened = 0;
    this.woodHarvested = 0;
    this.alive = true;
    this.placement = 0;
    this.invulnerable = 0;
    this.fallTime = 0;
    this.lastHit = 99;
    this.hitFlash = 0;
    this.survival = 0;
    this.swing = 0;                  // animation de coup de pioche
    // équipe, réanimation, véhicule
    this.team = -1;                  // identifiant d'équipe (-1 : seul)
    this.bleed = 0;                  // temps passé à terre
    this.reviveProgress = 0;         // 0..1 pendant qu'un coéquipier te relève
    this.revives = 0;
    this.allyOfPlayer = false;
    this.holdInteract = false;       // maintient E (réanimation)
    this.vehicle = null;
    this.seat = -1;
    this.landedAt = null;
    this.pathSpacingInFrames = 1000000;
    this.applyLimits();
  }

  get maxHp() { return 100; }
  get maxShield() { return 100; }
  get weapon() {
    const item = this.inventory[this.slot];
    return item && item.kind === 'arme' ? item : null;
  }
  get stats() { return this.weapon ? weaponStats(this.weapon) : null; }
  get item() { return this.inventory[this.slot]; }
  get onGround() { return this.phase === 'sol'; }
  get downed() { return this.phase === 'terre'; }
  // peut tirer : au sol, ou passager d'un véhicule
  get canShoot() { return this.phase === 'sol' || (this.phase === 'vehicule' && this.seat > 0); }
  isFriend(other) { return other !== this && this.team >= 0 && other.team === this.team; }
  get vitality() { return this.hp + this.shield; }

  applyLimits() {
    const c = CONFIG.joueur;
    this.maxSpeed = c.maxSpeed;
    this.maxForce = c.maxForce;
  }

  // Meilleure arme possédée (par dégâts par seconde) : { index, item } ou null
  bestWeapon() {
    let best = null;
    this.inventory.forEach((item, index) => {
      if (item && item.kind === 'arme' && (!best || weaponDps(item) > weaponDps(best.item))) best = { index, item };
    });
    return best;
  }

  hasHeal(kind) { return this.inventory.some(it => it && it.kind === kind); }

  // ---------- Temps ----------

  tick(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.harvestTimer = Math.max(0, this.harvestTimer - dt);
    this.wallTimer = Math.max(0, this.wallTimer - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.swing = Math.max(0, this.swing - dt);
    this.lastHit += dt;
    if (this.alive) this.survival += dt;
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.finishReload();
    }
    if (this.using) {
      this.using.t += dt;
      if (this.using.t >= this.using.total) this.completeUse();
    }
  }

  // ---------- Inventaire ----------

  select(index) {
    if (index < 0 || index >= this.inventory.length || index === this.slot) return false;
    this.slot = index;
    this.cancelReload();
    this.cancelUse();
    return true;
  }

  // Ajoute un butin. Retourne { taken, dropped } : dropped = objet remplacé (à reposer au sol)
  pickup(drop) {
    if (drop.kind === 'munitions') {
      this.ammo[drop.type] = Math.min(300, this.ammo[drop.type] + drop.count);
      return { taken: true, dropped: null };
    }
    if (drop.kind === 'materiau') {
      this.mats[drop.type] = Math.min(999, this.mats[drop.type] + drop.count);
      return { taken: true, dropped: null };
    }
    if (drop.kind === 'soin' || drop.kind === 'bouclier') {
      const stackMax = SOINS[drop.type].stack;
      const same = this.inventory.findIndex(it => it && it.type === drop.type && it.kind === drop.kind);
      if (same >= 0) {
        const room = stackMax - this.inventory[same].count;
        if (room <= 0) return { taken: false, dropped: null };
        this.inventory[same].count += Math.min(room, drop.count);
        return { taken: true, dropped: null };
      }
      const empty = this.inventory.findIndex((it, i) => i > 0 && !it);
      if (empty < 0) return { taken: false, dropped: null };
      this.inventory[empty] = { kind: drop.kind, type: drop.type, count: Math.min(stackMax, drop.count) };
      return { taken: true, dropped: null };
    }
    if (drop.kind === 'grenade') {
      const stackMax = EXPLOSIFS.grenade.stack;
      const same = this.inventory.findIndex(it => it && it.kind === 'grenade');
      if (same >= 0) {
        const room = stackMax - this.inventory[same].count;
        if (room <= 0) return { taken: false, dropped: null };
        this.inventory[same].count += Math.min(room, drop.count);
        return { taken: true, dropped: null };
      }
      const empty = this.inventory.findIndex((it, i) => i > 0 && !it);
      if (empty < 0) return { taken: false, dropped: null };
      this.inventory[empty] = { kind: 'grenade', type: 'grenade', count: Math.min(stackMax, drop.count) };
      return { taken: true, dropped: null };
    }
    // arme
    const weapon = { kind: 'arme', type: drop.type, rarity: drop.rarity, mag: drop.mag };
    const empty = this.inventory.findIndex((it, i) => i > 0 && !it);
    if (empty >= 0) {
      this.inventory[empty] = weapon;
      if (!this.weapon && this.slot === 0) this.select(empty);
      return { taken: true, dropped: null };
    }
    if (this.slot > 0) {
      const old = this.inventory[this.slot];
      this.inventory[this.slot] = weapon;
      this.cancelReload();
      this.cancelUse();
      return { taken: true, dropped: this.itemToDrop(old) };
    }
    return { taken: false, dropped: null };
  }

  // Convertit un objet d'inventaire en donnée de butin
  itemToDrop(item) {
    if (!item || item.kind === 'pioche') return null;
    if (item.kind === 'arme') return { kind: 'arme', type: item.type, rarity: item.rarity, mag: item.mag };
    return { kind: item.kind, type: item.type, count: item.count };
  }

  // Tout ce qu'il lâche en étant éliminé
  dropAll() {
    const drops = [];
    for (const item of this.inventory) {
      const d = this.itemToDrop(item);
      if (d) drops.push(d);
    }
    for (const type of Object.keys(this.ammo)) {
      if (this.ammo[type] > 0) drops.push({ kind: 'munitions', type, count: Math.ceil(this.ammo[type] / 2) });
    }
    for (const type of Object.keys(this.mats)) {
      if (this.mats[type] >= 10) drops.push({ kind: 'materiau', type, count: Math.floor(this.mats[type] / 2) });
    }
    return drops;
  }

  // ---------- Tir ----------

  startReload() {
    const w = this.weapon;
    if (!w || this.reloading || this.using) return false;
    const s = this.stats;
    if (w.mag >= s.mag || this.ammo[s.ammo] <= 0) return false;
    this.reloading = true;
    this.reloadTimer = s.reload;
    return true;
  }

  cancelReload() { this.reloading = false; this.reloadTimer = 0; }

  finishReload() {
    const w = this.weapon;
    this.reloading = false;
    this.reloadTimer = 0;
    if (!w) return;
    const s = this.stats;
    const take = Math.min(s.mag - w.mag, this.ammo[s.ammo]);
    w.mag += take;
    this.ammo[s.ammo] -= take;
  }

  // Un tir si la cadence, le chargeur et l'état le permettent. `pressed` : front montant
  // de la gâchette (armes semi-automatiques). Retourne les balles créées.
  tryFire(trigger, pressed, errorAngle = 0) {
    const w = this.weapon;
    if (!w || !trigger || this.using || this.reloading || this.cooldown > 0 || !this.canShoot) return [];
    const s = this.stats;
    if (!s.auto && !pressed) return [];
    if (w.mag <= 0) { this.startReload(); return []; }
    w.mag--;
    this.cooldown = 1 / s.rate;
    const bullets = [];
    const muzzle = createVector(this.pos.x + Math.cos(this.aim) * (this.r + 12), this.pos.y + Math.sin(this.aim) * (this.r + 12));
    const tint = RARITES[w.rarity].color;
    for (let i = 0; i < s.pellets; i++) {
      const angle = this.aim + errorAngle + (random(-1, 1) + random(-1, 1)) * 0.5 * s.spread;
      bullets.push(new Balle(muzzle.x, muzzle.y, angle, s.speed, s.damage, s.range, this, tint, { blast: s.blast, pierce: s.pierce }));
    }
    if (w.mag === 0 && this.ammo[s.ammo] > 0) this.startReload();
    return bullets;
  }

  // ---------- Explosifs ----------

  // Lance une grenade dans la direction du viseur (retourne une Balle explosive ou null)
  throwGrenade(distance = null) {
    let index = this.slot;
    if (!this.inventory[index] || this.inventory[index].kind !== 'grenade') {
      index = this.inventory.findIndex(it => it && it.kind === 'grenade');
    }
    const item = index >= 0 ? this.inventory[index] : null;
    if (!item || item.count <= 0 || this.cooldown > 0 || !this.canShoot || this.using) return null;
    const def = EXPLOSIFS.grenade;
    item.count--;
    if (item.count <= 0) this.inventory[index] = null;
    this.cooldown = 0.8;
    const full = def.speed * def.fuse * 60;
    const range = distance === null ? full : Math.min(full, Math.max(90, distance));
    const muzzle = createVector(this.pos.x + Math.cos(this.aim) * (this.r + 8), this.pos.y + Math.sin(this.aim) * (this.r + 8));
    return new Balle(muzzle.x, muzzle.y, this.aim, def.speed, def.damage, range, this, def.color,
      { grenade: true, blast: { radius: def.radius, wall: def.wall } });
  }

  // ---------- Soins ----------

  // Peut-on utiliser l'objet sélectionné maintenant ?
  canUse() {
    const item = this.item;
    if (!item || (item.kind !== 'soin' && item.kind !== 'bouclier') || this.using) return false;
    const def = SOINS[item.type];
    return item.kind === 'soin' ? this.hp < def.cap : this.shield < def.cap;
  }

  startUse() {
    if (!this.canUse()) return false;
    this.cancelReload();
    this.using = { slot: this.slot, t: 0, total: SOINS[this.item.type].use };
    return true;
  }

  cancelUse() { this.using = null; }

  completeUse() {
    const use = this.using;
    this.using = null;
    const item = this.inventory[use.slot];
    if (!item) return;
    const def = SOINS[item.type];
    if (item.kind === 'soin') this.hp = Math.min(def.cap, Math.max(this.hp, this.hp + def.amount));
    else this.shield = Math.min(def.cap, Math.max(this.shield, this.shield + def.amount));
    item.count--;
    if (item.count <= 0) this.inventory[use.slot] = null;
  }

  // ---------- Dégâts ----------

  // Retourne true si ces dégâts éliminent le combattant. Le bouclier absorbe d'abord.
  takeDamage(amount) {
    if (!this.alive || this.invulnerable > 0 || amount <= 0) return false;
    this.lastHit = 0;
    this.hitFlash = 0.12;
    const absorbed = Math.min(this.shield, amount);
    this.shield -= absorbed;
    this.hp -= amount - absorbed;
    return this.hp <= 0;
  }

  // ---------- Mouvement ----------

  // Comportement personnalisé « commande » : vitesse désirée dans la direction `dir`
  // (steering = désirée - vitesse actuelle, force limitée à maxForce)
  commandForce(dir, speed) {
    const desired = createVector(dir.x, dir.y);
    if (desired.magSq() > 0) desired.setMag(speed);
    return this.steerToward(desired);
  }

  steerMove(dir, speed) {
    this.applyForce(this.commandForce(dir, speed));
  }

  get speedFactor() {
    let factor = this.using ? CONFIG.joueur.useSlowFactor : 1;
    const w = this.weapon;
    if (w && WEAPONS[w.type].slow) factor *= WEAPONS[w.type].slow;      // arme lourde
    if (this.downed) factor *= 0.3;                                      // on rampe
    return factor;
  }

  // ---------- Dessin ----------

  show(isPlayer = false) {
    if (this.phase === 'bus' || this.phase === 'mort') return;
    const [br, bg, bb] = this.skin.body;
    const [ar, ag, ab] = this.skin.accent;
    const flash = this.hitFlash > 0;
    const falling = this.phase === 'chute';
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    fill(0, 0, 0, falling ? 35 : 60);
    ellipse(3, 6, this.r * 2.2, this.r * 1.5);
    if (this.allyOfPlayer) {
      noFill();
      stroke(110, 235, 150, 220);
      strokeWeight(3);
      circle(0, 0, this.r * 2.9);
      noStroke();
    }
    if (this.phase === 'terre') {
      fill(255, 70, 70, 60 + 40 * Math.sin(this.bleed * 6));
      circle(0, 0, this.r * 3.4);
      if (this.reviveProgress > 0) {
        noFill();
        stroke(120, 235, 150);
        strokeWeight(4);
        arc(0, 0, this.r * 3.4, this.r * 3.4, -HALF_PI, -HALF_PI + TWO_PI * this.reviveProgress);
      }
      noStroke();
      scale(0.85);
    }
    if (falling) {
      // parachute
      const open = Math.min(1, (5 - this.fallTime) / 1.2);
      const lift = 40 + 30 * (1 - open);
      fill(255, 140, 70, 235);
      ellipse(0, -lift, 90 * (0.5 + 0.5 * open), 52 * (0.5 + 0.5 * open));
      stroke(255, 255, 255, 180);
      strokeWeight(1.5);
      line(-30, -lift + 8, -6, -6);
      line(30, -lift + 8, 6, -6);
      noStroke();
    }
    rotate(this.aim);
    // arme tenue
    const w = this.weapon;
    if (w) {
      const [wr, wg, wb] = RARITES[w.rarity].color;
      fill(40, 44, 56);
      stroke(wr, wg, wb);
      strokeWeight(1.5);
      const len = w.type === 'sniper' ? 38 : w.type === 'pompe' ? 32 : w.type === 'pistolet' ? 18 : 28;
      rect(this.r * 0.4, -3, len, 6, 2);
    } else if (this.slot === 0) {
      // pioche
      const t = this.swing > 0 ? Math.sin((1 - this.swing / 0.22) * PI) : 0;
      push();
      rotate(-0.8 + t * 1.8);
      stroke(120, 80, 40);
      strokeWeight(3);
      line(this.r * 0.5, 0, this.r + 18, 0);
      stroke(190, 200, 215);
      strokeWeight(4);
      line(this.r + 14, -7, this.r + 14, 7);
      pop();
    }
    noStroke();
    fill(flash ? 255 : br, flash ? 255 : bg, flash ? 255 : bb);
    stroke(br * 0.4, bg * 0.4, bb * 0.4);
    strokeWeight(2.5);
    circle(0, 0, this.r * 2);
    noStroke();
    fill(ar, ag, ab, 230);
    circle(this.r * 0.2, 0, this.r * 1.0);
    fill(60, 40, 30);
    circle(this.r * 0.55, -this.r * 0.35, 3.4);
    circle(this.r * 0.55, this.r * 0.35, 3.4);
    // mains
    fill(255, 215, 180);
    circle(this.r * 0.9, -this.r * 0.55, 5);
    circle(this.r * 0.9, this.r * 0.55, 5);
    pop();
    if (this.using) {
      push();
      noStroke();
      fill(0, 0, 0, 140);
      rect(this.pos.x - 22, this.pos.y + this.r + 10, 44, 6, 3);
      fill(255, 255, 255, 230);
      rect(this.pos.x - 22, this.pos.y + this.r + 10, 44 * (this.using.t / this.using.total), 6, 3);
      pop();
    }
  }

  // Étiquette : nom + barres de vie, au-dessus du combattant
  showTag(isPlayer) {
    if (this.phase === 'bus' || this.phase === 'mort') return;
    push();
    if (typeof viewCounter === 'number' && viewCounter !== 0) {
      translate(this.pos.x, this.pos.y);
      rotate(viewCounter);
      translate(-this.pos.x, -this.pos.y);
    }
    textAlign(CENTER, BOTTOM);
    textSize(12);
    noStroke();
    fill(0, 0, 0, 160);
    text(this.name, this.pos.x + 1, this.pos.y - this.r - 18);
    fill(isPlayer ? color(255, 235, 130) : color(255, 255, 255, 230));
    text(this.name, this.pos.x, this.pos.y - this.r - 19);
    const w = 38;
    const x = this.pos.x - w / 2;
    const y = this.pos.y - this.r - 14;
    fill(0, 0, 0, 150);
    rect(x - 1, y - 1, w + 2, 9, 3);
    fill(90, 220, 90);
    rect(x, y + 4, w * Math.max(0, this.hp) / 100, 3);
    fill(90, 170, 255);
    rect(x, y, w * Math.max(0, this.shield) / 100, 3);
    pop();
  }
}
