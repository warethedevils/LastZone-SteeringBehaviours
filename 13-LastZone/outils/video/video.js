// Réalisateur de la vidéo de présentation (1 min 50) : joue une visite guidée complète du jeu
// dans le navigateur — lobby, menu d'aide, bus, vue 3D, combat, faune, ordres d'escouade,
// réanimation, véhicule, Labo des comportements, onglet Cerveaux — avec des sous-titres,
// et l'enregistre (image + ambiance sonore) en .mp4 (ou .webm) via MediaRecorder.
//
// Utilisation : lancer `node serve.js`, ouvrir http://localhost:8080/?video puis taper dans la
// console du navigateur :  Video.start()
// Le fichier est écrit dans video/last-zone-presentation.webm (voir serve.js).
//
// Le « joueur » est piloté par l'IA du jeu (mode autoplay) : on voit un vrai match, filmé à la
// première personne ; le réalisateur ne fait que mettre en scène (placer un ennemi, un loup,
// donner un ordre…). Ce fichier n'est chargé que si l'adresse contient ?video.

const Video = {
  W: 1280,
  H: 720,
  fps: 30,
  running: false,
  status: 'prêt',
  t: 0,
  sceneIndex: -1,
  sceneStart: 0,
  caption: '',
  captionT: 0,
  saved: null,
  chunks: [],
  voiceDir: '/video/brut/voix',      // segments .wav générés par outils/video/voix.ps1
  voiceBuffers: [],
  voiceQueue: [],
  voiceBusyUntil: 0,
  title: false,
  endCard: false,

  // ---------- Utilitaires de mise en scène ----------

  idleInput() { return { move: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, fire: false, firePressed: false, sprint: false }; },

  player() { return match && match.joueur; },

  place(f, x, y) { f.pos.set(x, y); f.vel.set(0, 0); },

  say(text) { this.caption = text; this.captionT = 0; },

  // Un ennemi (hors de l'équipe du joueur) posé au sol, le plus proche du joueur
  enemy() {
    const p = this.player();
    const list = match.fighters.filter(f => f !== p && f.alive && f.phase === 'sol' && f.team !== p.team);
    list.sort((a, b) => p5.Vector.dist(a.pos, p.pos) - p5.Vector.dist(b.pos, p.pos));
    return list[0] || null;
  },

  mate() {
    const p = this.player();
    return match.fighters.find(f => f !== p && f.alive && f.team === p.team) || null;
  },

  ahead(distance, side = 0) {
    const p = this.player();
    const a = p.aim;
    return {
      x: p.pos.x + Math.cos(a) * distance - Math.sin(a) * side,
      y: p.pos.y + Math.sin(a) * distance + Math.cos(a) * side
    };
  },

  // Point libre de tout obstacle près de (x, y)
  freeNear(x, y) {
    for (let r = 0; r < 400; r += 40) {
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (match.carte.isFree(px, py, 40, 10)) return { x: px, y: py };
      }
    }
    return { x, y };
  },

  // Grand espace dégagé (sans arbre, rocher ni bâtiment) : une mise en scène lisible
  openSpot() {
    const c = match.carte;
    for (const radius of [320, 260, 200, 150]) {
      for (let i = 0; i < 500; i++) {
        const a = random(TWO_PI);
        const d = random(150, 900);
        const x = c.cx + Math.cos(a) * d;
        const y = c.cy + Math.sin(a) * d;
        if (c.isFree(x, y, radius, 10)) return { x, y };
      }
    }
    return this.freeNear(c.cx, c.cy);
  },

  // Téléporte le joueur (et son équipier) dans un espace dégagé
  moveToOpen() {
    const p = this.player();
    const s = this.openSpot();
    this.place(p, s.x, s.y);
    const mate = this.mate();
    if (mate) this.place(mate, s.x - 60, s.y + 40);
  },

  heal(f) { f.hp = 100; f.shield = 100; f.invulnerable = 1e9; },

  // ---------- Scénario ----------

  scenes() {
    const V = this;
    return [
      { // 1. Lobby
        dur: 7,
        enter() { leaveMatchSafe(); Lobby.tab = 'jouer'; V.title = true; V.say('LAST ZONE — un battle royale où tout se déplace par steering behaviors'); },
        tick(t) { if (t > 3.5 && V.caption.startsWith('LAST')) V.say('Joueurs, animaux, projectiles : tout est un Vehicle'); }
      },
      { // 2. Réglages : duos + vue 3D
        dur: 5,
        enter() {
          const s = profil.data.settings;
          s.teamSize = 2; s.camera = 'joueur'; s.fighters = 24; s.championDuel = false;
          V.say('Mode Duos · vue 3D à la première personne');
        }
      },
      { // 3. Menu d'aide
        dur: 10,
        enter() { showHelp = true; V.say('Menu d\'aide (touche H) : toutes les commandes et conseils'); },
        leave() { showHelp = false; }
      },
      { // 4. Bus
        dur: 24,
        until: () => match && match.joueur.phase === 'sol',
        enter() {
          profil.data.settings.tutorielFini = true;
          startMatch({ autoplay: true });
          simSpeed = 2.5;
          V.say('Le bus de combat survole l\'île : chacun choisit sa zone d\'atterrissage');
        },
        tick(t) {
          const p = V.player();
          if (p.phase === 'chute') { simSpeed = 1.6; V.say('Chute libre, puis atterrissage'); }
        }
      },
      { // 5. Vue 3D et combat
        dur: 13,
        enter() {
          simSpeed = 1;
          const p = V.player();
          V.moveToOpen();
          p.calmTime = 0; p.groundTime = 99; V.heal(p);
          p.inventory[1] = makeWeapon('fusil', 3); p.inventory[1].mag = 30; p.ammo.moyenne = 200; p.select(1);
          V.say('Vue 3D : les bots esquivent (sidestep), visent à l\'interception (leadPoint) et évitent les obstacles (avoid)');
          V.stageEnemy();
        },
        tick(t) { if (Math.floor(t * 2) % 14 === 0 && V.enemy() && p5.Vector.dist(V.enemy().pos, V.player().pos) > 520) V.stageEnemy(); }
      },
      { // 6. Faune
        dur: 14,
        enter() {
          V.say('Faune : cerfs en harde (evade), loup qui poursuit (pursue), corbeaux en bande qui encerclent les combats');
          V.stageFauna();
        },
        tick(t) { if (t > 7) V.say('Les corbeaux qui tournent signalent un combat : ils apparaissent sur la minimap'); }
      },
      { // 7. Équipe : ordres + réanimation
        dur: 17,
        enter() {
          V.say('Mode équipe : T donne des ordres — « Suivez-moi » (boids : cohésion, alignement, séparation)');
          V.stageTeam();
          match.ordre = 'libre';
          match.cycleOrder();
        },
        tick(t) {
          if (t > 5.5 && match.ordre === 'suivre') { match.cycleOrder(); V.say('« Tenez la position » : un cercle autour d\'un point (arrive)'); }
          if (t > 9 && match.ordre === 'tenir') { match.cycleOrder(); V.say('« À l\'attaque ! » : seek vers l\'ennemi le plus proche'); }
          if (t > 12.5 && !V.knocked) {
            V.knocked = true;
            const mate = V.mate();
            if (mate) { match.ordre = 'libre'; match.knock(mate, null); V.say('Un coéquipier à terre : on le relève (E maintenu)'); }
          }
        }
      },
      { // 8. Véhicule : caméra de poursuite, la jeep roule en rond dans un espace dégagé
        dur: 13,
        enter() { V.say('Véhicules : la jeep (3 places) et le quad — conduire, c\'est aussi du steering (vitesse désirée, force limitée)'); V.stageVehicle(); },
        tick() { const car = V.player() && V.player().vehicle; if (car) car.hp = car.maxHp; },   // la mise en scène ne doit pas détruire la jeep
        leave() { V.unstageVehicle(); }
      },
      { // 9. Labo des comportements
        dur: 17,
        enter() {
          V.say('Labo des comportements (touche C) : chaque flèche est la force d\'un comportement de base');
          V.stageLab();
        },
        tick(t, dt) {
          V.labTick(t);
        },
        leave() { behaviorLab = false; }
      },
      { // 10. Cerveaux
        dur: 10,
        enter() { leaveMatchSafe(); Lobby.tab = 'cerveaux'; V.say('Onglet Cerveaux : évolution des bots, champion, export / import, défi du champion'); }
      },
      { // 11. Remerciements
        dur: 5.5,
        enter() { Lobby.tab = 'jouer'; V.say('Merci ! Jeu en ligne et dépôt GitHub : voir le README'); }
      },
      { // 12. Écran de fin (liens)
        dur: 5,
        enter() { V.caption = ''; V.endCard = true; },
        leave() { V.endCard = false; }
      }
    ];
  },

  stageEnemy() {
    const p = this.player();
    const e = this.enemy();
    if (!e) return;
    const spot = this.freeNear(...Object.values(this.ahead(260)));
    this.place(e, spot.x, spot.y);
    e.aim = p.aim + Math.PI;
    e.invulnerable = 0; e.hp = 100;
  },

  stageFauna() {
    const p = this.player();
    this.moveToOpen();
    this.heal(p);
    p.calmTime = 0;
    const deer = match.cerfs;
    if (deer.length) {
      const herdSpot = this.freeNear(p.pos.x + Math.cos(p.aim) * 340, p.pos.y + Math.sin(p.aim) * 340);
      deer.slice(0, 6).forEach((d, i) => this.place(d, herdSpot.x + (i % 3) * 30, herdSpot.y + Math.floor(i / 3) * 30));
    }
    const wolf = match.loups[0];
    if (wolf) {
      const spot = this.freeNear(p.pos.x - Math.cos(p.aim) * 320, p.pos.y - Math.sin(p.aim) * 320);
      this.place(wolf, spot.x, spot.y);
      wolf.state = 'chasse'; wolf.prey = p; wolf.thinkTimer = 0.4; wolf.howled = false;
    }
    const crows = match.corbeaux;
    const fight = this.ahead(330, 120);
    crows.forEach((c, i) => this.place(c, fight.x + Math.cos(i) * 90, fight.y + Math.sin(i) * 90));
    match.noteCombat(createVector(fight.x, fight.y));
    this.keepCombat = fight;
  },

  stageTeam() {
    const p = this.player();
    this.moveToOpen();
    this.heal(p);
    this.knocked = false;
    const mate = this.mate();
    if (mate) { const s = this.freeNear(p.pos.x + 220, p.pos.y + 60); this.place(mate, s.x, s.y); this.heal(mate); mate.calmTime = 0; }
  },

  stageVehicle() {
    const p = this.player();
    this.moveToOpen();
    const spot = this.freeNear(p.pos.x + Math.cos(p.aim) * 90, p.pos.y + Math.sin(p.aim) * 90);
    let car = match.vehicules.find(v => v.type === 'jeep' && !v.dead && v.freeSeat >= 2);
    if (!car) { car = new Vehicule(spot.x, spot.y, 'jeep'); match.vehicules.push(car); }
    this.place(car, spot.x, spot.y);
    car.angle = p.aim;
    p.vehicleCooldown = 0;
    p.groundTime = 99;
    match.boardVehicle(p, car);
    const mate = this.mate();
    if (mate) { mate.pos.set(car.pos.x, car.pos.y); match.boardVehicle(mate, car); }
    // le « conducteur » suit des points de passage sur un cercle : il ne descend pas au cœur de la zone
    this.driveCenter = { x: car.pos.x, y: car.pos.y };
    this.driveAngle = p.aim;
    const V = this;
    p.thinkInVehicle = function (world) {
      const veh = this.vehicle;
      if (!veh) return [];
      let dest = { x: V.driveCenter.x + Math.cos(V.driveAngle) * 170, y: V.driveCenter.y + Math.sin(V.driveAngle) * 170 };
      if (Math.hypot(veh.pos.x - dest.x, veh.pos.y - dest.y) < 80) {
        V.driveAngle += 0.8;
        dest = { x: V.driveCenter.x + Math.cos(V.driveAngle) * 170, y: V.driveCenter.y + Math.sin(V.driveAngle) * 170 };
      }
      this.driveContext = {
        ai: true,
        destination: createVector(dest.x, dest.y),
        obstacles: world.grid.query(veh.pos.x, veh.pos.y, 190).map(o => ({ pos: o.pos, r: o.r }))
      };
      this.exitRequest = false;
      return [];
    };
  },

  unstageVehicle() {
    const p = this.player();
    if (!p) return;
    delete p.thinkInVehicle;
    if (p.vehicle) match.leaveVehicle(p);
  },

  stageLab() {
    this.labClock = 0;
    this.labEntries = null;
    behaviorLab = true;
    LaboComportements.reset();
  },

  // Anime le Labo : change des poids et des activations, puis « applique à tous » et sauvegarde
  labTick(t) {
    const bot = LaboComportements.selected;
    if (!bot) return;
    if (!this.labEntries) this.labEntries = bot.behaviors.names();
    const names = this.labEntries;
    if (t > 3 && t < 6) {
      const name = names.find(n => n !== 'avoid') || names[0];
      if (name) Reglages.tweak(bot, name, { weight: 0.4 + (t - 3) * 1.2 });
    }
    if (t > 6.5 && t < 8) { const name = names[1]; if (name) Reglages.tweak(bot, name, { enabled: false }); }
    if (t > 8 && t < 9.5) { const name = names[1]; if (name) Reglages.tweak(bot, name, { enabled: true }); }
    if (t > 10 && !this.labApplied) {
      this.labApplied = true;
      Reglages.applyAll(match.fighters.filter(f => f instanceof Bot), Reglages.snapshot(bot));
      LaboComportements.say('Réglages appliqués à tous les bots');
      V_say(this);
    }
    if (t > 13 && !this.labSaved) {
      this.labSaved = true;
      Reglages.saveSlot(safeStorage(), 0, 'Mon style', bot);
      LaboComportements.say('Sauvé dans l\'emplacement 1');
    }
    // la simulation avance au ralenti derrière le Labo pour que les flèches vivent
    match.step(CONFIG.step, this.idleInput());
    match.events = [];
  },

  // ---------- Dessin des sous-titres ----------

  // Titre d'ouverture (3 s) et écran de fin avec les liens : dessinés par le jeu, sans montage externe
  drawOverlays() {
    if (this.title && this.t < 3.8) {
      const a = Math.min(1, this.t / 0.6, (3.8 - this.t) / 0.6);
      push();
      translate(view.ox, view.oy);
      scale(view.scale);
      textFont(FONT_TITLE);
      textAlign(CENTER, CENTER);
      textSize(110);
      fill(16, 24, 64, 230 * a);
      text('LAST ZONE', VIEW.w / 2 + 5, 200 + 5);
      fill(255, 214, 56, 255 * a);
      text('LAST ZONE', VIEW.w / 2, 200);
      pop();
    }
    if (this.endCard) {
      const e = Math.min(1, (this.t - this.sceneStart) / 0.8);
      push();
      translate(view.ox, view.oy);
      scale(view.scale);
      noStroke();
      fill(5, 10, 30, 255 * e);
      rect(0, 0, VIEW.w, VIEW.h);
      textAlign(CENTER, CENTER);
      textFont(FONT_TITLE);
      textSize(120);
      fill(255, 214, 56, 255 * e);
      text('LAST ZONE', VIEW.w / 2, 190);
      textFont(FONT_BODY);
      textStyle(BOLD);
      textSize(34);
      fill(255, 255, 255, 255 * e);
      text('Battle royale à steering behaviors — tout est un Vehicle', VIEW.w / 2, 300);
      textStyle(NORMAL);
      textSize(28);
      fill(155, 208, 255, 255 * e);
      text('Jeu en ligne : warethedevils.github.io/LastZone-SteeringBehaviours', VIEW.w / 2, 390);
      text('Code : github.com/warethedevils/LastZone-SteeringBehaviours', VIEW.w / 2, 440);
      textSize(24);
      fill(200, 210, 240, 255 * e);
      text('Fait avec Claude Code (application Claude) — modèle Claude Sonnet 5.5', VIEW.w / 2, 530);
      pop();
    }
  },

  // ---------- Voix off : jouée dans le jeu, donc enregistrée avec l'image ----------

  async loadVoices() {
    this.voiceBuffers = [];
    this.voiceQueue = [];
    this.voiceBusyUntil = 0;
    if (!sons.ctx) return false;
    if (sons.ctx.state === 'suspended') await sons.ctx.resume();
    for (let i = 1; i <= 11; i++) {
      const res = await fetch(this.voiceDir + '/segment' + String(i).padStart(2, '0') + '.wav');
      if (!res.ok) return false;
      this.voiceBuffers.push(await sons.ctx.decodeAudioData(await res.arrayBuffer()));
    }
    this.voiceGain = sons.ctx.createGain();
    this.voiceGain.gain.value = 1.6;
    this.voiceGain.connect(sons.master);
    return true;
  },

  queueVoice(index) {
    if (this.voiceBuffers[index]) this.voiceQueue.push(index);
  },

  // Une voix à la fois : si la scène précédente a débordé, la suivante attend la fin
  updateVoice() {
    if (this.voiceQueue.length === 0 || !sons.ctx) return;
    const now = sons.ctx.currentTime;
    if (now < this.voiceBusyUntil - 0.05) return;
    const index = this.voiceQueue.shift();
    const buffer = this.voiceBuffers[index];
    const source = sons.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.voiceGain);
    const begin = Math.max(now + 0.3, this.voiceBusyUntil);
    source.start(begin);
    this.voiceBusyUntil = begin + buffer.duration + 0.25;
  },

  drawCaption() {
    if (!this.caption) return;
    this.captionT += deltaTime / 1000;
    const alpha = Math.min(1, this.captionT * 4);
    push();
    translate(view.ox, view.oy);
    scale(view.scale);
    noStroke();
    fill(6, 10, 30, 200 * alpha);
    rect(0, VIEW.h - 96, VIEW.w, 96);
    fill(255, 214, 56, 255 * alpha);
    rect(0, VIEW.h - 96, VIEW.w, 3);
    textFont(FONT_BODY);
    textStyle(BOLD);
    textSize(27);
    textAlign(CENTER, CENTER);
    fill(0, 0, 0, 180 * alpha);
    text(this.caption, 42, VIEW.h - 90, 940, 84);
    fill(255, 255, 255, 255 * alpha);
    text(this.caption, 40, VIEW.h - 92, 940, 84);
    textStyle(NORMAL);
    // badge
    textAlign(LEFT, TOP);
    textFont(FONT_TITLE);
    textSize(18);
    fill(255, 214, 56, 230);
    text('LAST ZONE', 40, VIEW.h - 122);
    pop();
  },

  // Joue quelques vrais matchs (bots seuls) pour que les courbes d'évolution du lobby contiennent de vraies données
  async prepare(count = 4) {
    this.status = 'préparation des courbes';
    for (let i = 0; i < count; i++) {
      const m = new Match({ autoplay: true, fighters: 12, evolution });
      let steps = 0;
      while (m.state !== 'fin' && steps < 60 * 60 * 8) {
        for (let k = 0; k < 900 && m.state !== 'fin'; k++) { m.step(1 / 60, null); steps++; }
        m.events = [];
        await new Promise(r => setTimeout(r, 0));
      }
      this.status = 'préparation ' + (i + 1) + '/' + count;
    }
    evolution.breed(12);
    this.status = 'prêt';
  },

  // ---------- Boucle ----------

  async start(name = 'last-zone-presentation', limit = null) {
    if (this.running) return;
    this.running = true;
    this.status = 'préparation';
    const canvas = document.querySelector('canvas');
    noLoop();
    pixelDensity(1);
    resizeCanvas(this.W, this.H);
    computeView();
    const saved = { settings: JSON.stringify(profil.data.settings) };
    profil.data.settings.tutorielFini = true;
    sons.unlock();
    // flux : image du canvas + ambiance sonore du jeu
    const voices = await this.loadVoices();
    this.status = voices ? 'voix chargées' : 'voix absentes (vidéo sans voix off)';
    const stream = canvas.captureStream(this.fps);
    const audio = sons.recordingStream && sons.recordingStream();
    if (audio) for (const track of audio.getAudioTracks()) stream.addTrack(track);
    // MP4 (H.264 + AAC) d'abord : lisible partout et acceptée par les outils de montage
    const mime = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    this.extension = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3200000 });
    this.recorder.ondataavailable = e => { if (e.data && e.data.size > 0) this.chunks.push(e.data); };
    this.recorder.start(1000);
    // second enregistrement en WebM (VP9 + Opus), en secours : même image, même son
    this.chunks2 = [];
    this.recorder2 = null;
    const mime2 = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
    if (mime2 && this.extension === 'mp4') {
      this.recorder2 = new MediaRecorder(stream, { mimeType: mime2, videoBitsPerSecond: 3200000, audioBitsPerSecond: 128000 });
      this.recorder2.ondataavailable = e => { if (e.data && e.data.size > 0) this.chunks2.push(e.data); };
      this.recorder2.start(1000);
    }
    this.recStart = performance.now();
    this.starts = [];

    const scenes = this.scenes().slice(0, limit || 99);
    this.t = 0;
    this.sceneIndex = -1;
    let last = performance.now();
    this.status = 'enregistrement';
    const frame = () => {
      if (!this.running) return;
      const now = performance.now();
      const dt = Math.min(100, Math.max(5, now - last));
      last = now;
      window.deltaTime = dt;
      this.t = (now - this.recStart) / 1000;   // temps réel : les scènes durent ce qu'elles doivent, même si des images sont perdues
      this.advance(scenes);
      try {
        if (match && match.joueur && screen === 'match') {
          const p = match.joueur;
          // en véhicule, la caméra de poursuite suit le cap du véhicule ; sinon le regard du joueur
          const ref = p.phase === 'vehicule' && p.vehicle ? p.vehicle.angle : p.aim;
          const diff = Math.atan2(Math.sin(ref - viewYaw), Math.cos(ref - viewYaw));
          viewYaw += diff * 0.12;
          if (p.alive) p.invulnerable = Math.max(p.invulnerable, 5);
        }
        draw();
        this.drawCaption();
        this.drawOverlays();
        this.updateVoice();
      } catch (e) {
        this.status = 'erreur : ' + e.message;
        console.error(e);
      }
      if (this.sceneIndex >= scenes.length) return this.finish(name, saved);
      setTimeout(frame, Math.max(0, 1000 / this.fps - (performance.now() - now)));
    };
    frame();
  },

  advance(scenes) {
    const current = scenes[this.sceneIndex];
    const elapsed = this.t - this.sceneStart;
    const over = current && (elapsed >= current.dur || (current.until && elapsed > 4 && current.until()));
    if (current && !over) { if (current.tick) current.tick(elapsed, deltaTime / 1000); return; }
    if (current && current.leave) current.leave();
    this.sceneIndex++;
    this.sceneStart = this.t;
    this.starts.push(Number(((performance.now() - this.recStart) / 1000).toFixed(2)));
    const next = scenes[this.sceneIndex];
    if (this.sceneIndex < 11) this.queueVoice(this.sceneIndex);
    if (next && next.enter) next.enter();
  },

  finish(name, saved) {
    this.status = 'sauvegarde';
    this.totalReal = Number(((performance.now() - this.recStart) / 1000).toFixed(2));
    this.recorder.onstop = async () => {
      const blob = new Blob(this.chunks, { type: this.extension === 'mp4' ? 'video/mp4' : 'video/webm' });
      try {
        const res = await fetch('/__enregistrer/' + name + '.' + this.extension, { method: 'POST', body: blob });
        this.saved = await res.json();
        if (this.recorder2) {
          await new Promise(r => { this.recorder2.onstop = r; this.recorder2.stop(); });
          const res2 = await fetch('/__enregistrer/' + name + '-secours.webm', { method: 'POST', body: new Blob(this.chunks2, { type: 'video/webm' }) });
          this.saved2 = await res2.json();
        }
        this.status = 'terminé';
      } catch (e) {
        this.status = 'échec de l\'envoi : ' + e.message;
      }
      profil.data.settings = JSON.parse(saved.settings);
      profil.save();
      this.running = false;
      leaveMatchSafe();
      loop();
    };
    this.recorder.stop();
  }
};

// Le rendu hors ligne (image par image) est dans studio.js
{
  const script = document.createElement('script');
  script.src = 'outils/video/studio.js';
  document.head.appendChild(script);
}

function leaveMatchSafe() {
  if (screen === 'match') leaveMatch();
  behaviorLab = false;
  showHelp = false;
}

function V_say() { /* les messages du Labo s'affichent dans le Labo lui-même */ }
