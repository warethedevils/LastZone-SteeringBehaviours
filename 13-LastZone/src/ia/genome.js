// Génome d'un bot (8-EvolutionarySteeringBehavior + 10-missiles genetic algo).
// Chaque gène règle un comportement de pilotage ou de décision du bot.
//   agressivite  : goût du combat (distance d'engagement, refus de fuir)
//   prudence     : seuil de vie sous lequel le bot fuit et se soigne
//   precision    : qualité de visée
//   cupidite     : temps passé à fouiller le butin avant de chercher la bagarre
//   anticipation : avance sur la tempête (rejoint la zone tôt)
//   reflexe      : esquive des balles (poids du sidestep)
// Les génomes survivent d'un match à l'autre (voir evolution.js).

class Genome {
  static RANGES = {
    agressivite: [0.05, 1],
    prudence: [0, 1],
    precision: [0.35, 1],
    cupidite: [0, 1],
    anticipation: [0, 1],
    reflexe: [0, 1]
  };

  static NAMES = Object.keys(Genome.RANGES);

  constructor(genes) {
    this.genes = {};
    for (const name of Genome.NAMES) {
      const [min, max] = Genome.RANGES[name];
      this.genes[name] = constrain(genes[name], min, max);
    }
  }

  static random() {
    const genes = {};
    for (const name of Genome.NAMES) {
      const [min, max] = Genome.RANGES[name];
      genes[name] = random(min, max);
    }
    return new Genome(genes);
  }

  static crossover(a, b) {
    const genes = {};
    for (const name of Genome.NAMES) genes[name] = random(1) < 0.5 ? a.genes[name] : b.genes[name];
    return new Genome(genes);
  }

  mutate(rate, amplitude) {
    const genes = {};
    for (const name of Genome.NAMES) {
      const [min, max] = Genome.RANGES[name];
      let value = this.genes[name];
      if (random(1) < rate) value += random(-1, 1) * amplitude * (max - min);
      genes[name] = constrain(value, min, max);
    }
    return new Genome(genes);
  }

  normalized(name) {
    const [min, max] = Genome.RANGES[name];
    return (this.genes[name] - min) / (max - min);
  }

  toJSON() { return this.genes; }

  static average(genomes) {
    const mean = {};
    for (const name of Genome.NAMES) {
      mean[name] = genomes.length
        ? genomes.reduce((s, g) => s + g.genes[name], 0) / genomes.length
        : 0;
    }
    return mean;
  }
}
