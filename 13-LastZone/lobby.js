// Lobby : écran principal (onglets Jouer / Tenues / Stats / Options), niveau et
// XP, défis, aperçu du personnage, choix du mode. Rendu et clics uniquement ;
// les actions passent par l'objet `actions` fourni par le sketch.

const GENE_LABELS = {
  agressivite: 'Agressivité', prudence: 'Prudence', precision: 'Précision',
  cupidite: 'Cupidité', anticipation: 'Anticipation', reflexe: 'Réflexes'
};

const Lobby = {
  tab: 'jouer',
  t: 0,
  avatar: null,
  confirmReset: false,
  stormChoice: 1,

  // Personnage d'aperçu : un Combattant factice qui n'entre dans aucune partie
  ensureAvatar() {
    if (this.avatar) return;
    this.avatar = new Combattant(0, 0, 'apercu', SKINS[0]);
    this.avatar.inventory[1] = makeWeapon('fusil', 3);
    this.avatar.select(1);
  },

  background() {
    const ctx = drawingContext;
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW.h);
    grad.addColorStop(0, '#1b2f8f');
    grad.addColorStop(0.55, '#4a2a9a');
    grad.addColorStop(1, '#a23f8e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    push();
    noStroke();
    // rayons de lumière
    for (let i = 0; i < 7; i++) {
      const x = ((i * 230 + this.t * 24) % (VIEW.w + 400)) - 200;
      fill(255, 255, 255, 10);
      quad(x, 0, x + 70, 0, x - 260, VIEW.h, x - 330, VIEW.h);
    }
    // formes flottantes
    for (let i = 0; i < 16; i++) {
      const seed = i * 97.3;
      const x = (Math.sin(seed) * 0.5 + 0.5) * VIEW.w;
      const y = ((seed * 7 + this.t * (12 + (i % 5) * 6)) % (VIEW.h + 80)) - 40;
      fill(255, 255, 255, 18 + (i % 4) * 6);
      push();
      translate(x, VIEW.h - y);
      rotate(this.t * 0.3 + i);
      rect(-10 - i % 3 * 4, -10 - i % 3 * 4, 20 + i % 3 * 8, 20 + i % 3 * 8, 4);
      pop();
    }
    // sol lumineux
    fill(255, 255, 255, 16);
    ellipse(VIEW.w / 2, 560, 760, 130);
    fill(255, 214, 56, 26);
    ellipse(VIEW.w / 2, 560, 520, 84);
    pop();
  },

  // ---------- Composition ----------

  // profil : Profil ; evolution : Evolution ; actions : { play, settings, reset }
  draw(profil, evolution, actions) {
    this.t += 1 / 60;
    this.ensureAvatar();
    this.background();
    this.header(profil);
    if (this.tab === 'jouer') this.pageJouer(profil, evolution, actions);
    else if (this.tab === 'tenues') this.pageTenues(profil, actions);
    else if (this.tab === 'stats') this.pageStats(profil, evolution);
    else if (this.tab === 'cerveaux') this.pageCerveaux(profil, evolution, actions);
    else this.pageOptions(profil, actions);
    if (Ui.button('help', 36, 690, 130, 26, 'AIDE (H)', 'ghost', { size: 13 })) actions.help();
  },

  header(profil) {
    Ui.title('LAST ZONE', 36, 44, 46, PALETTE.yellow, LEFT);
    const tabs = [['jouer', 'JOUER'], ['tenues', 'TENUES'], ['stats', 'STATS'], ['cerveaux', 'CERVEAUX'], ['options', 'OPTIONS']];
    tabs.forEach(([id, name], i) => {
      if (Ui.button('tab-' + id, 316 + i * 124, 20, 118, 46, name, this.tab === id ? 'primary' : 'ghost', { size: id === 'cerveaux' ? 17 : 20 })) {
        this.tab = id;
        this.confirmReset = false;
      }
    });
    // niveau et XP
    const p = profil.levelProgress;
    Ui.label(profil.data.name, 940, 28, 20, PALETTE.white, LEFT, FONT_TITLE);
    Ui.bar(940, 46, 220, 12, p.ratio, PALETTE.yellow);
    Ui.label(`${p.current} / ${p.needed} XP`, 1050, 70, 13, PALETTE.dim, CENTER, FONT_BODY, false);
    push();
    noStroke();
    fill(0, 0, 0, 90);
    circle(1215, 46, 62);
    fill(...PALETTE.yellow);
    stroke(20, 24, 60);
    strokeWeight(3);
    circle(1213, 42, 58);
    pop();
    Ui.label(String(profil.level), 1213, 42, 30, [40, 28, 6], CENTER, FONT_TITLE, false);
    Ui.label('NIV.', 1213, 66, 11, PALETTE.dim, CENTER, FONT_BODY, false);
  },

  // ---------- Page JOUER ----------

  pageJouer(profil, evolution, actions) {
    // défis et historique
    Ui.panel(36, 104, 330, 580, { title: 'DÉFIS' });
    profil.challenges.forEach((d, i) => {
      const y = 140 + i * 82;
      Ui.panel(52, y, 298, 70, { color: [24, 34, 82], alpha: 255, radius: 10, edgeWeight: 1 });
      this.wrap(d.texte, 64, y + 12, 200, 16);
      Ui.chip(`+${d.xp} XP`, 64, y + 54, PALETTE.yellow, 13);
    });
    Ui.label('DERNIÈRES PARTIES', 54, 408, 17, PALETTE.yellow, LEFT, FONT_TITLE);
    const history = profil.data.history.slice(0, 6);
    if (history.length === 0) Ui.label('Aucune partie jouée.', 54, 444, 15, PALETTE.dim, LEFT, FONT_BODY, false);
    history.forEach((h, i) => {
      const y = 438 + i * 34;
      const col = h.placement === 1 ? PALETTE.yellow : h.placement <= 10 ? PALETTE.green : PALETTE.dim;
      Ui.label('#' + h.placement, 56, y, 20, col, LEFT, FONT_TITLE, false);
      Ui.label(`${h.kills} élim. · +${h.xp} XP`, 124, y, 15, PALETTE.white, LEFT, FONT_BODY, false);
    });

    // personnage
    this.avatar.skin = profil.skin;
    this.avatar.aim = Math.sin(this.t * 0.6) * 0.5 - 0.3;
    this.avatar.hitFlash = 0;
    push();
    translate(640, 380);
    scale(4.6);
    this.avatar.show(true);
    pop();
    Ui.title(profil.data.name, 640, 520, 38, PALETTE.white);
    Ui.label(`Tenue « ${profil.skin.nom} »`, 640, 556, 18, PALETTE.dim, CENTER);
    if (Ui.button('goto-tenues', 540, 586, 200, 44, 'CHANGER DE TENUE', 'ghost', { size: 18 })) this.tab = 'tenues';

    // mode de jeu
    const s = profil.data.settings;
    Ui.panel(914, 104, 330, 580, { title: 'MODE DE JEU' });
    const modeName = s.teamSize === 2 ? 'DUOS' : (s.teamSize === 4 ? 'ESCOUADES' : 'SOLO');
    Ui.label(`${modeName} · BATTLE ROYALE`, 934, 162, 20, PALETTE.white, LEFT, FONT_TITLE);
    Ui.label('Difficulté des bots', 934, 184, 15, PALETTE.dim, LEFT, FONT_BODY, false);
    [['facile', 'FACILE'], ['normal', 'NORMAL'], ['difficile', 'DIFFICILE']].forEach(([id, name], i) => {
      if (Ui.button('diff-' + id, 934 + i * 100, 198, 94, 38, name, s.difficulty === id ? 'primary' : 'ghost', { size: 15 })) {
        s.difficulty = id;
        actions.settings();
      }
    });
    Ui.label('Combattants', 934, 242, 15, PALETTE.dim, LEFT, FONT_BODY, false);
    [12, 18, 24].forEach((n, i) => {
      if (Ui.button('fighters-' + n, 934 + i * 100, 256, 94, 38, String(n), s.fighters === n ? 'primary' : 'ghost', { size: 20 })) {
        s.fighters = n;
        actions.settings();
      }
    });
    Ui.label('Tempête', 934, 300, 15, PALETTE.dim, LEFT, FONT_BODY, false);
    [[1, 'NORMALE'], [1.7, 'RAPIDE']].forEach(([v, name], i) => {
      if (Ui.button('storm-' + v, 934 + i * 150, 314, 144, 38, name, s.stormSpeed === v ? 'primary' : 'ghost', { size: 17 })) {
        s.stormSpeed = v;
        actions.settings();
      }
    });
    Ui.label('Équipes', 934, 366, 15, PALETTE.dim, LEFT, FONT_BODY, false);
    [[1, 'SOLO'], [2, 'DUOS'], [4, 'ESCOUADE']].forEach(([n, name], i) => {
      if (Ui.button('team-' + n, 934 + i * 100, 380, 94, 38, name, (s.teamSize || 1) === n ? 'primary' : 'ghost', { size: 15 })) {
        s.teamSize = n;
        actions.settings();
      }
    });
    Ui.label('Vue (touche V en jeu)', 934, 432, 15, PALETTE.dim, LEFT, FONT_BODY, false);
    [['normal', 'NORMALE'], ['joueur', 'JOUEUR']].forEach(([id, name], i) => {
      if (Ui.button('cam-' + id, 934 + i * 150, 446, 144, 38, name, s.camera === id ? 'primary' : 'ghost', { size: 17 })) {
        s.camera = id;
        actions.settings();
      }
    });
    // évolution des bots
    Ui.label('LES BOTS ÉVOLUENT', 934, 508, 17, PALETTE.yellow, LEFT, FONT_TITLE);
    Ui.label(`Génération ${evolution.generation}`, 934, 530, 15, PALETTE.white, LEFT, FONT_BODY, false);
    const avg = evolution.average();
    ['agressivite', 'precision'].forEach((name, i) => {
      const y = 556 + i * 24;
      Ui.label(GENE_LABELS[name], 934, y, 13, PALETTE.dim, LEFT, FONT_BODY, false);
      const [lo, hi] = Genome.RANGES[name];
      const value = avg[name] === undefined || (avg[name] - lo) / (hi - lo);
      Ui.bar(1034, y - 6, 190, 12, value, lerpColor(color(255, 190, 70), color(255, 70, 110), value).levels);
    });

    // bouton jouer
    const pulse = 1 + 0.03 * Math.sin(this.t * 4);
    push();
    translate(1079, 636);
    scale(pulse);
    translate(-1079, -636);
    if (Ui.button('play', 934, 604, 290, 64, 'JOUER', 'primary', { size: 40 })) actions.play();
    pop();
  },

  // ---------- Page TENUES ----------

  pageTenues(profil, actions) {
    Ui.panel(36, 104, 380, 580, { title: 'APERÇU' });
    this.avatar.skin = profil.skin;
    this.avatar.aim = this.t * 0.8;
    push();
    translate(226, 340);
    scale(5.2);
    this.avatar.show(true);
    pop();
    Ui.title(profil.skin.nom, 226, 520, 36, PALETTE.white);
    Ui.label(`Niveau ${profil.level}`, 226, 566, 18, PALETTE.dim, CENTER);

    Ui.panel(436, 104, 808, 580, { title: 'TENUES' });
    SKINS.forEach((skin, i) => {
      const col = i % 5;
      const row = Math.floor(i / 5);
      const x = 456 + col * 156;
      const y = 150 + row * 260;
      const unlocked = profil.isUnlocked(i);
      const selected = profil.data.skin === i;
      const hot = Ui.over(x, y, 146, 240);
      push();
      noStroke();
      fill(selected ? color(40, 120, 70) : color(24, 34, 82));
      stroke(...(selected ? PALETTE.green : hot && unlocked ? PALETTE.yellow : PALETTE.panelEdge));
      strokeWeight(selected ? 4 : 2);
      rect(x, y, 146, 240, 12);
      pop();
      const preview = new Combattant(0, 0, '', skin);
      preview.aim = -0.4;
      push();
      translate(x + 73, y + 100);
      scale(3.1);
      preview.show(true);
      pop();
      Ui.label(skin.nom, x + 73, y + 176, 19, unlocked ? PALETTE.white : PALETTE.dim, CENTER, FONT_TITLE, false);
      if (unlocked) {
        Ui.label(selected ? 'ÉQUIPÉE' : 'CHOISIR', x + 73, y + 208, 15, selected ? PALETTE.green : PALETTE.yellow, CENTER, FONT_BODY, false);
        if (hot && Ui.clicked) profil.selectSkin(i);
      } else {
        push();
        noStroke();
        fill(6, 10, 30, 190);
        rect(x, y, 146, 240, 12);
        pop();
        Ui.label('🔒', x + 73, y + 100, 38, PALETTE.white, CENTER, FONT_BODY, false);
        Ui.label(`Niveau ${skin.level}`, x + 73, y + 208, 16, PALETTE.dim, CENTER, FONT_BODY, false);
      }
    });
  },

  // ---------- Page STATS ----------

  // ---------- Page CERVEAUX : courbe d'apprentissage, champion, export / import ----------

  brainMessage: '',
  brainMessageT: 0,

  // Courbe simple : series = [{ points: [[x, y]...], color, label }]
  chart(x, y, w, h, series, opts = {}) {
    Ui.panel(x, y, w, h, { title: opts.title, alpha: 235 });
    const px = x + 56, py = y + 52, pw = w - 80, ph = h - 96;
    const pts = series.flatMap(s => s.points);
    push();
    noStroke();
    fill(10, 16, 42, 220);
    rect(px, py, pw, ph, 8);
    pop();
    if (pts.length < 2) {
      Ui.label(opts.empty || 'Pas encore de données', px + pw / 2, py + ph / 2, 16, PALETTE.dim, CENTER, FONT_BODY, false);
      return;
    }
    let minX = Math.min(...pts.map(p => p[0])), maxX = Math.max(...pts.map(p => p[0]));
    let minY = Math.min(...pts.map(p => p[1])), maxY = Math.max(...pts.map(p => p[1]));
    if (maxX === minX) maxX = minX + 1;
    const pad = (maxY - minY) * 0.12 || 1;
    minY -= pad; maxY += pad;
    const sx = v => px + (v - minX) / (maxX - minX) * pw;
    const sy = v => py + ph - (v - minY) / (maxY - minY) * ph;
    push();
    stroke(70, 100, 190, 90);
    strokeWeight(1);
    for (let i = 0; i <= 4; i++) {
      const gy = py + ph * i / 4;
      line(px, gy, px + pw, gy);
      noStroke();
      fill(...PALETTE.dim);
      textSize(11);
      textAlign(RIGHT, CENTER);
      text((maxY - (maxY - minY) * i / 4).toFixed(1), px - 6, gy);
      stroke(70, 100, 190, 90);
    }
    noFill();
    series.forEach(s => {
      stroke(...s.color);
      strokeWeight(3);
      beginShape();
      s.points.forEach(p => vertex(sx(p[0]), sy(p[1])));
      endShape();
    });
    noStroke();
    fill(...PALETTE.dim);
    textSize(11);
    textAlign(CENTER, TOP);
    text(opts.xLabel || 'génération', px + pw / 2, py + ph + 6);
    text(String(Math.round(minX)), px, py + ph + 6);
    text(String(Math.round(maxX)), px + pw, py + ph + 6);
    pop();
    series.forEach((s, i) => {
      push();
      noStroke();
      fill(...s.color);
      rect(px + 10 + i * 190, y + h - 26, 14, 6, 3);
      pop();
      Ui.label(s.label, px + 30 + i * 190, y + h - 22, 12, PALETTE.white, LEFT, FONT_BODY, false);
    });
  },

  pageCerveaux(profil, evolution, actions) {
    const initial = typeof CERVEAU_INITIAL !== 'undefined' && CERVEAU_INITIAL ? CERVEAU_INITIAL : null;
    this.brainMessageT = Math.max(0, this.brainMessageT - 1 / 60);
    // entraînement hors ligne : classement moyen réseau vs règles (plus bas = mieux)
    const offline = initial && Array.isArray(initial.courbe) ? initial.courbe : [];
    this.chart(36, 104, 780, 290, [
      { points: offline.map(c => [c[0], c[1]]), color: PALETTE.yellow, label: 'bots à réseau de neurones' },
      { points: offline.map(c => [c[0], c[2]]), color: [255, 110, 110], label: 'bots à règles' }
    ], { title: 'ENTRAÎNEMENT HORS LIGNE · classement moyen (plus bas = mieux)', empty: 'Courbe disponible après outils/evoluer.js' });
    // évolution pendant TES parties
    const history = evolution.history || [];
    this.chart(36, 410, 780, 274, [
      { points: history.map(h => [h.g, h.avg]), color: PALETTE.green, label: 'fitness moyenne' },
      { points: history.map(h => [h.g, h.best]), color: PALETTE.yellow, label: 'meilleur bot' }
    ], { title: 'ÉVOLUTION PENDANT TES PARTIES · une génération par match', empty: 'Joue une partie : les bots évoluent à la fin de chaque match' });

    // champion
    Ui.panel(836, 104, 408, 580, { title: 'LE CHAMPION' });
    const champion = evolution.champion();
    Ui.label(`Génération ${evolution.generation}`, 856, 160, 20, PALETTE.white, LEFT, FONT_TITLE);
    if (evolution.best) Ui.label(`Record de fitness : ${evolution.best.fitness.toFixed(1)} (gén. ${evolution.best.generation})`, 856, 186, 14, PALETTE.dim, LEFT, FONT_BODY, false);
    Ui.label(`Diversité des poids : ${evolution.diversity().toFixed(3)}`, 856, 206, 14, PALETTE.dim, LEFT, FONT_BODY, false);
    if (champion) {
      Object.keys(GENE_LABELS).forEach((name, i) => {
        const y = 244 + i * 30;
        Ui.label(GENE_LABELS[name], 856, y, 14, PALETTE.dim, LEFT, FONT_BODY, false);
        const [lo, hi] = Genome.RANGES[name];
        const value = (champion.genome.genes[name] - lo) / (hi - lo);
        Ui.bar(980, y - 6, 240, 12, value, lerpColor(color(255, 190, 70), color(255, 70, 110), value).levels);
      });
    }
    if (Ui.button('brain-export', 856, 440, 176, 44, 'EXPORTER', 'secondary', { size: 18 })) actions.exportBrain();
    if (Ui.button('brain-import', 1044, 440, 176, 44, 'IMPORTER', 'secondary', { size: 18 })) actions.importBrain();
    const duel = !!profil.data.settings.championDuel;
    if (Ui.button('brain-duel', 856, 500, 364, 48, duel ? 'DÉFI DU CHAMPION : ACTIVÉ' : 'DÉFIER LE CHAMPION', duel ? 'selected' : 'primary', { size: 19 })) {
      profil.data.settings.championDuel = !duel;
      actions.settings();
    }
    Ui.label(duel ? 'Tous les bots jouent avec le champion (sans évolution).' : 'Une partie contre 23 copies du meilleur cerveau.', 856, 566, 13, PALETTE.dim, LEFT, FONT_BODY, false);
    if (!this.confirmBrainReset) {
      if (Ui.button('brain-reset', 856, 596, 364, 38, 'REPARTIR DU CERVEAU D\'ORIGINE', 'ghost', { size: 15 })) this.confirmBrainReset = true;
    } else {
      Ui.label('Effacer l\'évolution ?', 856, 606, 15, PALETTE.red, LEFT, FONT_BODY, false);
      if (Ui.button('brain-reset-yes', 1030, 590, 90, 34, 'OUI', 'danger', { size: 15 })) { actions.resetBrains(); this.confirmBrainReset = false; }
      if (Ui.button('brain-reset-no', 1128, 590, 90, 34, 'NON', 'ghost', { size: 15 })) this.confirmBrainReset = false;
    }
    if (this.brainMessageT > 0) Ui.label(this.brainMessage, 1040, 660, 14, PALETTE.green, CENTER, FONT_BODY, false);
  },

  say(text) { this.brainMessage = text; this.brainMessageT = 4; },

  pageStats(profil, evolution) {
    const d = profil.data;
    Ui.panel(36, 104, 600, 580, { title: 'CARRIÈRE' });
    const rows = [
      ['Parties jouées', d.matches],
      ['Victoires', d.wins],
      ['Taux de victoire', d.matches ? Math.round(100 * d.wins / d.matches) + ' %' : '—'],
      ['Éliminations', d.kills],
      ['Ratio élim. / partie', d.matches ? (d.kills / d.matches).toFixed(2) : '—'],
      ['Meilleur classement', d.bestPlace === 99 ? '—' : '#' + d.bestPlace],
      ['Parties dans le top 10', d.top10],
      ['Dégâts infligés', Math.round(d.damage)],
      ['Temps de jeu', Math.floor(d.timePlayed / 60) + ' min']
    ];
    rows.forEach(([name, value], i) => {
      const y = 150 + i * 50;
      if (i % 2 === 0) { push(); noStroke(); fill(255, 255, 255, 10); rect(52, y - 20, 568, 44, 8); pop(); }
      Ui.label(name, 72, y, 20, PALETTE.white, LEFT, FONT_BODY, false);
      Ui.label(String(value), 600, y, 26, PALETTE.yellow, RIGHT, FONT_TITLE, false);
    });
    Ui.label('Niveau ' + profil.level, 72, 622, 22, PALETTE.white, LEFT, FONT_TITLE);
    Ui.bar(72, 640, 540, 14, profil.levelProgress.ratio, PALETTE.yellow);

    Ui.panel(656, 104, 588, 580, { title: 'CERVEAU DES BOTS' });
    ReseauVue.schema(Cerveau.SIZES, 676, 136, 548, 150, this.t);
    const initial = typeof CERVEAU_INITIAL !== 'undefined' && CERVEAU_INITIAL ? CERVEAU_INITIAL : null;
    const info = [
      ['Architecture', Cerveau.SIZES.join(' → ') + '  (' + Cerveau.parameterCount() + ' poids)'],
      ['Origine', initial ? initial.methode + (initial.validation ? ' · imitation ' + Math.round(initial.validation * 100) + ' %' : '') : 'bots à règles'],
      ['Génération', String(evolution.generation) + (evolution.best ? '  ·  record ' + evolution.best.fitness.toFixed(1) : '')],
      ['Diversité des poids', evolution.diversity().toFixed(3)],
      ['Performance', initial && initial.avantage ? '+' + initial.avantage + ' places contre les bots à règles' : '—']
    ];
    info.forEach(([name, value], i) => {
      const y = 316 + i * 26;
      Ui.label(name, 676, y, 15, PALETTE.dim, LEFT, FONT_BODY, false);
      Ui.label(value, 1224, y, 15, PALETTE.white, RIGHT, FONT_BODY, false);
    });
    Ui.label('PERSONNALITÉ MOYENNE (évolue à chaque partie)', 676, 458, 15, PALETTE.yellow, LEFT, FONT_TITLE);
    const avg = evolution.average();
    Genome.NAMES.forEach((name, i) => {
      const y = 490 + i * 29;
      Ui.label(GENE_LABELS[name], 676, y, 16, PALETTE.white, LEFT, FONT_BODY, false);
      const [lo, hi] = Genome.RANGES[name];
      const value = (avg[name] - lo) / (hi - lo);
      Ui.bar(840, y - 7, 330, 14, value, lerpColor(color(255, 210, 80), color(255, 70, 110), value).levels);
      Ui.label(Math.round(value * 100) + '%', 1190, y, 15, PALETTE.dim, LEFT, FONT_BODY, false);
    });
    Ui.label('Active le debug (D) en match pour voir le réseau penser en direct.', 676, 672, 13, PALETTE.dim, LEFT, FONT_BODY, false);
  },

  // ---------- Page OPTIONS ----------

  pageOptions(profil, actions) {
    const s = profil.data.settings;
    Ui.panel(36, 104, 600, 580, { title: 'RÉGLAGES' });
    Ui.label('Nom du joueur', 64, 160, 17, PALETTE.dim, LEFT, FONT_BODY, false);
    Ui.textField('name', 64, 176, 320, 46, profil.data.name);
    Ui.label('Volume', 64, 270, 17, PALETTE.dim, LEFT, FONT_BODY, false);
    const volume = Ui.slider('volume', 64, 304, 340, s.volume, 0, 1, v => Math.round(v * 100) + ' %');
    if (volume !== s.volume) { s.volume = volume; actions.settings(); }
    const muted = Ui.toggle('muted', 64, 356, 'Son coupé', s.muted);
    if (muted !== s.muted) { s.muted = muted; actions.settings(); }
    Ui.label('Minimap', 64, 416, 17, PALETTE.dim, LEFT, FONT_BODY, false);
    [[1, 'NORMALE'], [1.5, 'GRANDE']].forEach(([v, name], i) => {
      if (Ui.button('mini-' + v, 64 + i * 150, 432, 144, 40, name, s.minimapZoom === v ? 'primary' : 'ghost', { size: 17 })) {
        s.minimapZoom = v;
        actions.settings();
      }
    });
    Ui.label('Données', 64, 516, 17, PALETTE.dim, LEFT, FONT_BODY, false);
    if (Ui.button('reset', 64, 534, 320, 44, this.confirmReset ? 'CONFIRMER : TOUT EFFACER' : 'RÉINITIALISER LA PROGRESSION',
      'danger', { size: 16 })) {
      if (this.confirmReset) { actions.reset(); this.confirmReset = false; } else this.confirmReset = true;
    }

    Ui.panel(656, 104, 588, 580, { title: 'COMMANDES' });
    const keys = [
      ['Z Q S D / W A S D', 'Se déplacer'], ['Souris', 'Viser'], ['Clic gauche', 'Tirer · frapper · utiliser'],
      ['Maj', 'Sprinter'], ['R', 'Recharger'], ['E', 'Ramasser · ouvrir un coffre'],
      ['1 à 5 / molette', 'Changer d\'emplacement'], ['B ou clic droit', 'Construire un mur (10 bois)'],
      ['Espace', 'Sauter du bus de combat'], ['M', 'Carte complète'], ['Échap', 'Pause'],
      ['D', 'Mode debug'], ['L', 'Labo de paramètres']
    ];
    keys.forEach(([key, what], i) => {
      const y = 152 + i * 36;
      push();
      noStroke();
      fill(255, 255, 255, 14);
      rect(676, y - 15, 190, 30, 7);
      pop();
      Ui.label(key, 771, y, 14, PALETTE.yellow, CENTER, FONT_BODY, false);
      Ui.label(what, 886, y, 16, PALETTE.white, LEFT, FONT_BODY, false);
    });
  },

  // Texte sur plusieurs lignes (pas de retour à la ligne automatique dans Ui.label)
  wrap(str, x, y, width, size) {
    push();
    textFont(FONT_BODY);
    textSize(size);
    noStroke();
    fill(...PALETTE.white);
    textAlign(LEFT, TOP);
    textLeading(size * 1.3);
    text(str, x, y, width, 200);
    pop();
  }
};
