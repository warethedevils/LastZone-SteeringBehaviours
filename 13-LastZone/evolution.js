// Neuroévolution : les cerveaux (réseau + personnalité) des bots évoluent d'un
// match à l'autre. À la fin de chaque match, chaque bot laisse { individu, fitness } ;
// la génération suivante est produite par élitisme, sélection proportionnelle à la
// fitness, croisement des poids et mutation gaussienne. La population est sauvegardée
// (localStorage ou tout objet avec getItem / setItem) : les bots progressent
// réellement entre deux sessions de jeu.

class Evolution {
  constructor(storage = null, key = 'lastzone-evolution-v2') {
    this.storage = storage;
    this.key = key;
    this.generation = 1;
    this.population = [];      // Cerveau, meilleurs en premier
    this.records = [];         // résultats du match qui vient de finir
    this.elite = 0.2;
    this.geneRate = 0.3;
    this.geneAmplitude = 0.15;
    this.weightRate = 0.05;
    this.weightSigma = 0.12;
    this.maxStored = 12;
    this.best = null;          // meilleur résultat jamais vu : { fitness, generation }
    this.history = [];         // une ligne par génération jouée : { g, avg, best, place, kills }
    this.maxHistory = 80;
    this.load();
  }

  // Fitness : place finale (surtout), éliminations, durée de survie
  static fitness(result) {
    const win = result.placement === 1 ? 6 : 0;
    return result.kills * 3 + (result.fighters - result.placement) + result.survival / 60 + win;
  }

  record(individu, result) {
    this.records.push({ individu, fitness: Evolution.fitness(result), result });
  }

  pick(pool) {
    const floor = 0.3;
    const total = pool.reduce((s, r) => s + r.fitness + floor, 0);
    let x = random(total);
    for (const r of pool) {
      x -= r.fitness + floor;
      if (x <= 0) return r.individu;
    }
    return pool[pool.length - 1].individu;
  }

  // Population de départ : le cerveau pré-entraîné et ses variantes
  seedPopulation(count) {
    const base = Cerveau.initial();
    if (!base) return [];
    // même réseau de départ, légères variations de poids ; la personnalité du champion est variée
    // pour que les bots ne soient pas des clones
    const list = [];
    for (let i = 0; i < count; i++) {
      const net = i === 0 ? base.reseau : base.reseau.mutate(this.weightRate * 1.2, this.weightSigma);
      const genome = i === 0 ? base.genome : base.genome.mutate(0.6, 0.25);
      list.push(new Cerveau(genome, net));
    }
    return list;
  }

  // `count` cerveaux pour le prochain match ([] si aucun cerveau n'est disponible : bots à règles)
  breed(count) {
    let list = [];
    if (this.records.length > 0) {
      const pool = this.records.slice().sort((a, b) => b.fitness - a.fitness);
      if (!this.best || pool[0].fitness > this.best.fitness) this.best = { fitness: pool[0].fitness, generation: this.generation };
      this.history.push({
        g: this.generation,
        avg: pool.reduce((s, r) => s + r.fitness, 0) / pool.length,
        best: pool[0].fitness,
        place: pool.reduce((s, r) => s + (r.result && r.result.placement ? r.result.placement : 0), 0) / pool.length,
        kills: pool.reduce((s, r) => s + (r.result && r.result.kills ? r.result.kills : 0), 0) / pool.length
      });
      if (this.history.length > this.maxHistory) this.history.shift();
      const eliteCount = Math.min(count, Math.max(1, Math.round(count * this.elite)));
      for (let i = 0; i < eliteCount; i++) list.push(pool[i % pool.length].individu);
      while (list.length < count) {
        list.push(Cerveau.crossover(this.pick(pool), this.pick(pool))
          .mutate(this.geneRate, this.geneAmplitude, this.weightRate, this.weightSigma));
      }
      this.generation++;
      this.records = [];
      this.population = list.slice();
      this.save();
    } else if (this.population.length > 0) {
      list = this.population.slice(0, count);
      while (list.length < count) {
        const parent = this.population[Math.floor(random(this.population.length))];
        list.push(parent.mutate(this.geneRate, this.geneAmplitude, this.weightRate, this.weightSigma));
      }
    } else {
      list = this.seedPopulation(count);
      this.population = list.slice();
    }
    return list;
  }

  // Personnalité moyenne de la population (affichage)
  // (avant la première partie : personnalité du cerveau pré-entraîné)
  average() {
    if (this.population.length === 0) {
      const initial = Cerveau.initial();
      return initial ? Genome.average([initial.genome]) : Genome.average([]);
    }
    return Genome.average(this.population.map(c => c.genome));
  }

