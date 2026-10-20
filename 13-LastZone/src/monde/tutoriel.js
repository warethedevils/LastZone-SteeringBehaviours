// Tutoriel : une suite de conseils affichés pendant la première partie, chacun disparaît
// quand le joueur a fait ce qu'il décrit (ou après quelques secondes pour les conseils
// d'information). Logique pure : le HUD affiche Tutoriel.text().

const Tutoriel = {
  index: 0,
  startedAt: null,
  shots: 0,
  orders: 0,
  skipped: false,

  // done(match, tuto) : le conseil est-il accompli ? ; when(match) : le conseil s'applique-t-il ?
  STEPS: [
    { id: 'saut', text: 'ESPACE : saute du bus de combat quand tu survoles ta zone', when: () => true, done: m => m.joueur.phase !== 'bus' },
    { id: 'chute', text: 'En chute, Z Q S D te dirigent : vise un bâtiment pour trouver des armes', when: () => true, done: m => m.joueur.phase !== 'chute' && m.joueur.phase !== 'bus' },
    { id: 'butin', text: 'Approche-toi d\'une arme au sol et appuie sur E pour la ramasser', when: () => true, done: m => !!m.joueur.weapon || !m.joueur.alive },
    { id: 'tir', text: 'Clic gauche : tirer · R : recharger · 1 à 5 ou molette : changer d\'objet', when: () => true, done: (m, t) => t.shots > 0 },
    { id: 'zone', text: 'La tempête violette se resserre : reste dans le cercle blanc (M : carte)', when: () => true, wait: 10 },
    { id: 'equipe', text: 'T : donne des ordres à ton équipe (suivez-moi, tenez la position, à l\'attaque)', when: m => m.teamMode, done: (m, t) => t.orders > 0, wait: 25 },
    { id: 'faune', text: 'Des corbeaux qui tournent signalent un combat · méfie-toi des loups', when: () => true, wait: 10 },
    { id: 'vue', text: 'V : vue 3D ou de dessus · C : labo des comportements · H : toutes les touches', when: () => true, wait: 12 }
  ],

  reset() {
    this.index = 0;
    this.startedAt = null;
    this.shots = 0;
    this.orders = 0;
    this.skipped = false;
  },

  // Événements de la partie (tirs du joueur, ordres)
  consume(match, events) {
    for (const e of events) {
      if (e.type === 'shot' && e.by === match.joueur) this.shots++;
      if (e.type === 'ordre') this.orders++;
    }
  },

  get finished() { return this.skipped || this.index >= this.STEPS.length; },

  skip() { this.skipped = true; },

  // Fait avancer la suite de conseils ; retourne le conseil courant ou null
  update(match) {
    if (this.finished) return null;
    for (let guard = 0; guard < this.STEPS.length && !this.finished; guard++) {
      const step = this.STEPS[this.index];
      if (!step.when(match)) { this.index++; this.startedAt = null; continue; }
      if (this.startedAt === null) this.startedAt = match.time;
      const waited = step.wait !== undefined && match.time - this.startedAt >= step.wait;
      const accomplished = step.done ? step.done(match, this) : false;
      if (accomplished || waited) { this.index++; this.startedAt = null; continue; }
      break;
    }
    return this.finished ? null : this.STEPS[this.index];
  },

  // Texte du conseil courant, ou null
  text(match) {
    const step = this.update(match);
    if (!step) return null;
    const applicable = this.STEPS.filter(s => s.when(match));
    return { text: step.text, number: applicable.indexOf(step) + 1, total: applicable.length };
  }
};
