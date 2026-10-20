// LAST ZONE — point d'entrée p5.js : machine d'écrans (lobby -> match -> résultats),
// entrées clavier / souris, caméra, boucle à pas fixe, rendu du monde.
// L'interface est en coordonnées logiques 1280 x 720, mises à l'échelle de la fenêtre.

let profil;
let evolution;
let sons;
let labo;
let match = null;
let terrain = null;
let screen = 'lobby';          // lobby | match
let paused = false;
let showMap = false;
let spectating = false;
let simSpeed = 1;
let reward = null;
let endTimer = 0;
let accumulator = 0;
let view = { scale: 1, ox: 0, oy: 0 };
let camera = { x: WORLD.w / 2, y: WORLD.h / 2 };
let fpsSmooth = 60;

// entrées
let viewYaw = -Math.PI / 2;     // vue joueur (premiere personne) : direction du regard (angle monde)
let viewCounter = 0;           // 0 : aucun texte a contre-tourner (la vue de dessus ne tourne plus)
let lockedDX = 0;              // mouvement de souris accumule sous verrouillage du pointeur
let pending = { order: false, grenade: false, interact: false, reload: false, build: false, jump: false, slot: null, scroll: 0, firePressed: false };
let behaviorLab = false;   // Labo des comportements (touche C)
let showHelp = false;      // page d'aide (touche H)
let uiClicked = false;
let uiReleased = false;

function safeStorage() {
  try { return window.localStorage; } catch (e) { return null; }
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(Math.min(window.devicePixelRatio || 1, 1.5));
  frameRate(60);
  computeView();
  const storage = safeStorage();
  profil = new Profil(storage);
  evolution = new Evolution(storage);
  sons = new Son();
  applySettings();
  // outil de développement : visite guidée enregistrée (outils/video/video.js), seulement avec ?video
  if (location.search.includes('video')) {
    const script = document.createElement('script');
    script.src = 'outils/video/video.js';
    document.head.appendChild(script);
  }
  labo = new Labo(document.body,
    on => { Vehicle.debug = on; },
    on => { profil.data.settings.muted = on; applySettings(); profil.save(); });
  document.addEventListener('contextmenu', e => e.preventDefault());
  // la souris tourne le regard en vue première personne (verrouillée ou non : jamais de rotation seule)
  document.addEventListener('mousemove', e => { if (screen === 'match' && cameraRotated()) lockedDX += e.movementX || 0; });
  document.addEventListener('pointerlockchange', () => {
    if (!pointerLocked() && screen === 'match' && match && match.state !== 'fin' && match.joueur.alive && cameraRotated() && !behaviorLab) paused = true;
  });
}

function applySettings() {
  const s = profil.data.settings;
  sons.volume = s.volume;
  sons.setMuted(s.muted);
  if (sons.master) sons.master.gain.value = s.muted ? 0 : s.volume;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  computeView();
}

function computeView() {
  view.scale = Math.min(width / VIEW.w, height / VIEW.h);
  view.ox = (width - VIEW.w * view.scale) / 2;
  view.oy = (height - VIEW.h * view.scale) / 2;
}

// Souris en coordonnées logiques de l'interface (0..1280, 0..720)
function mouseLogicalX() { return (mouseX - view.ox) / view.scale; }
function mouseLogicalY() { return (mouseY - view.oy) / view.scale; }

// ---------- Actions de l'interface ----------

