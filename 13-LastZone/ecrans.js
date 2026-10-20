// Écrans de jeu : élimination, résultats de fin de match (victoire / défaite,
// XP, niveau, défis), pause, carte complète. Rendu et clics uniquement.

const Ecrans = {
  t: 0,
  confetti: [],
  shownXp: 0,

  reset() {
    this.t = 0;
    this.confetti = [];
    this.shownXp = 0;
  },

  dim(alpha = 160) {
    push();
    noStroke();
    fill(4, 6, 24, alpha);
    rect(0, 0, VIEW.w, VIEW.h);
    pop();
  },

  formatTime(seconds) {
    const s = Math.floor(seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },

  // ---------- Élimination (le match continue) ----------

  death(match, actions) {
    this.t += 1 / 60;
    this.dim(120);
    const p = match.joueur;
    Ui.panel(390, 170, 500, 300, { alpha: 235 });
    Ui.title('ÉLIMINÉ', 640, 226, 64, PALETTE.red);
    Ui.title(`#${p.placement}`, 640, 300, 74, PALETTE.white);
    Ui.label(`sur ${match.fighters.length} combattants`, 640, 346, 18, PALETTE.dim, CENTER);
    const by = p.killedBy ? `Éliminé par ${p.killedBy}` : 'Emporté par la tempête';
    Ui.label(by, 640, 384, 20, PALETTE.white, CENTER);
    if (Ui.button('spectate', 420, 410, 210, 48, 'SPECTATEUR', 'secondary', { size: 22 })) actions.spectate();
    if (Ui.button('leave', 650, 410, 210, 48, 'QUITTER', 'danger', { size: 22 })) actions.finish();
  },

  // ---------- Résultats ----------

  // reward : retour de Profil.addResult ; actions : { replay, lobby }
  results(match, reward, profil, actions) {
    this.t += 1 / 60;
    const r = match.result;
    const won = r.won;
    this.dim(won ? 120 : 175);
    if (won) this.drawConfetti();
    Ui.panel(250, 40, 780, 640, { alpha: 240 });
    if (won) {
      const pulse = 1 + 0.03 * Math.sin(this.t * 5);
      push();
      translate(640, 110);
      scale(pulse);
      Ui.title('VICTOIRE ROYALE', 0, 0, 78, PALETTE.yellow);
      pop();
    } else {
      Ui.title(`#${r.placement}`, 640, 98, 92, PALETTE.white);
      Ui.label(`sur ${r.fighters} combattants`, 640, 160, 20, PALETTE.dim, CENTER);
    }
    // statistiques du match
    const stats = [
      ['ÉLIMINATIONS', r.kills], ['DÉGÂTS', r.damage], ['SURVIE', this.formatTime(r.survival)],
      ['COFFRES', r.chests]
    ];
    stats.forEach(([name, value], i) => {
      const x = 290 + i * 180;
      Ui.panel(x, 200, 166, 92, { color: [24, 34, 82], alpha: 255, radius: 12, edgeWeight: 1.5 });
      Ui.label(String(value), x + 83, 236, 38, PALETTE.yellow, CENTER, FONT_TITLE, false);
      Ui.label(name, x + 83, 274, 13, PALETTE.dim, CENTER, FONT_BODY, false);
    });
    // XP
    this.shownXp = Math.min(reward.xp, this.shownXp + Math.max(1, reward.xp / 90));
    Ui.label('EXPÉRIENCE', 290, 330, 22, PALETTE.yellow, LEFT, FONT_TITLE);
    Ui.label(`+${Math.round(this.shownXp)} XP`, 990, 330, 30, PALETTE.white, RIGHT, FONT_TITLE);
    const progress = profil.levelProgress;
    Ui.bar(290, 352, 700, 20, progress.ratio, PALETTE.yellow);
    Ui.label(`Niveau ${profil.level}`, 290, 392, 20, PALETTE.white, LEFT, FONT_TITLE, false);
    Ui.label(`${progress.current} / ${progress.needed}`, 990, 392, 16, PALETTE.dim, RIGHT, FONT_BODY, false);
    if (reward.levelAfter > reward.levelBefore) {
      const pulse = 0.7 + 0.3 * Math.sin(this.t * 6);
      Ui.title(`NIVEAU ${reward.levelAfter} !`, 640, 436, 36, [255, 214, 56, 255 * pulse]);
      const unlocked = SKINS.filter(s => s.level > reward.levelBefore && s.level <= reward.levelAfter);
      if (unlocked.length) Ui.label('Nouvelle tenue : ' + unlocked.map(s => s.nom).join(', '), 640, 468, 18, PALETTE.green, CENTER);
    }
    // défis accomplis
    if (reward.completed.length > 0) {
      Ui.label('DÉFIS ACCOMPLIS', 290, 510, 20, PALETTE.green, LEFT, FONT_TITLE);
      reward.completed.slice(0, 3).forEach((d, i) => {
        Ui.label(`✔ ${d.texte}  (+${d.xp} XP)`, 290, 540 + i * 26, 17, PALETTE.white, LEFT, FONT_BODY, false);
      });
    } else {
      Ui.label('Aucun défi accompli cette fois-ci.', 290, 520, 17, PALETTE.dim, LEFT, FONT_BODY, false);
    }
    if (Ui.button('replay', 300, 604, 330, 56, 'REJOUER', 'primary', { size: 30 })) actions.replay();
    if (Ui.button('lobby', 650, 604, 330, 56, 'RETOUR AU LOBBY', 'secondary', { size: 24 })) actions.lobby();
  },

  drawConfetti() {
    if (this.confetti.length < 140 && frameCount % 2 === 0) {
      this.confetti.push({
        x: random(VIEW.w), y: -10, vx: random(-1, 1), vy: random(2, 5), a: random(TWO_PI), va: random(-0.2, 0.2),
        c: [[255, 214, 56], [255, 90, 120], [90, 200, 255], [120, 255, 150], [190, 110, 255]][Math.floor(random(5))]
      });
    }
    push();
    noStroke();
    for (const p of this.confetti) {
      p.x += p.vx; p.y += p.vy; p.a += p.va;
      push();
      translate(p.x, p.y);
      rotate(p.a);
      fill(...p.c);
      rect(-5, -3, 10, 6);
      pop();
    }
    pop();
    this.confetti = this.confetti.filter(p => p.y < VIEW.h + 20);
  },

  // ---------- Aide : toutes les touches ----------

  aide(onClose) {
    this.dim(210);
    Ui.panel(150, 40, 980, 640, { alpha: 248, title: 'TOUCHES ET CONSEILS' });
    if (Ui.button('aide-close', 1010, 50, 100, 34, 'FERMER', 'danger', { size: 16 })) onClose();
    const left = [
      ['Z Q S D / W A S D', 'Se déplacer (Maj : sprinter) · au volant : accélérer, tourner'],
      ['Souris', 'Viser · en vue 3D : tourner le regard (clique pour capturer)'],
      ['Clic gauche', 'Tirer, frapper à la pioche, utiliser un soin, lancer une grenade'],
      ['E', 'Ramasser · coffre · monter / descendre · maintenir : relever un coéquipier'],
      ['1 à 5 / molette', 'Changer d\'objet · R : recharger'],
      ['B ou clic droit', 'Construire un mur (10 bois, récolté sur arbres et rochers)'],
      ['G', 'Lancer une grenade jusqu\'au curseur'],
      ['Espace', 'Sauter du bus de combat']
    ];
    const right = [
      ['T', 'Ordres à l\'équipe : libre, suivez-moi, tenez la position, à l\'attaque'],
      ['V', 'Vue : 3D à la première personne ou vue de dessus'],
      ['C', 'Labo des comportements : forces, poids, sauvegardes'],
      ['M', 'Carte complète'],
      ['D · L', 'Debug (cerveau d\'un bot) · paramètres en direct'],
      ['Échap', 'Pause'],
      ['H', 'Cette page']
    ];
    const draw = (list, x, y0) => list.forEach(([key, text], i) => {
      const y = y0 + i * 52;
      Ui.panel(x, y, 150, 38, { color: [30, 44, 104], alpha: 255, radius: 8, edgeWeight: 1 });
      Ui.label(key, x + 75, y + 19, 15, PALETTE.yellow, CENTER, FONT_TITLE, false);
      Ui.label(text, x + 164, y + 19, 13, PALETTE.white, LEFT, FONT_BODY, false);
    });
    draw(left, 170, 110);
    draw(right, 650, 110);
    Ui.label('POUR GAGNER', 650, 500, 17, PALETTE.yellow, LEFT, FONT_TITLE, false);
    ['Atterris près d\'un bâtiment, ramasse une arme et des soins.', 'Reste dans la zone : la tempête violette se resserre.', 'Les corbeaux qui tournent = un combat. Les loups chassent.', 'Les bots apprennent : leur réseau de neurones évolue à chaque partie.'].forEach((t, i) => {
      Ui.label('• ' + t, 650, 532 + i * 26, 14, PALETTE.white, LEFT, FONT_BODY, false);
    });
  },

  // ---------- Pause ----------

  pause(actions, profil) {
    this.dim(190);
    Ui.panel(420, 150, 440, 420, { alpha: 240 });
    Ui.title('PAUSE', 640, 210, 60, PALETTE.white);
    if (Ui.button('resume', 470, 270, 340, 56, 'REPRENDRE', 'primary', { size: 28 })) actions.resume();
    const s = profil.data.settings;
    Ui.label('Volume', 470, 370, 17, PALETTE.dim, LEFT, FONT_BODY, false);
    const volume = Ui.slider('pause-volume', 470, 396, 260, s.volume, 0, 1, v => Math.round(v * 100) + ' %');
    if (volume !== s.volume) { s.volume = volume; actions.settings(); }
    Ui.label('Vue de la caméra (touche V)', 470, 438, 17, PALETTE.dim, LEFT, FONT_BODY, false);
    [['normal', 'NORMALE'], ['joueur', 'JOUEUR']].forEach(([id, name], i) => {
      if (Ui.button('pause-cam-' + id, 470 + i * 174, 450, 166, 36, name, s.camera === id ? 'primary' : 'ghost', { size: 17 })) {
        if (s.camera !== id) toggleCamera();
      }
    });
    if (Ui.button('quit', 470, 502, 340, 52, 'QUITTER LE MATCH', 'danger', { size: 22 })) actions.quit();
  },

  // ---------- Carte complète ----------

  map(match, terrain, spectate) {
    this.dim(190);
    const S = 640;
    const x = (VIEW.w - S) / 2, y = 40;
    const k = S / WORLD.w;
    Ui.panel(x - 14, y - 14, S + 28, S + 28, { alpha: 245 });
    push();
    translate(x, y);
    scale(k);
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(0, 0, WORLD.w, WORLD.h);
    drawingContext.clip();
    if (terrain) image(terrain, 0, 0, WORLD.w, WORLD.h);
    const storm = match.storm;
    if (match.stormStarted) {
      noStroke();
      fill(140, 60, 220, 110);
      beginShape();
      const big = 6000;
      vertex(storm.pos.x - big, storm.pos.y - big);
      vertex(storm.pos.x + big, storm.pos.y - big);
      vertex(storm.pos.x + big, storm.pos.y + big);
      vertex(storm.pos.x - big, storm.pos.y + big);
      beginContour();
      for (let i = 0; i < 80; i++) {
        const a = -(i / 80) * TWO_PI;
        vertex(storm.pos.x + Math.cos(a) * storm.r, storm.pos.y + Math.sin(a) * storm.r);
      }
      endContour();
      endShape(CLOSE);
      noFill();
      stroke(255, 255, 255, 230);
      strokeWeight(4 / k);
      circle(storm.pos.x, storm.pos.y, storm.r * 2);
      if (storm.state === 'attente' && storm.nextRadius < storm.r) {
        stroke(255, 255, 255, 170);
        strokeWeight(3 / k);
        drawingContext.setLineDash([14 / k, 10 / k]);
        circle(storm.nextCenter.x, storm.nextCenter.y, storm.nextRadius * 2);
        drawingContext.setLineDash([]);
      }
    }
    if (match.bus) {
      stroke(255, 214, 56, 200);
      strokeWeight(4 / k);
      const a = match.bus.chemin.points[0], b = match.bus.chemin.points[1];
      line(a.x, a.y, b.x, b.y);
      noStroke();
      fill(255, 214, 56);
      circle(match.bus.pos.x, match.bus.pos.y, 34 / k);
    }
    for (const d of match.largages) { noStroke(); fill(255, 170, 60); circle(d.pos.x, d.pos.y, 26 / k); }
    for (const co of match.coffres) {
      if (co.legendary && !co.opened) { noStroke(); fill(255, 215, 90); rect(co.pos.x - 6 / k, co.pos.y - 6 / k, 12 / k, 12 / k); }
    }
    const me = match.joueur.alive ? match.joueur : (spectate || match.joueur);
    noStroke();
    fill(255);
    stroke(20, 24, 60);
    strokeWeight(3 / k);
    push();
    translate(me.pos.x, me.pos.y);
    rotate(me.aim || 0);
    triangle(26 / k * 0.6, 0, -16 / k * 0.6, -14 / k * 0.6, -16 / k * 0.6, 14 / k * 0.6);
    pop();
    drawingContext.restore();
    pop();
    // noms des villes
    for (const t of match.carte.towns) {
      Ui.label(t.name, x + t.pos.x * k, y + t.pos.y * k - 18, 15, PALETTE.white, CENTER, FONT_TITLE);
    }
    Ui.label('M ou ÉCHAP pour fermer', 640, y + S + 30, 16, PALETTE.dim, CENTER);
  }
};
