// Ouvrier de calcul pour la neuroévolution parallèle : reçoit un groupe de cerveaux,
// joue un match complet contre des bots à règles et renvoie les résultats.
const { parentPort } = require('worker_threads');
const { loadGame } = require('../../tests/loadGame.js');

parentPort.on('message', job => {
  const g = loadGame(job.seed);
  g.seed(job.seed * 3 + 1);
  const brains = job.brains.map(json => g.Cerveau.fromJSON(json));
  if (job.randomPersonality) for (const b of brains) b.genome = g.Genome.random();
  const fighters = job.fighters || 24;
  const m = new g.Match({ autoplay: true, fighters, neural: brains.length, brains, evolution: null, difficulty: job.difficulty || 'normal' });
  let steps = 0;
  while (m.state !== 'fin' && steps < 60 * 60 * 10) { m.step(1 / 60, null); steps++; m.events = []; }
  const results = [];
  let rules = 0, nr = 0;
  m.fighters.forEach((f, i) => {
    const placement = f.alive ? 1 : f.placement;
    if (i < brains.length) results.push({ placement, kills: f.kills, survival: f.survival, fighters });
    else { rules += placement; nr++; }
  });
  parentPort.postMessage({ id: job.id, results, rulesMean: nr ? rules / nr : 0, seconds: steps / 60 });
});
