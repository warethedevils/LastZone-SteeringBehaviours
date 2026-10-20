// Profil du joueur : niveau et XP, statistiques, tenues débloquées, défis et
// réglages. Sauvegardé dans localStorage (ou tout objet getItem / setItem :
// c'est ce qui rend la logique testable). Pas une entité du monde.

const SKINS = [
  { nom: 'Recrue', body: [80, 150, 255], accent: [255, 255, 255], level: 1 },
  { nom: 'Braise', body: [235, 95, 60], accent: [255, 220, 150], level: 2 },
  { nom: 'Sylve', body: [70, 185, 110], accent: [215, 255, 200], level: 3 },
  { nom: 'Néon', body: [200, 90, 255], accent: [120, 255, 240], level: 4 },
  { nom: 'Citron', body: [245, 205, 60], accent: [90, 70, 20], level: 6 },
  { nom: 'Glace', body: [150, 215, 245], accent: [255, 255, 255], level: 8 },
  { nom: 'Ombre', body: [60, 62, 82], accent: [255, 90, 90], level: 10 },
  { nom: 'Rubis', body: [210, 40, 80], accent: [255, 200, 215], level: 13 },
  { nom: 'Aurore', body: [255, 150, 200], accent: [120, 230, 255], level: 16 },
  { nom: 'Or royal', body: [255, 200, 70], accent: [255, 255, 255], level: 20 }
];

const DEFIS = [
  { id: 'kills3', texte: 'Élimine 3 joueurs en une partie', xp: 150, test: r => r.kills >= 3 },
  { id: 'kills1', texte: 'Obtiens une élimination', xp: 60, test: r => r.kills >= 1 },
  { id: 'top10', texte: 'Termine dans le top 10', xp: 120, test: r => r.placement <= 10 },
  { id: 'top3', texte: 'Termine dans le top 3', xp: 220, test: r => r.placement <= 3 },
  { id: 'wood100', texte: 'Récolte 100 de bois', xp: 90, test: r => r.wood >= 100 },
  { id: 'chests4', texte: 'Ouvre 4 coffres', xp: 90, test: r => r.chests >= 4 },
  { id: 'damage300', texte: 'Inflige 300 dégâts', xp: 130, test: r => r.damage >= 300 },
  { id: 'survive240', texte: 'Survis 4 minutes', xp: 110, test: r => r.survival >= 240 },
  { id: 'win', texte: 'Remporte une victoire', xp: 400, test: r => r.won }
];

class Profil {
  constructor(storage = null, key = 'lastzone-profil') {
    this.storage = storage;
    this.key = key;
    this.data = Profil.defaults();
    this.load();
    this.fillChallenges();
  }

  static defaults() {
    return {
      name: 'Joueur', xp: 0, matches: 0, wins: 0, kills: 0, damage: 0, bestPlace: 99, top10: 0,
      timePlayed: 0, skin: 0, challenges: [],
      history: [],
      settings: { volume: 0.6, muted: false, difficulty: 'normal', fighters: 24, stormSpeed: 1, minimapZoom: 1, camera: 'normal', teamSize: 1, championDuel: false, tutorielFini: false }
    };
  }

  // ---------- Niveau ----------

  // XP cumulée nécessaire pour atteindre le niveau n (n >= 1)
  static xpForLevel(n) {
    return CONFIG.progression.xpBase * (n - 1) * n / 2;
  }

  get level() {
    let level = 1;
    while (Profil.xpForLevel(level + 1) <= this.data.xp) level++;
    return level;
  }

  // Progression dans le niveau courant : { current, needed, ratio }
  get levelProgress() {
    const level = this.level;
    const base = Profil.xpForLevel(level);
    const needed = Profil.xpForLevel(level + 1) - base;
    const current = this.data.xp - base;
    return { current, needed, ratio: needed > 0 ? current / needed : 0 };
  }

  isUnlocked(skinIndex) {
    return SKINS[skinIndex] && this.level >= SKINS[skinIndex].level;
  }

  get skin() { return SKINS[this.isUnlocked(this.data.skin) ? this.data.skin : 0]; }

  selectSkin(index) {
    if (!this.isUnlocked(index)) return false;
    this.data.skin = index;
    this.save();
    return true;
  }

  // ---------- Défis ----------

  fillChallenges() {
    const active = this.data.challenges;
    const pool = DEFIS.filter(d => !active.includes(d.id));
    while (active.length < 3 && pool.length > 0) {
      active.push(pool.splice(Math.floor(random(pool.length)), 1)[0].id);
    }
  }

  get challenges() {
    return this.data.challenges.map(id => DEFIS.find(d => d.id === id)).filter(Boolean);
  }

  // ---------- Fin de partie ----------

  static xpForResult(r) {
    const c = CONFIG.progression;
    let xp = c.xpMatch + r.kills * c.xpPerKill + Math.floor(r.survival / 30) * 5;
    if (r.placement === 1) xp += c.xpWin;
    else if (r.placement <= 3) xp += c.xpTop3;
    else if (r.placement <= 10) xp += c.xpTop10;
    return xp;
  }

  // Enregistre un match terminé. Retourne { xp, challengeXp, levelBefore, levelAfter, completed }
  addResult(result) {
    const d = this.data;
    const levelBefore = this.level;
    let xp = Profil.xpForResult(result);
    const completed = [];
    for (const defi of this.challenges) {
      if (defi.test(result)) {
        completed.push(defi);
        xp += defi.xp;
        d.challenges.splice(d.challenges.indexOf(defi.id), 1);
      }
    }
    this.fillChallenges();
    d.xp += xp;
    d.matches++;
    if (result.won) d.wins++;
    d.kills += result.kills;
    d.damage += result.damage;
    d.bestPlace = Math.min(d.bestPlace, result.placement);
    if (result.placement <= 10) d.top10++;
    d.timePlayed += result.survival;
    d.history.unshift({ placement: result.placement, kills: result.kills, xp });
    d.history = d.history.slice(0, 12);
    this.save();
    return { xp, challengeXp: completed.reduce((s, c) => s + c.xp, 0), levelBefore, levelAfter: this.level, completed };
  }

  // ---------- Persistance ----------

  save() {
    if (!this.storage) return;
    try { this.storage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* indisponible */ }
  }

  load() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return;
      const saved = JSON.parse(raw);
      const defaults = Profil.defaults();
      this.data = Object.assign(defaults, saved, { settings: Object.assign(defaults.settings, saved.settings || {}) });
    } catch (e) { /* données corrompues : profil neuf */ }
  }
}
