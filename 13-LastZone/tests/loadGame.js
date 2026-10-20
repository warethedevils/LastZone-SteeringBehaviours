// Charge les vrais fichiers du jeu dans un contexte Node isolé, avec une
// version minimale de p5 (p5.Vector + fonctions mathématiques). Le hasard est
// injecté (générateur à graine) pour rendre les tests reproductibles.
// Le rendu et le comportement dans le vrai p5.js sont validés dans le navigateur.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

// même ordre que index.html
const FILES = [
  'src/steering/vehicle.js', 'src/config/config.js', 'src/steering/behaviors.js', 'src/monde/grille.js', 'src/monde/armes.js', 'src/ia/reseau.js', 'src/ia/genome.js',
  'src/ia/cerveau.js', 'src/ia/cerveau_initial.js', 'src/ia/evolution.js',
  'src/monde/chemin.js', 'src/monde/glow.js', 'src/entites/arbre.js', 'src/entites/rocher.js', 'src/entites/batiment.js', 'src/entites/mur.js', 'src/entites/balle.js', 'src/entites/butin.js',
  'src/entites/coffre.js', 'src/entites/etincelle.js', 'src/entites/largage.js', 'src/entites/tempete.js', 'src/entites/bus.js', 'src/entites/animal.js', 'src/entites/loup.js', 'src/entites/cerf.js', 'src/entites/corbeau.js', 'src/entites/vehicule.js', 'src/entites/combattant.js', 'src/entites/joueur.js',
  'src/entites/bot.js', 'src/steering/reglages.js', 'src/monde/tutoriel.js', 'src/monde/carte.js', 'src/monde/match.js', 'src/monde/profil.js', 'src/rendu/vue3d.js', 'src/rendu/vuefps.js'
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  copy() { return new Vec(this.x, this.y, this.z); }
  set(x, y, z = 0) {
    if (x instanceof Vec) { this.x = x.x; this.y = x.y; this.z = x.z; } else { this.x = x; this.y = y; this.z = z; }
    return this;
  }
  add(x, y, z = 0) { if (x instanceof Vec) { this.x += x.x; this.y += x.y; this.z += x.z; } else { this.x += x; this.y += y; this.z += z; } return this; }
  sub(x, y, z = 0) { if (x instanceof Vec) { this.x -= x.x; this.y -= x.y; this.z -= x.z; } else { this.x -= x; this.y -= y; this.z -= z; } return this; }
  mult(n) { this.x *= n; this.y *= n; this.z *= n; return this; }
  div(n) { this.x /= n; this.y /= n; this.z /= n; return this; }
  mag() { return Math.sqrt(this.magSq()); }
  magSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  dist(v) { return Vec.dist(this, v); }
  normalize() { const m = this.mag(); if (m !== 0) this.mult(1 / m); return this; }
  setMag(n) { return this.normalize().mult(n); }
  limit(max) { const mSq = this.magSq(); if (mSq > max * max) this.div(Math.sqrt(mSq)).mult(max); return this; }
  heading() { return Math.atan2(this.y, this.x); }
  static add(a, b) { return a.copy().add(b); }
  static sub(a, b) { return a.copy().sub(b); }
  static mult(a, n) { return a.copy().mult(n); }
  static div(a, n) { return a.copy().div(n); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
  static lerp(a, b, t) { return new Vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
}

// Crée un contexte neuf. Retourne { ctx, api, seed(n) } où api expose les
// classes et fonctions globales du jeu.
function loadGame(seedValue = 1) {
  let rng = mulberry32(seedValue);
  const sandbox = {
    console, Math, JSON, Set, Map, Array, Object, Number, String, Infinity, NaN, performance: { now: () => 0 },
    window: {}, localStorage: undefined, TOP: 0, BOTTOM: 1, CENTER: 2, LEFT: 3, RIGHT: 4,
    PI: Math.PI, TWO_PI: Math.PI * 2, HALF_PI: Math.PI / 2,
    cos: Math.cos, sin: Math.sin, abs: Math.abs, sqrt: Math.sqrt, floor: Math.floor,
    min: Math.min, max: Math.max,
    frameCount: 0, width: 1280, height: 720, deltaTime: 16.6,
    push() {}, pop() {},
    p5: { Vector: Vec },
    createVector: (x, y, z) => new Vec(x, y, z),
    constrain: (n, lo, hi) => Math.min(Math.max(n, lo), hi),
    map: (n, a, b, c, d) => c + ((n - a) / (b - a)) * (d - c),
    lerp: (a, b, t) => a + (b - a) * t,
    random: (a, b) => {
      const r = rng();
      if (a === undefined) return r;
      if (b === undefined) return r * a;
      return a + r * (b - a);
    }
  };
  Vec.random2D = () => { const a = rng() * Math.PI * 2; return new Vec(Math.cos(a), Math.sin(a)); };
  sandbox.p5.Vector.random2D = Vec.random2D;
  const ctx = vm.createContext(sandbox);
  for (const file of FILES) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: path.basename(file) });
  }
  const api = vm.runInContext(`({
    Vehicle, BehaviorManager, CONFIG, DEFAULTS, WORLD, VIEW, resetConfig, Behaviors, Grille, RARITES, WEAPONS, MUNITIONS, SOINS,
    MATERIAUX, weaponStats, weaponDps, makeWeapon, makeHeal, itemName, itemColor, rollIndex, rollKey,
    rollWeapon, rollHeal, Reseau, Genome, Cerveau, Evolution, Profil, SKINS, DEFIS, Chemin, Arbre, Rocher, Batiment, Mur, Balle, Butin, Coffre,
    Etincelle, Largage, Tempete, Bus, Animal, Loup, Cerf, Corbeau, Vehicule, VEHICULES, EXPLOSIFS, makeGrenade, Combattant, Joueur, Bot, Carte, Match, Reglages, Tutoriel, VueFPS, Vue3D
  })`, ctx);
  api.createVector = sandbox.createVector;
  api.Vec = Vec;
  api.sandbox = sandbox;
  api.seed = (n) => { rng = mulberry32(n); };
  api.setRandom = (fn) => { rng = fn; };
  return api;
}

const VEHICLE_SOURCE = path.join(ROOT, 'src', 'steering', 'vehicle.js');
const ORIGINAL_SOURCE = path.join(ROOT, '..', '4-Wander', 'vehicle.js');

// Tous les fichiers sources (src/**), pour retrouver un fichier par son nom : sourcePath('bot.js')
function listSources(dir = path.join(ROOT, 'src'), out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSources(full, out);
    else if (entry.name.endsWith('.js')) out.push(path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return out;
}
const SOURCES = listSources();
function relativeSource(name) {
  const rel = SOURCES.find(p => path.basename(p) === name);
  if (!rel) throw new Error('source introuvable : ' + name);
  return rel;
}
function sourcePath(name) { return path.join(ROOT, relativeSource(name)); }

module.exports = { loadGame, mulberry32, VEHICLE_SOURCE, ORIGINAL_SOURCE, ROOT, FILES, SOURCES, relativeSource, sourcePath };