const lobbyActions = {
  play: () => startMatch(),
  help: () => { showHelp = true; },
  exportBrain: () => {
    const json = evolution.exportJSON();
    if (!json) { Lobby.say('Aucun cerveau à exporter'); return; }
    let copied = false;
    try { if (navigator.clipboard) { navigator.clipboard.writeText(json); copied = true; } } catch (e) { /* sans effet */ }
    if (copied) Lobby.say('Cerveau copié dans le presse-papiers');
    else window.prompt('Copie ce texte (Ctrl+C) pour partager le champion :', json);
  },
  importBrain: () => {
    const text = window.prompt('Colle ici un cerveau exporté depuis LAST ZONE :');
    if (text === null) return;
    if (evolution.importJSON(text.trim())) Lobby.say('Cerveau importé : il devient la base de la population');
    else Lobby.say('Texte invalide ou cerveau incompatible');
  },
  resetBrains: () => { evolution.reset(); Lobby.say('Évolution remise à zéro'); },
  settings: () => { applySettings(); profil.save(); },
  reset: () => {
    profil.data = Profil.defaults();
    profil.fillChallenges();
    profil.save();
    evolution.generation = 1;
    evolution.population = [];
    evolution.save();
    applySettings();
  }
};

const matchActions = {
  resume: () => { paused = false; },
  settings: () => { applySettings(); profil.save(); },
  quit: () => leaveMatch(),
  spectate: () => { spectating = true; },
  finish: () => { spectating = true; simSpeed = 6; },
  replay: () => startMatch(),
  lobby: () => leaveMatch()
};

function startMatch(extra = {}) {
  sons.unlock();
  sons.click();
  const s = profil.data.settings;
  resetConfig();
  labo.refresh();
  match = new Match({
    name: profil.data.name, skin: profil.skin, difficulty: s.difficulty, fighters: s.fighters,
    evolution: s.championDuel ? null : evolution, stormSpeed: s.stormSpeed, teamSize: s.teamSize || 1,
    brains: s.championDuel ? evolution.championBrains(s.fighters) : null,
    ...extra
  });
  viewYaw = -Math.PI / 2;
  if (terrain) terrain.remove();
  terrain = createGraphics(WORLD.w * 0.5, WORLD.h * 0.5);
  terrain.pixelDensity(1);
  match.carte.renderTerrain(terrain, 0.5);
  screen = 'match';
  behaviorLab = false;
  paused = false;
  showMap = false;
  spectating = false;
  simSpeed = 1;
  reward = null;
  endTimer = 0;
  accumulator = 0;
  Hud.reset();
  Ecrans.reset();
  Tutoriel.reset();
  showHelp = false;
  camera = { x: match.bus.pos.x, y: match.bus.pos.y };
}

function leaveMatch() {
  behaviorLab = false;
  screen = 'lobby';
  match = null;
  paused = false;
  showMap = false;
  cursor(ARROW);
}

// ---------- Entrées ----------

function isTypingTarget(event) {
  const t = event && event.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
}

function mousePressed(event) {
  if (event && event.target && event.target.tagName !== 'CANVAS') return true;
  sons.unlock();
  uiClicked = true;
  if (screen === 'match' && match && match.joueur.alive && !paused && !showMap && match.state !== 'fin') {
    const button = event && event.button !== undefined ? event.button : 0;
    if (cameraRotated() && !pointerLocked()) lockPointer();
    if (button === 2) pending.build = true;
    else pending.firePressed = true;
  }
  return false;
}

function mouseReleased() {
  uiReleased = true;
  return false;
}

function mouseWheel(event) {
  if (screen === 'match' && match && match.joueur.alive && !paused) pending.scroll += event.delta > 0 ? 1 : -1;
  return false;
}