  // Diversité : distance moyenne des poids entre les premiers individus
  diversity() {
    if (this.population.length < 2) return 0;
    let sum = 0;
    let n = 0;
    for (let i = 1; i < Math.min(6, this.population.length); i++) {
      sum += Reseau.distance(this.population[0].reseau, this.population[i].reseau);
      n++;
    }
    return sum / n;
  }

  // Le meilleur cerveau connu : l'élite de la dernière reproduction, sinon le cerveau pré-entraîné
  champion() {
    return this.population[0] || Cerveau.initial();
  }

  // `count` copies du champion (personnalités légèrement variées) : mode « défier le champion »
  championBrains(count) {
    const c = this.champion();
    if (!c) return [];
    const list = [];
    for (let i = 0; i < count; i++) list.push(new Cerveau(i === 0 ? c.genome : c.genome.mutate(0.4, 0.1), c.reseau));
    return list;
  }

  // Texte à partager : le champion, avec de quoi vérifier qu'il est compatible
  exportJSON() {
    const c = this.champion();
    if (!c) return null;
    return JSON.stringify({ kind: 'lastzone-cerveau', version: 1, generation: this.generation, champion: c.toJSON(3) });
  }

  // Valide un cerveau décrit en JSON (architecture, tailles des tableaux, nombres finis) ; retourne un Cerveau ou null
  static parseBrain(data) {
    try {
      const net = data && data.reseau;
      if (!net || JSON.stringify(net.sizes) !== JSON.stringify(Cerveau.SIZES)) return null;
      if (!Array.isArray(net.W) || !Array.isArray(net.B) || net.W.length !== Cerveau.SIZES.length - 1 || net.B.length !== net.W.length) return null;
      for (let l = 0; l < net.W.length; l++) {
        if (net.W[l].length !== Cerveau.SIZES[l] * Cerveau.SIZES[l + 1] || net.B[l].length !== Cerveau.SIZES[l + 1]) return null;
        for (const x of net.W[l].concat(net.B[l])) if (typeof x !== 'number' || !Number.isFinite(x) || Math.abs(x) > 50) return null;
      }
      const genes = {};
      for (const name of Object.keys(Genome.RANGES)) {
        const v = data.genes && data.genes[name];
        if (typeof v !== 'number' || !Number.isFinite(v)) return null;
        genes[name] = Math.min(Genome.RANGES[name][1], Math.max(Genome.RANGES[name][0], v));
      }
      return new Cerveau(new Genome(genes), Reseau.fromJSON(net));
    } catch (e) {
      return null;
    }
  }

  // Importe un champion exporté : il devient le point de départ de la population
  importJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { return false; }
    if (!data || data.kind !== 'lastzone-cerveau') return false;
    const brain = Evolution.parseBrain(data.champion);
    if (!brain) return false;
    const list = [brain];
    for (let i = 1; i < 12; i++) list.push(brain.mutate(this.geneRate, this.geneAmplitude, this.weightRate, this.weightSigma));
    this.population = list;
    this.records = [];
    this.save();
    return true;
  }

  // Repart de zéro : cerveau pré-entraîné, génération 1
  reset() {
    this.generation = 1;
    this.population = [];
    this.records = [];
    this.history = [];
    this.best = null;
    this.save();
  }

  get hasBrains() { return this.population.length > 0 || Cerveau.initial() !== null; }

  save() {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, JSON.stringify({
        generation: this.generation,
        best: this.best,
        history: this.history,
        population: this.population.slice(0, this.maxStored).map(c => c.toJSON(3))
      }));
    } catch (e) { /* stockage indisponible ou plein */ }
  }

  load() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem(this.key);
      if (!raw) return;
      const data = JSON.parse(raw);
      const sameShape = JSON.stringify(data.population && data.population[0] && data.population[0].reseau.sizes)
        === JSON.stringify(Cerveau.SIZES);
      if (!sameShape) return;          // architecture changée : on repart du cerveau pré-entraîné
      this.generation = Math.max(1, data.generation | 0);
      this.best = data.best || null;
      this.history = Array.isArray(data.history) ? data.history.filter(h => h && Number.isFinite(h.avg)).slice(-this.maxHistory) : [];
      this.population = data.population.map(Cerveau.fromJSON);
    } catch (e) { /* données corrompues : on repart de zéro */ }
  }
}
