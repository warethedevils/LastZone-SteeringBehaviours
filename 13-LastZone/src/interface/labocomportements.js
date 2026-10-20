// Labo des comportements (touche B en match) : l'inspecteur du BehaviorManager.
//   - gauche : les bots proches (état, comportement complexe actif) ;
//   - centre : radar — le bot au centre, chaque comportement dessiné comme une flèche de force,
//     la somme en blanc, la vitesse en jaune ;
//   - droite : les comportements du complexe actif — activer / désactiver, poids, force produite ;
//   - bas : appliquer à tous les bots, sauver / charger un comportement dans un emplacement,
//     revenir aux comportements d'origine.
// Les réglages sont écrits dans les définitions des comportements complexes (voir reglages.js).

const LaboComportements = {
  selected: null,
  message: '',
  messageT: 0,
  saveName: 'Mon style',

  COLORS: [[255, 120, 90], [90, 200, 255], [120, 230, 120], [255, 214, 56], [200, 120, 255], [255, 160, 220], [120, 255, 220], [255, 190, 100]],

  reset() { this.selected = null; this.message = ''; this.saveName = 'Mon style'; },

  colorOf(index) { return this.COLORS[index % this.COLORS.length]; },

  say(text) { this.message = text; this.messageT = 3; },

  // Bots vivants, du plus proche au plus lointain du joueur
  candidates(match) {
    const p = match.joueur;
    const ref = p.alive ? p : (match.spectateTarget() || p);
    return match.fighters
      .filter(f => f instanceof Bot && f !== p && f.alive && f.debugInfo)
      .sort((a, b) => p5.Vector.dist(a.pos, ref.pos) - p5.Vector.dist(b.pos, ref.pos));
  },

  // match, storage : stockage du navigateur ; actions : { close }
  draw(match, storage, actions) {
    const bots = this.candidates(match);
    if (!this.selected || !this.selected.alive || !bots.includes(this.selected)) this.selected = bots[0] || null;
    const bot = this.selected;
    this.messageT = Math.max(0, this.messageT - deltaTime / 1000);

    push();
    noStroke();
    fill(4, 8, 24, 215);
    rect(0, 0, VIEW.w, VIEW.h);
    pop();
    Ui.panel(24, 20, VIEW.w - 48, VIEW.h - 40, { alpha: 245, title: 'LABO DES COMPORTEMENTS' });
    if (Ui.button('lab-close', VIEW.w - 150, 28, 100, 34, 'FERMER', 'danger', { size: 16 })) actions.close();
    Ui.label('Chaque flèche est la force d\'un comportement de base (steering = vitesse désirée − vitesse actuelle, limitée à maxForce)', 60, 78, 14, PALETTE.dim, LEFT, FONT_BODY, false);
    if (!bot) {
      Ui.label('Aucun bot actif à inspecter.', VIEW.w / 2, 360, 24, PALETTE.dim, CENTER);
      return;
    }

    this.botList(bots, bot);
    this.radar(match, bot);
    this.table(bot);
    this.footer(match, bot, storage, bots);
  },

  botList(bots, bot) {
    Ui.label('BOTS PROCHES', 50, 108, 16, PALETTE.yellow, LEFT, FONT_TITLE, false);
    bots.slice(0, 11).forEach((b, i) => {
      const y = 124 + i * 40;
      const style = b === bot ? 'selected' : 'ghost';
      if (Ui.button('lab-bot-' + i, 50, y, 270, 34, '', style, { size: 14 })) this.selected = b;
      Ui.label(b.name, 62, y + 12, 14, b === bot ? [8, 40, 20] : PALETTE.white, LEFT, FONT_BODY, false);
      Ui.label(`${b.debugInfo.state}${b.brain ? ' · réseau' : ' · règles'}`, 62, y + 26, 11, b === bot ? [20, 70, 40] : PALETTE.dim, LEFT, FONT_BODY, false);
    });
  },

  radar(match, bot) {
    const cx = 590, cy = 330, R = 215;
    const scale = R / 330;
    push();
    noStroke();
    fill(10, 16, 42);
    circle(cx, cy, R * 2 + 12);
    fill(16, 26, 64);
    circle(cx, cy, R * 2);
    noFill();
    stroke(60, 90, 180, 120);
    strokeWeight(1);
    for (let i = 1; i <= 3; i++) circle(cx, cy, R * 2 * i / 3);
    line(cx - R, cy, cx + R, cy);
    line(cx, cy - R, cx, cy + R);
    // le monde autour du bot
    const c = drawingContext;
    c.save();
    c.beginPath();
    c.arc(cx, cy, R, 0, TWO_PI);
    c.clip();
    noStroke();
    for (const o of match.grid.query(bot.pos.x, bot.pos.y, 340)) {
      const p = o.parent;
      const col = p instanceof Arbre ? [60, 140, 70] : p instanceof Rocher ? [130, 135, 150] : p instanceof Mur ? [170, 120, 70] : [200, 90, 80];
      fill(col[0], col[1], col[2], 170);
      circle(cx + (o.pos.x - bot.pos.x) * scale, cy + (o.pos.y - bot.pos.y) * scale, o.r * 2 * scale);
    }
    for (const f of match.fighters) {
      if (f === bot || !f.alive || p5.Vector.dist(f.pos, bot.pos) > 340) continue;
      fill(bot.isFriend(f) ? color(110, 235, 150) : color(255, 90, 90));
      circle(cx + (f.pos.x - bot.pos.x) * scale, cy + (f.pos.y - bot.pos.y) * scale, 12);
    }
    for (const a of match.faune) {
      if (a instanceof Corbeau || p5.Vector.dist(a.pos, bot.pos) > 340) continue;
      fill(a instanceof Loup ? color(255, 150, 60) : color(220, 180, 120));
      circle(cx + (a.pos.x - bot.pos.x) * scale, cy + (a.pos.y - bot.pos.y) * scale, 10);
    }
    c.restore();
    // le bot et ses forces
    const forces = bot.debugInfo.forces || {};
    const names = Object.keys(forces);
    const K = 190;                             // pixels par unité de force
    const sum = createVector(0, 0);
    names.forEach(name => {
      const col = this.colorOf(bot.behaviors.names().indexOf(name));
      const f = forces[name];
      sum.add(f);
      this.arrow(cx, cy, f.x * K, f.y * K, col, 3);
    });
    this.arrow(cx, cy, sum.x * K, sum.y * K, [255, 255, 255], 5);
    this.arrow(cx, cy, bot.vel.x * 34, bot.vel.y * 34, [255, 214, 56], 2);
    noStroke();
    fill(...bot.skin.body);
    stroke(255);
    strokeWeight(2);
    circle(cx, cy, 20);
    pop();
    Ui.label(`${bot.name} · état « ${bot.debugInfo.state} »`, cx, cy + R + 28, 20, PALETTE.white, CENTER, FONT_TITLE, false);
    Ui.label(`somme pondérée ${sum.mag().toFixed(2)}   ·   chaque force brute ≤ maxForce ${bot.maxForce.toFixed(2)}   ·   vitesse ${bot.vel.mag().toFixed(2)} / ${bot.maxSpeed.toFixed(2)}`, cx, cy + R + 52, 14, PALETTE.dim, CENTER, FONT_BODY, false);
    Ui.label('blanc : somme des forces   ·   jaune : vitesse', cx, cy + R + 72, 13, PALETTE.dim, CENTER, FONT_BODY, false);
  },

  arrow(x, y, dx, dy, col, weight) {
    const len = Math.hypot(dx, dy);
    if (len < 2) return;
    push();
    stroke(col[0], col[1], col[2], 235);
    strokeWeight(weight);
    line(x, y, x + dx, y + dy);
    const a = Math.atan2(dy, dx);
    fill(col[0], col[1], col[2], 235);
    noStroke();
    translate(x + dx, y + dy);
    rotate(a);
    triangle(0, 0, -9, -4.5, -9, 4.5);
    pop();
  },

  table(bot) {
    const b = bot.behaviors;
    const x = 860;
    Ui.label(`COMPORTEMENTS · « ${b.activeComplex || '—'} »`, x, 108, 16, PALETTE.yellow, LEFT, FONT_TITLE, false);
    const forces = bot.debugInfo.forces || {};
    const names = b.names();
    names.forEach((name, i) => {
      const y = 134 + i * 46;
      const e = b.get(name);
      const col = this.colorOf(i);
      push();
      noStroke();
      fill(col[0], col[1], col[2]);
      circle(x + 8, y + 10, 12);
      pop();
      Ui.label(name, x + 24, y + 10, 15, e.enabled ? PALETTE.white : PALETTE.dim, LEFT, FONT_BODY, false);
      const mag = forces[name] ? forces[name].mag() : 0;
      Ui.label(mag.toFixed(2), x + 330, y + 10, 13, PALETTE.dim, RIGHT, FONT_BODY, false);
      if (Ui.button('lab-on-' + name, x + 244, y, 56, 24, e.enabled ? 'ON' : 'OFF', e.enabled ? 'selected' : 'ghost', { size: 13 })) {
        Reglages.tweak(bot, name, { enabled: !e.enabled });
      }
      const w = b.weightOf(e) / (e.scale || 1);
      const next = Ui.slider('lab-w-' + name, x + 24, y + 36, 180, Math.min(Reglages.MAX_WEIGHT, w), 0, 4, v => v.toFixed(1));
      if (Math.abs(next - w) > 1e-6) Reglages.tweak(bot, name, { weight: next });
    });
  },

  footer(match, bot, storage, bots) {
    const y = 626;
    const allBots = match.fighters.filter(f => f instanceof Bot);
    if (Ui.button('lab-all', 50, y, 230, 40, 'APPLIQUER À TOUS', 'primary', { size: 16 })) {
      Reglages.applyAll(allBots, Reglages.snapshot(bot));
      this.say(`Réglages de ${bot.name} appliqués à ${allBots.length} bots`);
    }
    if (Ui.button('lab-reset', 290, y, 170, 40, 'RÉINITIALISER', 'ghost', { size: 16 })) {
      Reglages.reset(bot);
      this.say('Comportements d\'origine rétablis pour ' + bot.name);
    }
    if (Ui.button('lab-reset-all', 470, y, 190, 40, 'TOUS ORIGINE', 'ghost', { size: 16 })) {
      for (const b of allBots) Reglages.reset(b);
      this.say('Comportements d\'origine rétablis pour tous les bots');
    }
    Ui.label('Emplacements :', 690, y + 20, 15, PALETTE.dim, LEFT, FONT_BODY, false);
    const slots = Reglages.readAll(storage);
    for (let i = 0; i < Reglages.SLOTS; i++) {
      const slot = slots[i];
      const x = 800 + i * 140;
      if (Ui.button('lab-save-' + i, x, y - 2, 64, 22, 'SAUVER', 'ghost', { size: 11 })) {
        if (Reglages.saveSlot(storage, i, this.saveName || 'Mon style', bot)) this.say(`Sauvé dans l'emplacement ${i + 1}`);
        else this.say('Sauvegarde impossible (stockage indisponible)');
      }
      if (Ui.button('lab-load-' + i, x + 68, y - 2, 64, 22, 'CHARGER', slot ? 'secondary' : 'ghost', { size: 11, enabled: !!slot })) {
        const snap = Reglages.loadSlot(storage, i);
        if (snap) { Reglages.apply(bot, snap); this.say(`« ${slot.name} » chargé sur ${bot.name}`); }
        else this.say('Emplacement illisible');
      }
      Ui.label(slot ? slot.name : '— vide —', x, y + 32, 12, slot ? PALETTE.white : PALETTE.dim, LEFT, FONT_BODY, false);
    }
    if (this.messageT > 0) Ui.label(this.message, VIEW.w / 2, 604, 15, PALETTE.green, CENTER, FONT_BODY, false);
  }
};
