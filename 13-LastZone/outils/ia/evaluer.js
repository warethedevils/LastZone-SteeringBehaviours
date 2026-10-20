// Évaluation : des bots à cerveau (réseau de neurones) affrontent des bots à règles
// dans les mêmes matchs. On compare leur classement moyen et leurs victoires.
//
//   node outils/ia/evaluer.js [matchs=20] [fichier.js]
// Sans fichier, utilise cerveau_initial.js. Avec un fichier JSON d'individus
// (produit par evoluer.js), évalue ce champion.

const fs = require('fs');
const { loadGame } = require('../../tests/loadGame.js');

const matches = Number(process.argv[2]) || 20;

function evaluate(label, brainFactory) {
  let neural = { place: 0, wins: 0, kills: 0, n: 0 };
  let rules = { place: 0, wins: 0, kills: 0, n: 0 };
  for (let i = 1; i <= matches; i++) {
    const g = loadGame(5000 + i * 17);
    g.seed(9000 + i * 29);
    const evolution = brainFactory(g);
    const m = new g.Match({ autoplay: true, fighters: 24, neural: 12, evolution, difficulty: 'normal' });
    let steps = 0;
    while (m.state !== 'fin' && steps < 60 * 60 * 10) { m.step(1 / 60, null); steps++; m.events = []; }
    for (const f of m.fighters) {
      const place = f.alive ? 1 : f.placement;
      const group = f.neural ? neural : rules;
      group.place += place;
      group.kills += f.kills;
      group.n++;
      if (place === 1) group.wins++;
    }
  }
  const row = g => `classement moyen ${(g.place / g.n).toFixed(2)}  victoires ${g.wins}  éliminations/bot ${(g.kills / g.n).toFixed(2)}`;
  console.log(`${label}\n  réseau de neurones : ${row(neural)}\n  bots à règles     : ${row(rules)}`);
  return { neural: neural.place / neural.n, rules: rules.place / rules.n };
}

evaluate('Cerveau pré-entraîné (cerveau_initial.js)', g => {
  const e = new g.Evolution(null);
  if (process.env.TEMPERATURE !== undefined) {
    const t = Number(process.env.TEMPERATURE);
    const original = e.breed.bind(e);
    e.breed = n => original(n).map(c => { c.temperature = t; return c; });
  }
  return e;
});
