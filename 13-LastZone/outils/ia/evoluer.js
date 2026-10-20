// Neuroévolution parallèle : la population de cerveaux (réseau + personnalité) joue des
// matchs mélangés — 12 bots à réseau contre 12 bots à règles — sur plusieurs processus.
// Les mieux classés se reproduisent (croisement des poids + mutation recuite). Le meilleur
// cerveau est écrit dans cerveau_initial.js. À lancer après outils/ia/entrainer.js.
//
//   node outils/ia/evoluer.js [generations=120] [population=48] [tours=2]

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const { loadGame } = require('../../tests/loadGame.js');

const generations = Number(process.argv[2]) || 120;
const populationSize = Number(process.argv[3]) || 48;
const rounds = Number(process.argv[4]) || 2;
const GROUP = 12;
const workerCount = Math.max(1, Math.min(os.cpus().length - 1, 7));

const master = loadGame(1);
master.seed(2025);
const evolution = new master.Evolution(null);
const rand = () => master.sandbox.random();

// ---------- pool de processus ----------
const workers = Array.from({ length: workerCount }, () => new Worker(path.join(__dirname, 'ouvrier.js')));
const idle = workers.slice();
const queue = [];
const pending = new Map();
let jobId = 0;

function pump() {
  while (idle.length > 0 && queue.length > 0) {
    const worker = idle.pop();
    const { job, resolve } = queue.shift();
    pending.set(job.id, { resolve, worker });
    worker.postMessage(job);
  }
}
workers.forEach(worker => worker.on('message', msg => {
  const entry = pending.get(msg.id);
  pending.delete(msg.id);
  idle.push(entry.worker);
  entry.resolve(msg);
  pump();
}));
function run(job) {
  job.id = ++jobId;
  return new Promise(resolve => { queue.push({ job, resolve }); pump(); });
}

const shuffle = list => list.map(x => [rand(), x]).sort((a, b) => a[0] - b[0]).map(p => p[1]);

async function evaluateChampion(candidate, matches, randomPersonality) {
  const json = candidate.toJSON(5);
  const jobs = [];
  for (let i = 0; i < matches; i++) {
    jobs.push(run({ seed: 880000 + i * 53, brains: Array.from({ length: GROUP }, () => json), randomPersonality }));
  }
  const out = await Promise.all(jobs);
  let neural = 0, rules = 0;
  for (const r of out) {
    neural += r.results.reduce((s, x) => s + x.placement, 0) / r.results.length;
    rules += r.rulesMean;
  }
  return { neural: neural / out.length, rules: rules / out.length };
}