function keyPressed(event) {
  if (isTypingTarget(event)) return true;
  sons.unlock();
  // saisie du nom dans les options
  if (screen === 'lobby' && Ui.editing === 'name') {
    const next = Ui.type(profil.data.name, event.key);
    if (next !== profil.data.name) { profil.data.name = next; profil.save(); }
    return false;
  }
  const k = (key || '').toLowerCase();
  if (k === 'h' && screen === 'lobby') { showHelp = !showHelp; return false; }
  if (k === 'd' && screen === 'lobby') { Vehicle.debug = !Vehicle.debug; labo.setDebug(Vehicle.debug); return false; }
  if (screen === 'match') {
    if (k === 'd') { Vehicle.debug = !Vehicle.debug; labo.setDebug(Vehicle.debug); return false; }
    if (keyCode === ESCAPE) {
      if (showHelp) showHelp = false;
      else if (behaviorLab) behaviorLab = false;
      else if (showMap) showMap = false;
      else if (match && match.state !== 'fin' && match.joueur.alive) paused = !paused;
      return false;
    }
    if (keyCode === ENTER && !profil.data.settings.tutorielFini) { Tutoriel.skip(); profil.data.settings.tutorielFini = true; profil.save(); return false; }
    if (k === 'c' && match && match.state !== 'fin') {
      behaviorLab = !behaviorLab;
      LaboComportements.reset();
      if (behaviorLab) unlockPointer();
      return false;
    }
    if (k === 'm') { showMap = !showMap; return false; }
    if (k === 'h') { showHelp = !showHelp; if (showHelp) unlockPointer(); return false; }
    if (k === 'v') { toggleCamera(); return false; }
    if (k === 't') pending.order = true;
    else if (k === 'g') pending.grenade = true;
    else if (k === 'e') pending.interact = true;
    else if (k === 'r') pending.reload = true;
    else if (k === 'b') pending.build = true;
    else if (key === ' ') pending.jump = true;
    else if (k >= '1' && k <= '5') pending.slot = parseInt(k, 10) - 1;
    else if (k === 'f' && spectating) simSpeed = simSpeed === 1 ? 6 : 1;
  }
  if (k === 'l') labo.toggle();
  return false;
}

// Vue a la premiere personne : option « joueur », une fois au sol (dans le bus ou en chute, la vue de dessus
// sert a choisir ou atterrir)
function cameraRotated() {
  if (!match || profil.data.settings.camera !== 'joueur' || showMap) return false;
  const p = match.joueur;
  return p.alive && match.state !== 'fin' && (p.phase === 'sol' || p.phase === 'terre' || p.phase === 'vehicule');
}

function pointerLocked() {
  return !!document.pointerLockElement;
}

function lockPointer() {
  try {
    const canvas = document.querySelector('canvas');
    if (canvas && canvas.requestPointerLock && !pointerLocked()) {
      const result = canvas.requestPointerLock();
      if (result && result.catch) result.catch(() => {});
    }
  } catch (e) { /* le verrouillage est facultatif : sinon la souris pivote par ecart au centre */ }
}

function unlockPointer() {
  try { if (pointerLocked()) document.exitPointerLock(); } catch (e) { /* sans effet */ }
}

function toggleCamera() {
  const s = profil.data.settings;
  s.camera = s.camera === 'joueur' ? 'normal' : 'joueur';
  if (match) viewYaw = match.joueur.aim;
  if (s.camera !== 'joueur') unlockPointer();
  profil.save();
}

