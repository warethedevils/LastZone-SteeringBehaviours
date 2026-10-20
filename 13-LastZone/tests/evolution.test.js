const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(29);
const { Evolution, Cerveau, Reseau, Genome } = g;

test.beforeEach(() => g.seed(31));

function fakeStorage() {
  const data = {};
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; } };
}

const result = (placement, kills = 0, survival = 100, fighters = 24) => ({ placement, kills, survival, fighters });

test('fitness : la place compte le plus, puis les éliminations et la survie ; bonus de victoire', () => {
  const win = Evolution.fitness(result(1, 0, 300));
  const second = Evolution.fitness(result(2, 0, 300));
  const killer = Evolution.fitness(result(10, 5, 100));
  const early = Evolution.fitness(result(24, 0, 20));
  assert.ok(win > second && second > early);
  assert.ok(killer > Evolution.fitness(result(10, 0, 100)));
  assert.ok(Evolution.fitness(result(5, 0, 200)) > Evolution.fitness(result(5, 0, 100)));
  assert.ok(win - second > 6, 'victoire avantagée');
});

test('breed sans historique : effectif exact (réseau pré-entraîné ou liste vide)', () => {
  const e = new Evolution(null);
  const list = e.breed(10);
  if (Cerveau.initial()) {
    assert.strictEqual(list.length, 10);
    assert.ok(list.every(c => c instanceof Cerveau));
    assert.ok(Reseau.distance(list[0].reseau, list[1].reseau) > 0, 'variantes différentes');
  } else {
    assert.strictEqual(list.length, 0);
  }
});

test('breed avec historique : génération +1, effectif exact, élite conservée, historique vidé', () => {
  const e = new Evolution(null);
  const pop = Array.from({ length: 12 }, () => Cerveau.random());
  pop.forEach((c, i) => e.record(c, result(i + 1, 12 - i)));
  const next = e.breed(20);
  assert.strictEqual(next.length, 20);
  assert.strictEqual(e.generation, 2);
  assert.strictEqual(e.records.length, 0);
  assert.ok(next.includes(pop[0]), 'le meilleur est conservé tel quel');
  assert.ok(e.best && e.best.fitness > 0);
});

test('breed : les enfants héritent des poids de parents de la population', () => {
  const e = new Evolution(null);
  const parents = [Cerveau.random(), Cerveau.random()];
  parents.forEach((c, i) => e.record(c, result(i + 1)));
  e.weightRate = 0;
  e.geneRate = 0;
  const next = e.breed(8);
  for (const child of next.slice(1)) {
    const near = parents.some(p => Reseau.distance(child.reseau, p.reseau) < Reseau.distance(parents[0].reseau, parents[1].reseau));
    assert.ok(near);
  }
});

test('sélection : la neuroévolution améliore une fonction objectif sur les poids', () => {
  // Tâche synthétique : produire l'état 3 quand l'entrée 0 vaut 1 — fitness = probabilité de l'état 3
  const e = new Evolution(null);
  e.weightRate = 0.1;
  e.weightSigma = 0.3;
  const x = new Array(Cerveau.INPUTS).fill(0);
  x[0] = 1;
  const valid = new Array(Cerveau.STATES.length).fill(true);
  let population = Array.from({ length: 24 }, () => Cerveau.random());
  const score = c => c.reseau.forward(x)[3];
  const initial = Math.max(...population.map(score));
  e.population = population;
  for (let gen = 0; gen < 25; gen++) {
    for (const c of population) {
      // placement synthétique : classement par score
      const rank = 1 + population.filter(o => score(o) > score(c)).length;
      e.record(c, { placement: rank, kills: 0, survival: 0, fighters: population.length });
    }
    population = e.breed(24);
  }
  const final = Math.max(...population.map(score));
  assert.ok(final > initial + 0.2, `${initial.toFixed(2)} -> ${final.toFixed(2)}`);
});

test('persistance : la population survit à un redémarrage', () => {
  const storage = fakeStorage();
  const e = new Evolution(storage);
  const pop = Array.from({ length: 5 }, () => Cerveau.random());
  pop.forEach((c, i) => e.record(c, result(i + 1)));
  e.breed(5);
  assert.ok(storage.data['lastzone-evolution-v2']);
  const again = new Evolution(storage);
  assert.strictEqual(again.generation, e.generation);
  assert.strictEqual(again.population.length, Math.min(5, e.maxStored));
  const x = new Array(Cerveau.INPUTS).fill(0.3);
  const a = e.population[0].reseau.forward(x), b = again.population[0].reseau.forward(x);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 3e-2);
});

test('persistance : stockage corrompu ou d\'une autre architecture ignoré', () => {
  const storage = fakeStorage();
  storage.setItem('lastzone-evolution-v2', '{pas du json');
  assert.doesNotThrow(() => new Evolution(storage));
  assert.strictEqual(new Evolution(storage).population.length, 0);
  const other = new Reseau([3, 4, 2], 2);
  storage.setItem('lastzone-evolution-v2', JSON.stringify({ generation: 9, population: [{ genes: Genome.random().genes, reseau: other.toJSON() }] }));
  const e = new Evolution(storage);
  assert.strictEqual(e.generation, 1, 'architecture différente : repart de zéro');
  assert.strictEqual(e.population.length, 0);
});

test('persistance : stockage plein ou absent sans erreur', () => {
  const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  const e = new Evolution(full);
  e.record(Cerveau.random(), result(1));
  assert.doesNotThrow(() => e.breed(3));
  assert.doesNotThrow(() => new Evolution(null).save());
});

test('average et diversité', () => {
  const e = new Evolution(null);
  assert.strictEqual(e.diversity(), 0);
  e.population = [Cerveau.random(), Cerveau.random(), Cerveau.random()];
  assert.ok(e.diversity() > 0);
  const avg = e.average();
  for (const n of Genome.NAMES) assert.ok(avg[n] >= Genome.RANGES[n][0] && avg[n] <= Genome.RANGES[n][1]);
});