async function main() {
  const started = Date.now();
  const history = [];
  for (let gen = 1; gen <= generations; gen++) {
    // mutation recuite : forte au début, fine à la fin
    const t = (gen - 1) / Math.max(1, generations - 1);
    evolution.weightRate = 0.05 - 0.025 * t;
    evolution.weightSigma = 0.12 - 0.08 * t;
    const population = evolution.breed(populationSize);
    const jobs = [];
    for (let r = 0; r < rounds; r++) {
      const order = shuffle(population);
      for (let k = 0; k < Math.floor(populationSize / GROUP); k++) {
        const group = order.slice(k * GROUP, (k + 1) * GROUP);
        jobs.push(run({ seed: 100000 + gen * 977 + r * 131 + k * 17, brains: group.map(c => c.toJSON(5)) })
          .then(res => ({ group, res })));
      }
    }
    const outcomes = await Promise.all(jobs);
    // fitness moyennée sur les tours
    const acc = new Map(population.map(c => [c, { fitness: 0, n: 0, place: 0 }]));
    let neuralSum = 0, rulesSum = 0;
    for (const { group, res } of outcomes) {
      group.forEach((c, i) => {
        const a = acc.get(c);
        a.fitness += master.Evolution.fitness(res.results[i]);
        a.place += res.results[i].placement;
        a.n++;
      });
      neuralSum += res.results.reduce((s, x) => s + x.placement, 0) / res.results.length;
      rulesSum += res.rulesMean;
    }
    for (const [c, a] of acc) {
      if (a.n > 0) evolution.records.push({ individu: c, fitness: a.fitness / a.n, result: { placement: a.place / a.n } });
    }
    const neural = neuralSum / outcomes.length;
    const rules = rulesSum / outcomes.length;
    history.push({ gen, advantage: rules - neural, neural: Number(neural.toFixed(2)), rules: Number(rules.toFixed(2)) });
    const elapsed = Math.round((Date.now() - started) / 1000);
    if (gen % 5 === 0 || gen === 1) {
      console.log(`génération ${String(gen).padStart(3)}  réseau ${neural.toFixed(2)}  règles ${rules.toFixed(2)}  avantage ${(rules - neural).toFixed(2)}  diversité ${evolution.diversity().toFixed(3)}  (${elapsed} s)`);
    }
  }

  // finalistes : les meilleurs de la dernière reproduction, départagés sur de nombreux matchs
  const finalists = evolution.breed(populationSize).slice(0, 5);
  console.log('sélection finale sur 24 matchs par candidat (réseau + personnalité)…');
  const scored = [];
  for (const c of finalists) scored.push({ c, ...(await evaluateChampion(c, 24, false)) });
  scored.sort((a, b) => (a.neural - a.rules) - (b.neural - b.rules));
  scored.forEach((x, i) => console.log(`  candidat ${i + 1} : réseau ${x.neural.toFixed(2)}  règles ${x.rules.toFixed(2)}  avantage ${(x.rules - x.neural).toFixed(2)}`));
  const champion = scored[0].c;
  const isolated = await evaluateChampion(champion, 32, true);
  console.log(`réseau seul (personnalités aléatoires) : réseau ${isolated.neural.toFixed(2)} contre règles ${isolated.rules.toFixed(2)}`);
  const first = history.slice(0, 5).reduce((s, x) => s + x.advantage, 0) / Math.min(5, history.length);
  const last = history.slice(-5).reduce((s, x) => s + x.advantage, 0) / Math.min(5, history.length);
  console.log(`avantage de la population sur les règles : début ${first.toFixed(2)} -> fin ${last.toFixed(2)}`);

  // courbe d'apprentissage (README, lobby) : classement moyen des réseaux et des règles à chaque génération
  fs.writeFileSync(path.join(__dirname, 'courbe_apprentissage.json'), JSON.stringify({ generations, populationSize, rounds, courbe: history }, null, 1));
  console.log('courbe écrite dans outils/ia/courbe_apprentissage.json');

  const outFile = path.join(__dirname, '..', '..', 'src', 'ia', 'cerveau_initial.js');
  let previous = {};
  try {
    const text = fs.readFileSync(outFile, 'utf8');
    previous = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch (e) { /* pas de fichier précédent */ }
  const payload = Object.assign({}, previous, {
    version: (previous.version || 1) + 1,
    methode: 'imitation + neuroévolution',
    generationsEvolution: (previous.generationsEvolution || 0) + generations,
    avantage: Number((scored[0].rules - scored[0].neural).toFixed(2)),
    avantageReseauSeul: Number((isolated.rules - isolated.neural).toFixed(2)),
    courbe: history.map(h => [h.gen, h.neural, h.rules]),          // classement moyen des réseaux et des règles à chaque génération (affiché dans le lobby)
    reseau: champion.reseau.toJSON(3),
    genes: champion.genome.genes
  });
  fs.writeFileSync(outFile, '// Réseau pré-entraîné par imitation (outils/ia/entrainer.js) puis perfectionné par neuroévolution (outils/ia/evoluer.js).\n'
    + 'const CERVEAU_INITIAL = ' + JSON.stringify(payload) + ';\n');
  console.log('champion écrit dans', outFile);
  workers.forEach(w => w.terminate());
}

main();