// Entrées du joueur pour un pas de simulation (les événements ponctuels sont consommés)
function currentInput() {
  const left = keyIsDown(65) || keyIsDown(81) || keyIsDown(LEFT_ARROW);
  const right = keyIsDown(68) || keyIsDown(RIGHT_ARROW);
  const up = keyIsDown(87) || keyIsDown(90) || keyIsDown(UP_ARROW);
  const down = keyIsDown(83) || keyIsDown(DOWN_ARROW);
  let aimWorld = {
    x: camera.x + (mouseLogicalX() - VIEW.w / 2),
    y: camera.y + (mouseLogicalY() - VIEW.h / 2)
  };
  const inGame = match && match.joueur.alive && !paused && !showMap && !behaviorLab && !showHelp;
  let move = inGame ? { x: (right ? 1 : 0) - (left ? 1 : 0), y: (down ? 1 : 0) - (up ? 1 : 0) } : { x: 0, y: 0 };
  if (cameraRotated()) {
    // premiere personne : la souris tourne le regard (pointeur verrouille : mouvement relatif ;
    // sinon : ecart horizontal au centre de l'ecran), ZQSD est relatif au regard (haut = devant)
    if (inGame) {
      viewYaw += lockedDX * 0.0026;
    }
    lockedDX = 0;
    const a = viewYaw + HALF_PI;
    move = { x: move.x * Math.cos(a) - move.y * Math.sin(a), y: move.x * Math.sin(a) + move.y * Math.cos(a) };
    const p = match.joueur;
    aimWorld = { x: p.pos.x + Math.cos(viewYaw) * 420, y: p.pos.y + Math.sin(viewYaw) * 420 };
  }
  const input = {
    move,
    aim: aimWorld,
    holdInteract: inGame && keyIsDown(69),
    grenade: inGame && pending.grenade,
    order: inGame && pending.order,
    fire: inGame && mouseIsPressed && mouseButton === LEFT,
    firePressed: inGame && pending.firePressed,
    sprint: inGame && keyIsDown(SHIFT),
    reload: inGame && pending.reload,
    interact: inGame && pending.interact,
    build: inGame && pending.build,
    jump: inGame && pending.jump,
    slot: inGame ? pending.slot : null,
    scroll: inGame ? pending.scroll : 0
  };
  pending = { order: false, grenade: false, interact: false, reload: false, build: false, jump: false, slot: null, scroll: 0, firePressed: false };
  return input;
}

// ---------- Boucle ----------

function draw() {
  fpsSmooth = lerp(fpsSmooth, frameRate(), 0.05);
  Ui.begin(mouseLogicalX(), mouseLogicalY(), mouseIsPressed, uiClicked, uiReleased);
  background(8, 12, 34);
  push();
  translate(view.ox, view.oy);
  scale(view.scale);
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(0, 0, VIEW.w, VIEW.h);
  drawingContext.clip();
  if (screen === 'lobby') {
    cursor(ARROW);
    Lobby.draw(profil, evolution, lobbyActions);
    if (showHelp) Ecrans.aide(() => { showHelp = false; });
  } else if (match) {
    stepMatch();
    renderMatch();
  }
  drawingContext.restore();
  pop();
  if (Ui.hover) cursor('pointer');
  uiClicked = false;
  uiReleased = false;
}

function stepMatch() {
  const running = !paused && !showMap && !behaviorLab && !showHelp;
  if (running && match.state !== 'fin' || (match.state === 'fin' && endTimer < 3)) {
    accumulator += Math.min(deltaTime, 100) / 1000 * (match.state === 'fin' ? 1 : simSpeed);
    let steps = 0;
    const input = currentInput();
    while (accumulator >= CONFIG.step && steps < 12) {
      match.step(CONFIG.step, steps === 0 ? input : { ...input, firePressed: false, grenade: false, order: false, reload: false, interact: false, build: false, jump: false, slot: null, scroll: 0 });
      accumulator -= CONFIG.step;
      steps++;
    }
  } else {
    accumulator = 0;
    currentInput();
  }
  if (match.state === 'fin') endTimer += deltaTime / 1000;

  const events = match.events;
  match.events = [];
  Hud.consume(match, events);
  Tutoriel.consume(match, events);
  if (!profil.data.settings.tutorielFini && Tutoriel.finished && match.time > 1) { profil.data.settings.tutorielFini = true; profil.save(); }
  sons.ambiance(match);
  Hud.update(deltaTime / 1000);
  const listener = camera;
  for (const e of events) sons.play(e, listener);
  if (match.state === 'fin' && !reward && match.result) {
    reward = profil.addResult(match.result);
    sons.play({ type: match.result.won ? 'victory' : 'death' }, null);
  }
  // le profil « XP » arrive après la victoire / la défaite finale
}

function cameraTarget() {
  const p = match.joueur;
  if (p.alive || !spectating) return p.alive ? p : (match.spectateTarget() || p);
  return match.spectateTarget() || p;
}

