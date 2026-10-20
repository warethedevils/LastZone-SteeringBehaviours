// Interface en match : minimap, compteurs, état de la tempête, flux
// d'éliminations, barres de vie et bouclier, barre d'objets, munitions,
// matériaux, indications contextuelles, indicateurs de dégâts, bannières.
// Rendu uniquement, en coordonnées logiques 1280 x 720.

const Hud = {
  banners: [],        // { title, sub, color, t }
  pickups: [],        // { text, color, t }
  hurts: [],          // { angle, t }
  hitFlash: 0,
  killPulse: 0,
  alertPulse: 0,

  reset() {
    this.banners = [];
    this.pickups = [];
    this.hurts = [];
    this.hitFlash = 0;
    this.killPulse = 0;
  },

  banner(title, sub = '', color = PALETTE.yellow) {
    this.banners.push({ title, sub, color, t: 0 });
    if (this.banners.length > 3) this.banners.shift();
  },

  // Traduit les événements du match en effets d'interface
  consume(match, events) {
    for (const e of events) {
      if (e.type === 'kill') {
        this.banner('ÉLIMINATION', e.victim.name, PALETTE.yellow);
        this.killPulse = 1;
      } else if (e.type === 'storm') {
        this.banner(e.phase === 0 ? 'LA TEMPÊTE APPARAÎT' : 'LA TEMPÊTE SE FORME',
          e.phase === 0 ? 'Reste dans la zone sûre' : 'Prépare-toi à bouger', PALETTE.purple);
      } else if (e.type === 'airdrop') {
        this.banner('LARGAGE EN COURS', 'Un coffre légendaire arrive', [255, 170, 60]);
      } else if (e.type === 'land') {
        this.banner('ATTERRISSAGE', 'Trouve une arme !', PALETTE.white);
      } else if (e.type === 'hurt') {
        this.hurts.push({ angle: e.angle, t: 0 });
      } else if (e.type === 'hitmarker') {
        this.hitFlash = e.killed ? 1.4 : 1;
      } else if (e.type === 'pickup') {
        this.pickups.push({ text: e.butin.label, color: e.butin.color, t: 0 });
        if (this.pickups.length > 4) this.pickups.shift();
      } else if (e.type === 'chest') {
        if (e.by === match.joueur) this.pickups.push({ text: 'Coffre ouvert', color: [255, 215, 90], t: 0 });
      }
    }
  },

  update(dt) {
    for (const b of this.banners) b.t += dt;
    this.banners = this.banners.filter(b => b.t < 2.8);
    for (const p of this.pickups) p.t += dt;
    this.pickups = this.pickups.filter(p => p.t < 2.6);
    for (const h of this.hurts) h.t += dt;
    this.hurts = this.hurts.filter(h => h.t < 1.1);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);
    this.killPulse = Math.max(0, this.killPulse - dt * 1.5);
    this.alertPulse += dt;
  },

  // ---------- Dessin principal ----------

  // match : Match ; ctx : { terrain, aimScreen, prompt, settings, dead, spectate, fps }
  draw(match, ctx) {
    this.viewRot = ctx.mapRotation || 0;
    const p = match.joueur;
    const dead = !p.alive;
    this.stormVignette(match);
    this.damageIndicators();
    this.killfeed(match);
    this.minimap(match, ctx);
    this.counters(match);
    this.stormPanel(match);
    if (!dead) {
      this.vitals(p);
      this.materials(p);
      this.hotbar(p);
      this.ammo(p);
      this.crosshair(ctx.aimScreen, p);
      if (ctx.prompt) this.prompt(ctx.prompt);
      this.phasePrompt(match, p);
    }
    if (ctx.tutorial) this.tutorial(ctx.tutorial);
    if (match.teamMode) this.teamPanel(match);
    if (!dead && p.phase === 'terre') this.downed(p);
    if (!dead && p.phase === 'vehicule') this.vehicleBar(p.vehicle);
    this.banner_draw();
    this.pickupFeed();
    if (Vehicle.debug) {
      this.debug(match, ctx.fps);
      if (ctx.observed) ReseauVue.draw(ctx.observed, 20, 262, 440, 300);
    }
  },

  // ---------- Flux d'éliminations ----------

  killfeed(match) {
    push();
    textFont(FONT_BODY);
    textAlign(LEFT, CENTER);
    textSize(15);
    const lines = match.killfeed.slice(-6);
    lines.forEach((k, i) => {
      const age = match.time - k.t;
      const alpha = constrain(255 * (6.4 - age) / 1.4, 0, 255);
      const y = 32 + i * 30;
      const w = textWidth(k.text) + 26;
      noStroke();
      fill(k.important ? color(255, 214, 56, alpha * 0.28) : color(8, 12, 34, alpha * 0.65));
      stroke(k.important ? color(255, 214, 56, alpha) : color(90, 110, 190, alpha * 0.6));
      strokeWeight(1.5);
      rect(20, y - 13, w, 26, 8);
      noStroke();
      fill(k.important ? color(255, 236, 160, alpha) : color(235, 240, 255, alpha));
      text(k.text, 33, y + 1);
    });
    pop();
  },

  // ---------- Minimap ----------

  minimap(match, ctx) {
    const S = 220;
    const cx = 1150, cy = 134;
    const zoom = (ctx.settings && ctx.settings.minimapZoom) || 1;
    const center = match.joueur.alive ? match.joueur : (ctx.spectate || match.joueur);
    const R = 700 / zoom;
    const k = (S / 2) / R;
    const c = drawingContext;
    push();
    noStroke();
    fill(0, 0, 0, 90);
    circle(cx + 3, cy + 5, S + 14);
    fill(14, 22, 54);
    circle(cx, cy, S + 10);
    c.save();
    c.beginPath();
    c.arc(cx, cy, S / 2, 0, TWO_PI);
    c.clip();
    push();
    translate(cx, cy);
    rotate(this.viewRot || 0);
    scale(k);
    translate(-center.pos.x, -center.pos.y);
    if (ctx.terrain) image(ctx.terrain, 0, 0, WORLD.w, WORLD.h);
    else { fill(60, 130, 80); rect(0, 0, WORLD.w, WORLD.h); }
    // tempête
    const storm = match.storm;
    if (match.stormStarted) {
      noStroke();
      fill(140, 60, 220, 120);
      beginShape();
      const big = 6000;
      vertex(storm.pos.x - big, storm.pos.y - big);
      vertex(storm.pos.x + big, storm.pos.y - big);
      vertex(storm.pos.x + big, storm.pos.y + big);
      vertex(storm.pos.x - big, storm.pos.y + big);
      beginContour();
      for (let i = 0; i < 64; i++) {
        const a = -(i / 64) * TWO_PI;
        vertex(storm.pos.x + Math.cos(a) * storm.r, storm.pos.y + Math.sin(a) * storm.r);
      }
      endContour();
      endShape(CLOSE);
      noFill();
      stroke(255, 255, 255, 230);
      strokeWeight(3 / k);
      circle(storm.pos.x, storm.pos.y, storm.r * 2);
      if (storm.state === 'attente' && storm.nextRadius < storm.r) {
        stroke(255, 255, 255, 150);
        strokeWeight(2 / k);
        circle(storm.nextCenter.x, storm.nextCenter.y, storm.nextRadius * 2);
      }
    }
    // largages et bus
    for (const d of match.largages) { fill(255, 170, 60); noStroke(); circle(d.pos.x, d.pos.y, 26 / k * 0.7); }
    for (const co of match.coffres) {
      if (co.legendary && !co.opened) { fill(255, 215, 90); noStroke(); rect(co.pos.x - 8 / k, co.pos.y - 8 / k, 16 / k, 16 / k); }
    }
    // corbeaux en alerte : un combat se déroule là-bas
    noStroke();
    for (const pos of match.pings) {
      const pulse = 0.5 + 0.5 * Math.sin(this.alertPulse * 5 + pos.x);
      fill(255, 70, 70, 120 + 100 * pulse);
      circle(pos.x, pos.y, (18 + 8 * pulse) / k);
      fill(20, 20, 26);
      circle(pos.x, pos.y, 8 / k);
    }
    // véhicules et coéquipiers
    noStroke();
    for (const v of match.vehicules) { fill(...v.def.color); rect(v.pos.x - 5 / k, v.pos.y - 5 / k, 10 / k, 10 / k, 2 / k); }
    if (match.teamMode) {
      for (const f of match.alive) {
        if (!match.joueur.isFriend(f) || f.phase === 'bus') continue;
        fill(f.phase === 'terre' ? color(255, 90, 90) : color(110, 235, 150));
        stroke(20, 24, 60);
        strokeWeight(2 / k);
        circle(f.pos.x, f.pos.y, 12 / k);
      }
    }
    if (match.bus) {
      fill(255, 214, 56);
      stroke(20, 24, 60);
      strokeWeight(2 / k);
      circle(match.bus.pos.x, match.bus.pos.y, 26 / k);
      stroke(255, 214, 56, 160);
      strokeWeight(3 / k);
      const a = match.bus.chemin.points[0], b = match.bus.chemin.points[1];
      line(a.x, a.y, b.x, b.y);
    }
    pop();
    c.restore();
    // joueur au centre
    const aim = center.aim || 0;
    translate(cx, cy);
    rotate(aim + (this.viewRot || 0));
    fill(255, 255, 255);
    stroke(20, 24, 60);
    strokeWeight(2);
    triangle(9, 0, -6, -6, -6, 6);
    pop();
    push();
    noFill();
    stroke(...PALETTE.panelEdge, 230);
    strokeWeight(4);
    circle(cx, cy, S + 4);
    pop();
  },

  counters(match) {
    const alive = match.teamMode ? match.teamsAlive() : match.alive.length;
    this.chip(1040, 262, '👤', String(alive), PALETTE.white, match.teamMode ? 'ÉQUIPES' : 'EN VIE');
    this.chip(1150, 262, '☠', String(match.joueur.kills), PALETTE.yellow, 'ÉLIM.', this.killPulse);
  },

  chip(x, y, icon, value, color, label, pulse = 0) {
    push();
    noStroke();
    fill(0, 0, 0, 90);
    rect(x + 2, y + 4, 100, 42, 10);
    fill(10, 14, 38, 230);
    stroke(...PALETTE.panelEdge, 200);
    strokeWeight(2);
    rect(x, y, 100, 42, 10);
    pop();
    Ui.label(icon, x + 18, y + 21, 20, color, CENTER, FONT_BODY, false);
    Ui.label(value, x + 66, y + 18 - pulse * 4, 24 + pulse * 8, color, CENTER, FONT_TITLE, false);
    Ui.label(label, x + 66, y + 37, 9, PALETTE.dim, CENTER, FONT_BODY, false);
  },

  // ---------- Conseils du tutoriel ----------

  tutorial(tip) {
    const pulse = 0.85 + 0.15 * Math.sin(this.alertPulse * 3);
    push();
    textFont(FONT_BODY);
    textSize(19);
    const w = Math.min(900, textWidth(tip.text) + 110);
    const x = 640 - w / 2;
    noStroke();
    fill(0, 0, 0, 90);
    rect(x + 3, 100, w, 52, 14);
    fill(14, 22, 58, 235);
    stroke(255, 214, 56, 255 * pulse);
    strokeWeight(2.5);
    rect(x, 96, w, 52, 14);
    pop();
    Ui.label(`CONSEIL ${tip.number}/${tip.total}`, x + 16, 112, 11, PALETTE.yellow, LEFT, FONT_TITLE, false);
    Ui.label(tip.text, 640, 132, 19, PALETTE.white, CENTER, FONT_BODY, false);
    Ui.label('Entrée : passer le tutoriel', x + w - 12, 112, 11, PALETTE.dim, RIGHT, FONT_BODY, false);
  },

  // ---------- Équipe, véhicule ----------

  // Coéquipiers : nom, vie, état (à terre, en véhicule)
  teamPanel(match) {
    const p = match.joueur;
    const mates = match.fighters.filter(f => f !== p && f.team === p.team);
    if (mates.length === 0) return;
    const x = 20, y = 232;
    Ui.panel(x, y, 230, 58 + mates.length * 40, { radius: 12, alpha: 205, title: 'ÉQUIPE' });
    const order = match.ordre;
    Ui.label(`T · ${order === 'libre' ? 'ordre : libre' : Match.ORDRES[order]}`, x + 14, y + 44, 13, order === 'libre' ? PALETTE.dim : PALETTE.yellow, LEFT, FONT_BODY, false);
    mates.forEach((f, i) => {
      const yy = y + 76 + i * 40;
      const state = !f.alive ? 'ÉLIMINÉ' : f.phase === 'terre' ? 'À TERRE' : f.phase === 'vehicule' ? 'EN VÉHICULE' : '';
      Ui.label(f.name, x + 14, yy - 6, 14, f.alive ? PALETTE.white : PALETTE.dim, LEFT, FONT_BODY, false);
      if (state) Ui.label(state, x + 216, yy - 6, 11, f.phase === 'terre' ? [255, 110, 110] : PALETTE.yellow, RIGHT, FONT_BODY, false);
      Ui.bar(x + 14, yy + 6, 202, 8, f.alive ? Math.max(0, f.hp) / (f.phase === 'terre' ? 30 : 100) : 0, f.phase === 'terre' ? [255, 90, 90] : [110, 230, 120]);
    });
  },

  // Joueur à terre : un coéquipier doit le relever avant qu'il ne saigne
  downed(p) {
    const blink = 0.65 + 0.35 * Math.sin(this.alertPulse * 7);
    Ui.title('À TERRE', 640, 160, 54, [255, 90, 90, 255 * blink]);
    Ui.label(p.reviveProgress > 0 ? `Un coéquipier te relève… ${Math.round(p.reviveProgress * 100)} %` : 'Rampe vers un coéquipier — il peut te relever en maintenant E', 640, 204, 18, PALETTE.white, CENTER);
    Ui.bar(540, 222, 200, 12, Math.max(0, p.hp) / 30, [255, 90, 90]);
  },

  // Barre d'état du véhicule conduit
  vehicleBar(veh) {
    if (!veh) return;
    const x = 440, y = 640;
    Ui.panel(x, y, 400, 54, { radius: 12, alpha: 215 });
    Ui.label(`${veh.nom.toUpperCase()} · ${veh.driver === null ? '' : veh.driver.name}`, x + 16, y + 17, 16, PALETTE.white, LEFT, FONT_TITLE, false);
    Ui.bar(x + 16, y + 34, 368, 10, Math.max(0, veh.hp) / veh.maxHp, veh.def.color);
    Ui.label(`${Math.round(veh.speed * 20)} km/h`, x + 384, y + 17, 15, PALETTE.yellow, RIGHT, FONT_BODY, false);
  },

  // ---------- Tempête ----------

  stormPanel(match) {
    const x = 440, y = 14, w = 400, h = 60;
    Ui.panel(x, y, w, h, { radius: 14, alpha: 215 });
    const storm = match.storm;
    let title, sub, ratio, color;
    if (match.bus) {
      title = 'BUS DE COMBAT';
      sub = match.joueur.phase === 'bus' ? 'ESPACE pour sauter' : 'Les autres sautent…';
      ratio = match.bus.progress;
      color = PALETTE.yellow;
    } else if (!match.stormStarted) {
      title = 'ATTERRISSAGE';
      sub = 'La tempête arrive';
      ratio = 0;
      color = PALETTE.white;
    } else if (storm.finished) {
      title = 'DERNIER CERCLE';
      sub = 'Tout est permis';
      ratio = 1;
      color = PALETTE.red;
    } else {
      const waiting = storm.state === 'attente';
      title = waiting ? 'LA TEMPÊTE SE FORME' : 'LA TEMPÊTE SE RESSERRE';
      const t = Math.ceil(storm.timeLeft);
      sub = `Phase ${storm.phaseIndex + 1}/${storm.phases.length} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      ratio = 1 - storm.timeLeft / storm.duration;
      color = waiting ? PALETTE.white : PALETTE.purple;
    }
    Ui.label(title, x + 20, y + 20, 21, color, LEFT, FONT_TITLE, false);
    Ui.label(sub, x + w - 20, y + 22, 15, PALETTE.dim, RIGHT, FONT_BODY, false);
    Ui.bar(x + 20, y + 40, w - 40, 9, ratio, color);
  },

  stormVignette(match) {
    const p = match.joueur;
    if (!p.alive || !match.stormStarted || p.phase !== 'sol' || match.storm.inside(p.pos)) return;
    const pulse = 0.5 + 0.5 * Math.sin(this.alertPulse * 6);
    push();
    noFill();
    for (let i = 0; i < 6; i++) {
      stroke(150, 50, 230, (30 + 24 * pulse) * (1 - i / 6));
      strokeWeight(42);
      rect(-20 + i * 18, -20 + i * 14, VIEW.w + 40 - i * 36, VIEW.h + 40 - i * 28, 60);
    }
    pop();
    Ui.title('TU ES DANS LA TEMPÊTE !', 640, 112, 30, PALETTE.purple);
    Ui.label(`-${match.storm.dps.toFixed(1)} PV / seconde`, 640, 142, 18, PALETTE.white, CENTER);
  },

  // ---------- Vie, bouclier, matériaux ----------

  vitals(p) {
    const x = 30, y = 634;
    Ui.panel(x - 10, y - 14, 352, 80, { radius: 14, alpha: 190, edgeWeight: 1.5 });
    Ui.bar(x, y, 332, 16, p.shield / 100, [70, 160, 255]);
    Ui.bar(x, y + 22, 332, 22, p.hp / 100, p.hp > 35 ? [90, 225, 110] : [255, 90, 90]);
    Ui.label(String(Math.ceil(p.shield)), x + 10, y + 8, 12, PALETTE.white, LEFT, FONT_TITLE, false);
    Ui.label(String(Math.ceil(p.hp)), x + 12, y + 33, 16, PALETTE.white, LEFT, FONT_TITLE, false);
    Ui.label('/ 100', x + 320, y + 33, 12, [255, 255, 255, 150], RIGHT, FONT_BODY, false);
  },

  materials(p) {
    const x = 30, y = 590;
    [['bois', '▤'], ['metal', '▦']].forEach(([type, icon], i) => {
      const bx = x + i * 112;
      push();
      noStroke();
      fill(10, 14, 38, 210);
      stroke(...MATERIAUX[type].color, 200);
      strokeWeight(2);
      rect(bx, y, 100, 32, 9);
      pop();
      Ui.label(icon, bx + 18, y + 16, 18, MATERIAUX[type].color, CENTER, FONT_BODY, false);
      Ui.label(String(Math.floor(p.mats[type])), bx + 90, y + 17, 20, PALETTE.white, RIGHT, FONT_TITLE, false);
    });
    Ui.label('B : mur (10 bois)', x + 232, y + 16, 12, PALETTE.dim, LEFT, FONT_BODY, false);
  },

  // ---------- Barre d'objets ----------

  hotbar(p) {
    const size = 68, gap = 7;
    const x0 = (VIEW.w - (5 * size + 4 * gap)) / 2 + 30;
    const y0 = 628;
    p.inventory.forEach((item, i) => {
      const x = x0 + i * (size + gap);
      const selected = p.slot === i;
      const [r, g, b] = itemColor(item);
      push();
      translate(x + size / 2, y0 + size / 2);
      if (selected) scale(1.1);
      translate(-size / 2, -size / 2);
      noStroke();
      fill(0, 0, 0, 90);
      rect(2, 5, size, size, 10);
      fill(10, 14, 38, 235);
      stroke(item ? color(r, g, b) : color(60, 74, 130));
      strokeWeight(selected ? 4 : 2.5);
      rect(0, 0, size, size, 10);
      if (item) {
        noStroke();
        fill(r, g, b, selected ? 70 : 38);
        rect(3, 3, size - 6, size - 6, 8);
      }
      pop();
      const cx = x + size / 2, cy = y0 + size / 2 - 4;
      Ui.label(String(i + 1), x + 9, y0 + 12, 12, selected ? PALETTE.yellow : PALETTE.dim, LEFT, FONT_BODY, false);
      if (!item) return;
      if (item.kind === 'pioche') Ui.label('⛏', cx, cy, 32, PALETTE.white, CENTER, FONT_BODY, false);
      else if (item.kind === 'arme') {
        Ui.label(WEAPONS[item.type].court, cx, cy, 24, [r, g, b], CENTER, FONT_TITLE, false);
        Ui.label(`${item.mag}`, x + size - 8, y0 + size - 11, 13, PALETTE.white, RIGHT, FONT_BODY, false);
      } else {
        Ui.label(SOINS[item.type].court, cx, cy, 30, [r, g, b], CENTER, FONT_BODY, false);
        Ui.label('×' + item.count, x + size - 8, y0 + size - 11, 14, PALETTE.white, RIGHT, FONT_BODY, false);
      }
    });
    // progression de l'utilisation d'un soin
    if (p.using) {
      const w = 5 * size + 4 * gap;
      Ui.bar(x0, y0 - 18, w, 9, p.using.t / p.using.total, [120, 255, 160]);
      Ui.label('UTILISATION…', x0 + w / 2, y0 - 32, 14, PALETTE.white, CENTER, FONT_TITLE, false);
    } else if (p.reloading) {
      const w = 5 * size + 4 * gap;
      const total = p.stats ? p.stats.reload : 1;
      Ui.bar(x0, y0 - 18, w, 9, 1 - p.reloadTimer / total, [255, 214, 56]);
      Ui.label('RECHARGEMENT…', x0 + w / 2, y0 - 32, 14, PALETTE.white, CENTER, FONT_TITLE, false);
    }
  },

  ammo(p) {
    const w = p.weapon;
    if (!w) return;
    const s = p.stats;
    const x = 1056, y = 628;
    Ui.panel(x, y, 190, 68, { radius: 12, alpha: 200, edgeWeight: 1.5, edge: RARITES[w.rarity].color });
    Ui.label(String(w.mag), x + 62, y + 30, 40, w.mag === 0 ? PALETTE.red : PALETTE.white, RIGHT, FONT_TITLE, false);
    Ui.label('/ ' + p.ammo[s.ammo], x + 70, y + 36, 20, MUNITIONS[s.ammo].color, LEFT, FONT_TITLE, false);
    Ui.label(WEAPONS[w.type].nom, x + 14, y + 56, 11, RARITES[w.rarity].color, LEFT, FONT_BODY, false);
  },

  // ---------- Viseur et indications ----------

  crosshair(aim, p) {
    if (!aim) return;
    const s = p.stats;
    const spread = s ? Math.max(6, s.spread * 150 + (p.cooldown > 0 ? 6 : 0)) : 6;
    push();
    translate(aim.x, aim.y);
    stroke(255, 255, 255, 230);
    strokeWeight(2.5);
    line(spread, 0, spread + 9, 0);
    line(-spread, 0, -spread - 9, 0);
    line(0, spread, 0, spread + 9);
    line(0, -spread, 0, -spread - 9);
    if (this.hitFlash > 0) {
      stroke(255, this.hitFlash > 1.2 ? 80 : 255, this.hitFlash > 1.2 ? 80 : 255, 255 * Math.min(1, this.hitFlash));
      strokeWeight(3.5);
      const d = 16;
      line(-d, -d, -d / 2, -d / 2);
      line(d, -d, d / 2, -d / 2);
      line(-d, d, -d / 2, d / 2);
      line(d, d, d / 2, d / 2);
    }
    pop();
  },

  prompt(info) {
    const x = 640, y = 520;
    push();
    textFont(FONT_BODY);
    textSize(18);
    const w = textWidth(info.text) + 90;
    noStroke();
    fill(8, 12, 34, 220);
    stroke(...info.color, 230);
    strokeWeight(2.5);
    rect(x - w / 2, y - 24, w, 48, 12);
    pop();
    push();
    noStroke();
    fill(...PALETTE.yellow);
    rect(x - w / 2 + 12, y - 15, 30, 30, 7);
    pop();
    Ui.label('E', x - w / 2 + 27, y, 22, [40, 28, 6], CENTER, FONT_TITLE, false);
    Ui.label(info.text, x - w / 2 + 54, y, 18, PALETTE.white, LEFT, FONT_BODY, false);
  },

  phasePrompt(match, p) {
    if (p.phase === 'bus') {
      const blink = 0.6 + 0.4 * Math.sin(this.alertPulse * 6);
      Ui.title('ESPACE : SAUTER', 640, 560, 40, [255, 214, 56, 255 * blink]);
      Ui.label('Le bus traverse l\'île — choisis ta zone d\'atterrissage', 640, 604, 18, PALETTE.white, CENTER);
    } else if (p.phase === 'chute') {
      Ui.title('CHUTE LIBRE', 640, 560, 34, PALETTE.white);
      Ui.label(`Atterrissage dans ${Math.max(0, p.fallTime).toFixed(1)} s · ZQSD pour te diriger`, 640, 600, 18, PALETTE.white, CENTER);
    }
  },

  pickupFeed() {
    this.pickups.forEach((p, i) => {
      const alpha = constrain(255 * (2.6 - p.t) / 0.6, 0, 255);
      const y = 560 - i * 28;
      Ui.label('+ ' + p.text, 1250, y, 16, [p.color[0], p.color[1], p.color[2], alpha], RIGHT, FONT_BODY);
    });
  },

  damageIndicators() {
    for (const h of this.hurts) {
      const alpha = 255 * (1 - h.t / 1.1);
      push();
      translate(640, 360);
      rotate(h.angle + (this.viewRot || 0));
      noFill();
      stroke(255, 60, 60, alpha);
      strokeWeight(14);
      arc(0, 0, 420, 420, -0.28, 0.28);
      pop();
    }
  },

  banner_draw() {
    this.banners.forEach((b, i) => {
      const slide = Math.min(1, b.t / 0.25);
      const fade = constrain((2.8 - b.t) / 0.5, 0, 1);
      const y = 186 + i * 78;
      push();
      translate(640 + (1 - slide) * 90, y);
      drawingContext.globalAlpha = fade * slide;
      noStroke();
      fill(8, 12, 34, 200);
      rect(-210, -30, 420, 62, 12);
      fill(...b.color);
      rect(-210, -30, 8, 62, 4);
      pop();
      push();
      drawingContext.globalAlpha = fade * slide;
      Ui.title(b.title, 640 + (1 - slide) * 90, y - 8, 34, b.color);
      if (b.sub) Ui.label(b.sub, 640 + (1 - slide) * 90, y + 20, 16, PALETTE.white, CENTER);
      pop();
    });
  },

  debug(match, fps) {
    push();
    textFont('monospace');
    textAlign(LEFT, TOP);
    textSize(12);
    fill(120, 255, 170);
    const states = {};
    for (const b of match.bots) if (b.alive) states[b.state] = (states[b.state] || 0) + 1;
    text(`DEBUG fps ${fps}  t ${match.time.toFixed(0)}s  vivants ${match.alive.length}  balles ${match.bullets.length}`
      + `  butins ${match.butins.length}  murs ${match.murs.length}  bots ${JSON.stringify(states)}`, 20, 240);
    pop();
  }
};
