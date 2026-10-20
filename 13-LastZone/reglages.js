// Réglages des comportements : la logique du « Labo des comportements » (sans dessin).
// Elle agit sur le BehaviorManager d'un bot :
//   - tweak : poids / activation d'un comportement du complexe actif (la définition du complexe
//     est modifiée aussi, sinon le réglage serait perdu au prochain changement d'état) ;
//   - snapshot / apply / applyAll : copier les définitions des comportements complexes ;
//   - sauvegarde et chargement JSON de comportements complexes (emplacements nommés dans le
//     stockage du navigateur) ; l'import est validé (seuls les comportements du registre,
//     poids bornés) ;
//   - reset : retour aux comportements d'origine (BOT_COMPORTEMENTS).

const Reglages = {
  KEY: 'lastzone-comportements',
  MAX_WEIGHT: 6,
  SLOTS: 3,

  // Définition (liste d'entrées) du comportement complexe actif d'un bot, ou null
  definition(bot) {
    const b = bot.behaviors;
    return (b.activeComplex && b.complex.get(b.activeComplex)) || null;
  },

  entryName(entry) { return entry.name || entry.type; },

  clampWeight(w) {
    return Math.min(Reglages.MAX_WEIGHT, Math.max(0, Number.isFinite(w) ? w : 0));
  },

  // Règle un comportement du complexe actif : { weight?, enabled? } ; retourne false s'il n'existe pas
  tweak(bot, name, change) {
    const b = bot.behaviors;
    if (!b.has(name)) return false;
    const def = this.definition(bot);
    const d = def && def.find(e => this.entryName(e) === name);
    if (change.weight !== undefined) {
      const w = this.clampWeight(change.weight);
      b.setWeight(name, w);
      if (d) { d.weight = w; d.weightKey = null; }
    }
    if (change.enabled !== undefined) {
      b.enable(name, !!change.enabled);
      if (d) d.enabled = !!change.enabled;
    }
    return true;
  },

  // Copie profonde des définitions des comportements complexes d'un bot : { nom: [entrées] }
  snapshot(bot) {
    const complex = {};
    for (const [name, list] of bot.behaviors.complex) complex[name] = list.map(e => ({ ...e, args: e.args ? e.args.slice() : e.args }));
    return { complex };
  },

  // Applique un snapshot à un bot (seuls les comportements complexes que le bot connaît)
  apply(bot, snap) {
    const b = bot.behaviors;
    const active = b.activeComplex;
    for (const name of Object.keys(snap.complex || {})) {
      if (!b.complex.has(name)) continue;
      const list = snap.complex[name]
        .filter(e => BehaviorManager.registry[e.type])
        .map(e => ({ ...e, weight: this.clampWeight(e.weight), args: e.args ? e.args.slice() : e.args }));
      b.define(name, list);
    }
    // reconstruire les entrées actives avec les nouvelles définitions
    b.activeComplex = null;
    if (active) b.use(active);
  },

  applyAll(bots, snap) {
    for (const bot of bots) this.apply(bot, snap);
  },

  // Retour aux comportements d'origine
  reset(bot) {
    const b = bot.behaviors;
    const active = b.activeComplex;
    for (const name of Object.keys(BOT_COMPORTEMENTS)) b.define(name, BOT_COMPORTEMENTS[name]);
    b.activeComplex = null;
    if (active) b.use(active);
  },

  // ---------- JSON ----------

  serialize(bot) {
    return JSON.stringify({ version: 1, complex: this.snapshot(bot).complex });
  },

  // Texte JSON -> snapshot valide, ou null
  parse(json) {
    try {
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (!data || typeof data !== 'object' || typeof data.complex !== 'object' || data.complex === null) return null;
      const complex = {};
      for (const name of Object.keys(data.complex)) {
        const list = data.complex[name];
        if (!Array.isArray(list)) continue;
        complex[name] = list
          .filter(e => e && typeof e.type === 'string' && BehaviorManager.registry[e.type])
          .map(e => ({
            name: typeof e.name === 'string' ? e.name : e.type, type: e.type,
            weight: this.clampWeight(Number(e.weight)), weightKey: null,
            args: Array.isArray(e.args) ? e.args.filter(a => typeof a === 'string' || typeof a === 'number') : [],
            enabled: e.enabled !== false
          }));
      }
      return { complex };
    } catch (err) {
      return null;
    }
  },

  // ---------- Emplacements nommés (stockage du navigateur) ----------

  readAll(storage) {
    try {
      const raw = storage && storage.getItem(this.KEY);
      const data = raw ? JSON.parse(raw) : null;
      if (data && Array.isArray(data.slots)) return data.slots.slice(0, this.SLOTS);
    } catch (err) { /* stockage illisible : on repart de zéro */ }
    return [];
  },

  saveSlot(storage, index, name, bot) {
    if (!storage || index < 0 || index >= this.SLOTS) return false;
    const slots = this.readAll(storage);
    while (slots.length < this.SLOTS) slots.push(null);
    slots[index] = { name: String(name).slice(0, 20), json: this.serialize(bot) };
    try { storage.setItem(this.KEY, JSON.stringify({ slots })); return true; } catch (err) { return false; }
  },

  // Charge un emplacement : snapshot valide ou null
  loadSlot(storage, index) {
    const slot = this.readAll(storage)[index];
    return slot ? this.parse(slot.json) : null;
  }
};