function visible(pos, margin) {
  return Math.abs(pos.x - camera.x) < VIEW.w / 2 + margin && Math.abs(pos.y - camera.y) < VIEW.h / 2 + margin;
}

function renderMatch() {
  const p = match.joueur;
  const target = (!p.alive || match.state === 'fin') ? (match.spectateTarget() || p) : p;
  const rotated = cameraRotated();
  const goal = createVector(
    constrain(target.pos.x, VIEW.w / 2, WORLD.w - VIEW.w / 2),
    constrain(target.pos.y, VIEW.h / 2, WORLD.h - VIEW.h / 2));
  camera.x = lerp(camera.x, goal.x, 0.14);
  camera.y = lerp(camera.y, goal.y, 0.14);
  viewCounter = 0;
  if (!rotated && pointerLocked()) unlockPointer();

  background(28, 104, 168);
  push();
  const sh = match.shake;
  if (rotated) {
    // premiere personne : tout le monde est dessine par VueFPS (le decor reste celui de la vue de dessus)
    VueFPS.setup(terrain);
    const moving = p.vel.mag() > 0.6;
    VueFPS.draw(match, p, viewYaw, {
      terrain, time: millis() / 1000, moving, bob: moving ? Math.sin(millis() / 1000 * 9) * 1.2 : 0
    });
  }
  if (!rotated) {
  translate(VIEW.w / 2 - camera.x + random(-sh, sh), VIEW.h / 2 - camera.y + random(-sh, sh));
  image(terrain, 0, 0, WORLD.w, WORLD.h);

  // au sol
  for (const c of match.coffres) if (visible(c.pos, 60)) c.show();
  for (const b of match.butins) if (visible(b.pos, 40)) b.show();
  for (const m of match.murs) if (visible(m.pos, 80)) m.show();
  for (const h of match.carte.houses) if (visible(h.pos, 120)) h.show();
  for (const r of match.carte.rocks) if (visible(r.pos, 80)) r.show();
  // combattants
  for (const a of match.faune) if (!(a instanceof Corbeau) && visible(a.pos, 60)) a.show();
  for (const v of match.vehicules) if (visible(v.pos, 80)) v.show();
  for (const f of match.fighters) if (f.alive && f.phase !== 'bus' && f.phase !== 'vehicule' && visible(f.pos, 60)) f.show(f === p);
  for (const f of match.fighters) {
    if (f.alive && (f.phase === 'sol' || f.phase === 'terre') && f !== p && visible(f.pos, 60)) f.showTag(false);
  }
  if (p.alive && (p.phase === 'sol' || p.phase === 'terre')) p.showTag(true);
  for (const b of match.bullets) if (visible(b.pos, 60)) b.show();
  // canopées par-dessus
  for (const t of match.carte.trees) if (visible(t.pos, 80)) t.show();
  for (const a of match.faune) if (a instanceof Corbeau && visible(a.pos, 60)) a.show();
  for (const e of match.sparks) if (visible(e.pos, 20)) e.show();
  for (const d of match.largages) d.show();
  if (match.bus) match.bus.show();
  if (match.stormStarted) match.storm.show();
  // textes flottants (dégâts, récolte)
  push();
  textFont(FONT_TITLE);
  textAlign(CENTER, CENTER);
  for (const pop of match.popups) {
    const t = 1 - pop.life / pop.maxLife;
    textSize(20 + (1 - t) * 6);
    push();
    translate(pop.pos.x, pop.pos.y);
    rotate(viewCounter);
    fill(0, 0, 0, 180 * (1 - t));
    text(pop.text, 1, -24 - t * 34 + 1);
    fill(pop.color[0], pop.color[1], pop.color[2], 255 * (1 - t));
    text(pop.text, 0, -24 - t * 34);
    pop();
  }
  pop();
  }
  pop();

  // interface
  const aimScreen = rotated ? { x: VIEW.w / 2, y: VueFPS.horizon } : { x: mouseLogicalX(), y: mouseLogicalY() };
  let prompt = null;
  if (p.alive && p.phase === 'sol') {
    const near = match.nearestInteractable(p);
    const mate = match.alive.find(f => f.phase === 'terre' && p.isFriend(f) && p5.Vector.dist(p.pos, f.pos) <= CONFIG.equipe.reviveRange);
    const veh = match.nearestVehicle(p);
    if (mate) prompt = { text: `Maintiens E : relever ${mate.name} (${Math.round(mate.reviveProgress * 100)} %)`, color: [120, 230, 140] };
    else if (near instanceof Coffre) prompt = { text: near.legendary ? 'Ouvrir le coffre légendaire' : 'Ouvrir le coffre', color: [255, 200, 70] };
    else if (near instanceof Butin) prompt = { text: `Ramasser ${near.label}`, color: near.color };
    else if (veh) prompt = { text: `Monter dans le ${veh.nom}`, color: veh.def.color };
  } else if (p.alive && p.phase === 'vehicule') {
    prompt = { text: `Descendre du ${p.vehicle.nom}`, color: [200, 210, 240] };
  }
  // bot observé (réseau de neurones affiché en debug) : le plus proche à l'écran, ou le spectateur
  let observed = null;
  if (Vehicle.debug) {
    const pool = match.fighters.filter(f => f !== p && f.alive && f.phase === 'sol' && f.brain);
    const ref = p.alive ? p : (match.spectateTarget() || p);
    observed = ref.brain ? ref : pool.sort((a, b) => p5.Vector.dist(a.pos, ref.pos) - p5.Vector.dist(b.pos, ref.pos))[0] || null;
  }
  Hud.draw(match, {
    observed, terrain, aimScreen, prompt, settings: profil.data.settings,
    tutorial: profil.data.settings.tutorielFini || paused || showHelp || behaviorLab ? null : Tutoriel.text(match),
    mapRotation: rotated ? -viewYaw - HALF_PI : 0,
    spectate: p.alive ? null : match.spectateTarget(), fps: Math.round(fpsSmooth)
  });
  cursorForState(p);
  if (rotated && !pointerLocked() && !paused && !(typeof Video !== 'undefined' && Video.running)) {
    Ui.label('Clique pour capturer la souris et tourner la caméra', 640, 690, 17, PALETTE.yellow, CENTER, FONT_BODY, true);
  }

  if (spectating && !p.alive && match.state !== 'fin') {
    const t = match.spectateTarget();
    Ui.panel(450, 640, 380, 56, { alpha: 220, radius: 12 });
    Ui.label(`SPECTATEUR · ${t ? t.name : ''}`, 640, 662, 20, PALETTE.yellow, CENTER, FONT_TITLE, false);
    Ui.label(simSpeed > 1 ? 'F : vitesse normale' : 'F : accélérer', 640, 684, 13, PALETTE.dim, CENTER, FONT_BODY, false);
    if (Ui.button('spec-leave', 1120, 650, 140, 40, 'QUITTER', 'danger', { size: 17 })) leaveMatch();
  }
  if (showHelp) Ecrans.aide(() => { showHelp = false; });
  else if (behaviorLab) LaboComportements.draw(match, safeStorage(), { close: () => { behaviorLab = false; } });
  else if (showMap) Ecrans.map(match, terrain, p.alive ? null : match.spectateTarget());
  else if (paused) Ecrans.pause(matchActions, profil);
  else if (!p.alive && !spectating && match.state !== 'fin') Ecrans.death(match, matchActions);
  else if (match.state === 'fin' && endTimer > 2.2 && reward) Ecrans.results(match, reward, profil, matchActions);
}

function cursorForState(p) {
  const playing = p.alive && !paused && !showMap && match.state !== 'fin';
  cursor(playing ? 'none' : ARROW);
}
