// Évolution des cerveaux : historique par génération, champion, export / import validés, défi du champion.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(41);
const { Evolution, Cerveau, Genome, Match, Bot, resetConfig } = g;

test.beforeEach(() => { resetConfig(); g.seed(11); });

class FakeStorage {
  constructor() { this.data = {}; }
  getItem(k) { return k in this.data ? this.data[k] : null; }
  setItem(k, v) { this.data[k] = String(v); }
}

function playOnce(evolution, count = 6) {
  const brains = evolution.breed(count);
  brains.forEach((b, i) => evolution.record(b, { kills: i, placement: i + 1, fighters: count, survival: 60 + i * 10 }));
  return brains;
}

test('cerveaux : chaque génération ajoute une ligne d\'historique (moyenne, meilleur, classement, éliminations)', () => {
  const e = new Evolution(null);
  assert.deepStrictEqual(Array.from(e.history), []);
  playOnce(e);
  playOnce(e);
  e.breed(6);
  assert.strictEqual(e.history.length, 2);
  const [first] = e.history;
  assert.strictEqual(first.g, 1);
  assert.ok(first.best >= first.avg);
  assert.strictEqual(first.place, 3.5, 'classement moyen de 1..6');
  assert.strictEqual(first.kills, 2.5);
  assert.strictEqual(e.history[1].g, 2);
});

test('cerveaux : l\'historique est borné et sauvegardé / rechargé', () => {
  const storage = new FakeStorage();
  const e = new Evolution(storage);
  e.maxHistory = 5;
  for (let i = 0; i < 8; i++) playOnce(e, 4);
  e.breed(4);
  assert.strictEqual(e.history.length, 5);
  assert.strictEqual(e.history[4].g, 8);
  const reloaded = new Evolution(storage);
  assert.strictEqual(reloaded.history.length, 5);
  assert.strictEqual(reloaded.generation, e.generation);
});

test('cerveaux : un historique corrompu est ignoré au chargement', () => {
  const storage = new FakeStorage();
  const e = new Evolution(storage);
  playOnce(e, 4);
  e.breed(4);
  const data = JSON.parse(storage.getItem(e.key));
  data.history = [{ g: 1, avg: 'abc' }, null, { g: 2, avg: 3 }];
  storage.setItem(e.key, JSON.stringify(data));
  assert.deepStrictEqual(Array.from(new Evolution(storage).history).map(h => h.g), [2]);
});

test('cerveaux : le champion est le meilleur de la dernière génération (sinon le cerveau pré-entraîné)', () => {
  const e = new Evolution(null);
  assert.ok(e.champion(), 'cerveau d\'origine');
  const brains = playOnce(e);
  e.breed(6);
  assert.strictEqual(e.champion(), e.population[0]);
  assert.ok(brains.length === 6);
});

test('cerveaux : défi du champion — des copies du même réseau, personnalités légèrement variées', () => {
  const e = new Evolution(null);
  const list = e.championBrains(8);
  assert.strictEqual(list.length, 8);
  assert.ok(list.every(b => b.reseau === list[0].reseau), 'même réseau');
  assert.deepStrictEqual(list[0].genome.genes, e.champion().genome.genes, 'le premier est fidèle');
  assert.notDeepStrictEqual(list[1].genome.genes, list[0].genome.genes);
});

test('cerveaux : un match en défi du champion donne le même réseau à tous les bots', () => {
  g.seed(7);
  const e = new Evolution(null);
  const m = new Match({ fighters: 6, faune: false, vehicules: false, brains: e.championBrains(6), evolution: null });
  const bots = m.fighters.filter(f => f instanceof Bot && f !== m.joueur);
  assert.ok(bots.length >= 4);
  assert.ok(bots.every(b => b.brain && b.brain.reseau === bots[0].brain.reseau));
});

test('cerveaux : export puis import — le champion revient à l\'identique', () => {
  const a = new Evolution(null);
  playOnce(a);
  a.breed(6);
  const text = a.exportJSON();
  const data = JSON.parse(text);
  assert.strictEqual(data.kind, 'lastzone-cerveau');
  const b = new Evolution(null);
  assert.strictEqual(b.importJSON(text), true);
  const x = a.champion().reseau.toJSON(3);
  const y = b.champion().reseau.toJSON(3);
  assert.deepStrictEqual(Array.from(y.W[0]).slice(0, 20), Array.from(x.W[0]).slice(0, 20));
  assert.deepStrictEqual(b.champion().genome.genes, a.champion().genome.genes);
  assert.ok(b.population.length > 1, 'population reconstruite autour du champion');
});

test('cerveaux : l\'import refuse tout ce qui n\'est pas un cerveau compatible', () => {
  const e = new Evolution(null);
  const good = JSON.parse(e.exportJSON());
  assert.strictEqual(e.importJSON('pas du json'), false);
  assert.strictEqual(e.importJSON('{}'), false);
  assert.strictEqual(e.importJSON(JSON.stringify({ ...good, kind: 'autre' })), false);
  // mauvaise architecture
  const wrongShape = JSON.parse(JSON.stringify(good));
  wrongShape.champion.reseau.sizes = [3, 4, 5];
  assert.strictEqual(e.importJSON(JSON.stringify(wrongShape)), false);
  // tableau trop court
  const short = JSON.parse(JSON.stringify(good));
  short.champion.reseau.W[0] = short.champion.reseau.W[0].slice(1);
  assert.strictEqual(e.importJSON(JSON.stringify(short)), false);
  // nombre non fini / aberrant
  const huge = JSON.parse(JSON.stringify(good));
  huge.champion.reseau.B[1][0] = 1e9;
  assert.strictEqual(e.importJSON(JSON.stringify(huge)), false);
  const text = JSON.parse(JSON.stringify(good));
  text.champion.reseau.B[1][0] = 'abc';
  assert.strictEqual(e.importJSON(JSON.stringify(text)), false);
  // gènes manquants
  const noGenes = JSON.parse(JSON.stringify(good));
  delete noGenes.champion.genes.reflexe;
  assert.strictEqual(e.importJSON(JSON.stringify(noGenes)), false);
});

test('cerveaux : les gènes importés sont ramenés dans leurs bornes', () => {
  const e = new Evolution(null);
  const data = JSON.parse(e.exportJSON());
  data.champion.genes.agressivite = 9999;
  assert.strictEqual(e.importJSON(JSON.stringify(data)), true);
  const [, hi] = Genome.RANGES.agressivite;
  assert.strictEqual(e.champion().genome.genes.agressivite, hi);
});

test('cerveaux : réinitialiser efface la génération, l\'historique et la population', () => {
  const storage = new FakeStorage();
  const e = new Evolution(storage);
  playOnce(e);
  e.breed(6);
  e.reset();
  assert.strictEqual(e.generation, 1);
  assert.strictEqual(e.history.length, 0);
  assert.strictEqual(e.population.length, 0);
  assert.strictEqual(new Evolution(storage).history.length, 0);
});
