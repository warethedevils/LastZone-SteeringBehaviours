// Cerveau d'un bot : un réseau de neurones + une personnalité (génome).
//
// Architecture (Reynolds : sélection de l'action / steering / locomotion) :
//   capteurs -> RÉSEAU DE NEURONES -> état d'action + réglages fins
//                                     -> steering behaviors (forces) -> locomotion
// Le réseau choisit QUOI faire (butin, errance, zone, combat, fuite, soin) et règle
// la manière de combattre (distance d'engagement, tolérance de visée, envie de
// construire) ; le déplacement reste calculé par des forces de steering.
// Les états impossibles (combattre sans ennemi visible...) sont masqués avant le tirage.
//
// Le réseau est pré-entraîné par imitation d'un bot à règles (voir outils/entrainer.js)
// puis perfectionné par neuroévolution (outils/evoluer.js et entre les parties).

class Cerveau {
  static STATES = ['butin', 'errance', 'zone', 'combat', 'fuite', 'soin'];

  static INPUT_LABELS = [
    'vie', 'bouclier', 'armé', 'puissance arme', 'chargeur', 'munitions', 'soin dispo', 'potion dispo',
    'bois', 'utilise', 'recharge', 'touché récemment', 'calme restant',
    'écart zone', 'zone proche', 'hors zone', 'temps tempête', 'tempête active', 'zone dir x', 'zone dir y',
    'ennemi visible', 'ennemi connu', 'ennemi dist.', 'ennemi dir x', 'ennemi dir y', 'ennemi vitalité',
    'ennemi armé', 'ennemis proches', 'butin dispo', 'butin dist.', 'butin valeur', 'balles proches',
    'agressivité', 'prudence', 'précision', 'cupidité', 'anticipation', 'réflexes', 'perception',
    'menace ennemie', 'abri proche', 'vitesse'
  ];

  static INPUTS = Cerveau.INPUT_LABELS.length;
  // gains de steering : le réseau amplifie ou atténue chaque force (poids x (1 + 0,6 x sortie))
  static GAINS = ['butin', 'zone', 'engagement', 'fuite', 'esquive', 'errance'];
  static OUTPUTS = Cerveau.STATES.length + 3 + Cerveau.GAINS.length;
  static HIDDEN = [48, 32];
  static SIZES = [Cerveau.INPUTS, ...Cerveau.HIDDEN, Cerveau.OUTPUTS];

  static OUTPUT_LABELS = [...Cerveau.STATES, 'distance', 'visée', 'construire', ...Cerveau.GAINS.map(g => 'gain ' + g)];

  constructor(genome, reseau) {
    this.genome = genome;
    this.reseau = reseau;
    this.temperature = 0.8;       // 1 = tirage fidèle aux probabilités, 0 = toujours le plus probable
    this.last = null;             // dernière décision (affichage du réseau)
  }

  // Nombre de poids et de biais de l'architecture
  static parameterCount() {
    let n = 0;
    for (let i = 0; i < Cerveau.SIZES.length - 1; i++) n += Cerveau.SIZES[i] * Cerveau.SIZES[i + 1] + Cerveau.SIZES[i + 1];
    return n;
  }

  static newNetwork() {
    return new Reseau(Cerveau.SIZES, Cerveau.STATES.length);
  }

  static random() {
    return new Cerveau(Genome.random(), Cerveau.newNetwork());
  }

  // Cerveau pré-entraîné (fichier généré par outils/entrainer.js), ou null s'il n'existe pas
  static initial() {
    if (typeof CERVEAU_INITIAL === 'undefined' || !CERVEAU_INITIAL) return null;
    // un fichier généré pour une autre architecture est ignoré (bots à règles jusqu'au prochain entraînement)
    if (JSON.stringify(CERVEAU_INITIAL.reseau.sizes) !== JSON.stringify(Cerveau.SIZES)) return null;
    // personnalité : celle du champion de l'évolution si elle est connue, sinon aléatoire
    const genome = CERVEAU_INITIAL.genes ? new Genome(CERVEAU_INITIAL.genes) : Genome.random();
    return new Cerveau(genome, Reseau.fromJSON(CERVEAU_INITIAL.reseau));
  }

  clone() {
    return new Cerveau(new Genome(this.genome.genes), this.reseau.clone());
  }

  // Mutation de la personnalité et des poids
  mutate(geneRate = 0.3, geneAmplitude = 0.15, weightRate = 0.05, weightSigma = 0.12) {
    const child = new Cerveau(this.genome.mutate(geneRate, geneAmplitude), this.reseau.mutate(weightRate, weightSigma));
    child.temperature = this.temperature;
    return child;
  }

  static crossover(a, b) {
    return new Cerveau(Genome.crossover(a.genome, b.genome), Reseau.crossover(a.reseau, b.reseau));
  }

  // ---------- Décision ----------

  // features : entrées normalisées ; valid : booléens par état. Retourne la décision.
  decide(features, valid) {
    const out = this.reseau.forward(features);
    const k = Cerveau.STATES.length;
    // tirage dans la distribution restreinte aux états possibles
    const weights = new Array(k).fill(0);
    let total = 0;
    for (let i = 0; i < k; i++) {
      if (!valid[i]) continue;
      weights[i] = this.temperature <= 0.01 ? out[i] : Math.pow(Math.max(out[i], 1e-9), 1 / this.temperature);
      total += weights[i];
    }
    let choice = valid.findIndex(v => v);
    if (total > 0) {
      if (this.temperature <= 0.01) {
        let best = -1;
        for (let i = 0; i < k; i++) if (valid[i] && (best < 0 || weights[i] > weights[best])) best = i;
        choice = best;
      } else {
        let x = random(total);
        for (let i = 0; i < k; i++) {
          if (!valid[i]) continue;
          x -= weights[i];
          if (x <= 0) { choice = i; break; }
          choice = i;
        }
      }
    }
    const decision = {
      state: Cerveau.STATES[choice],
      probs: Array.from(out.slice(0, k)),
      idealScale: out[k],
      aimTol: out[k + 1],
      buildBias: out[k + 2],
      gains: Array.from(out.slice(k + 3, k + 3 + Cerveau.GAINS.length))
    };
    this.last = decision;
    return decision;
  }

  // ---------- Sérialisation ----------

  toJSON(decimals = 4) {
    return { genes: this.genome.genes, reseau: this.reseau.toJSON(decimals) };
  }

  static fromJSON(data) {
    return new Cerveau(new Genome(data.genes), Reseau.fromJSON(data.reseau));
  }
}
