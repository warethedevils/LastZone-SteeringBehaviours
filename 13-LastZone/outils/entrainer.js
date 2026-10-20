// Pré-entraînement par imitation : des bots à règles (le « professeur ») jouent
// des matchs complets, leurs décisions sont enregistrées (capteurs -> état choisi),
// puis le réseau de neurones apprend à les reproduire par rétropropagation.
// Résultat : cerveau_initial.js, le point de départ de tous les bots.
//
//   node outils/entrainer.js [matchs=14] [epoques=30]

const fs = require('fs');
const path = require('path');
const { loadGame } = require('../tests/loadGame.js');

const matches = Number(process.argv[2]) || 14;
const epochs = Number(process.argv[3]) || 30;

function collect() {
  const samples = [];
  let context = null;
  for (let i = 1; i <= matches; i++) {
    const g = loadGame(1000 + i * 31);
    g.seed(7000 + i * 13);
    const recorder = [];
    const m = new g.Match({ autoplay: true, fighters: 24, neural: 0, recorder, difficulty: ['facile', 'normal', 'difficile'][i % 3] });
    let steps = 0;
    while (m.state !== 'fin' && steps < 60 * 60 * 10) { m.step(1 / 60, null); steps++; m.events = []; }
    for (const s of recorder) samples.push(s);
    context = g;
    process.stdout.write(`match ${i}/${matches} : ${recorder.length} décisions, ${Math.round(steps / 60)} s\n`);
  }
  return { samples, g: context };
}

const { samples, g } = collect();
const K = g.Cerveau.STATES.length;
console.log('échantillons :', samples.length);

// répartition des classes et poids de classe (racine carrée de l'inverse de la fréquence)
const counts = new Array(K).fill(0);
for (const s of samples) counts[s.y.slice(0, K).indexOf(1)]++;
console.log('états :', g.Cerveau.STATES.map((n, i) => `${n}=${counts[i]}`).join('  '));
const total = samples.length;
const raw = counts.map(c => c > 0 ? Math.pow(total / (K * c), 0.75) : 0);
const mean = raw.reduce((a, b) => a + b, 0) / raw.filter(x => x > 0).length;
const classWeights = raw.map(x => x / mean);

// plafonnement des classes majoritaires (les états rares restent tous présents)
const CAP = Number(process.env.CAP) || 16000;
const taken = new Array(K).fill(0);
const balanced = samples.filter(s => { const k = s.y.slice(0, K).indexOf(1); taken[k]++; return taken[k] <= CAP || Math.random() < CAP / counts[k]; });
console.log('après plafonnement :', balanced.length);

// séparation entraînement / validation
g.seed(42);
const order = balanced.map((_, i) => i).sort(() => g.sandbox.random() - 0.5);
const cut = Math.floor(balanced.length * 0.9);
const train = order.slice(0, cut).map(i => balanced[i]);
const valid = order.slice(cut).map(i => balanced[i]);

const net = g.Cerveau.newNetwork();
console.log('réseau :', net.sizes.join(' -> '), `(${net.parameterCount} paramètres)`);
const started = Date.now();
net.train(train, {
  epochs, lr: 0.004, batch: 128, classWeights,
  onEpoch: (e, stats) => {
    if (e % 5 === 4 || e === 0 || e === epochs - 1) {
      let ok = 0;
      for (const s of valid) {
        const out = net.forward(s.x);
        let best = 0;
        for (let i = 1; i < K; i++) if (out[i] > out[best]) best = i;
        if (s.y[best] === 1) ok++;
      }
      console.log(`époque ${e + 1}/${epochs}  perte ${stats.loss.toFixed(4)}  précision train ${(stats.accuracy * 100).toFixed(1)} %  validation ${(100 * ok / valid.length).toFixed(1)} %  (${Math.round((Date.now() - started) / 1000)} s)`);
    }
  }
});

// matrice de confusion en validation
const confusion = Array.from({ length: K }, () => new Array(K).fill(0));
for (const s of valid) {
  const out = net.forward(s.x);
  let best = 0;
  for (let i = 1; i < K; i++) if (out[i] > out[best]) best = i;
  confusion[s.y.slice(0, K).indexOf(1)][best]++;
}
console.log('confusion (lignes = professeur, colonnes = réseau) :');
console.log('          ' + g.Cerveau.STATES.map(n => n.slice(0, 7).padEnd(8)).join(''));
confusion.forEach((row, i) => console.log(g.Cerveau.STATES[i].padEnd(10) + row.map(v => String(v).padEnd(8)).join('')));
let ok = 0;
for (let i = 0; i < K; i++) ok += confusion[i][i];
const accuracy = ok / valid.length;

const out = path.join(__dirname, '..', 'cerveau_initial.js');
const payload = {
  version: 1,
  methode: 'imitation',
  echantillons: samples.length,
  validation: Number(accuracy.toFixed(4)),
  reseau: net.toJSON(3)
};
fs.writeFileSync(out, '// Réseau pré-entraîné par imitation (outils/entrainer.js) puis, si outils/evoluer.js a été lancé, perfectionné par neuroévolution.\n'
  + 'const CERVEAU_INITIAL = ' + JSON.stringify(payload) + ';\n');
console.log('écrit :', out, `(${Math.round(fs.statSync(out).size / 1024)} Ko), précision de validation ${(accuracy * 100).toFixed(1)} %`);
