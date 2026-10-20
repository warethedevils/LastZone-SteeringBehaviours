const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(7);
const { Reseau } = g;

test.beforeEach(() => g.seed(11));

test('forward : dimensions, softmax qui somme à 1, sorties continues dans [-1, 1]', () => {
  const net = new Reseau([5, 8, 6, 7], 4);
  const out = net.forward([0.1, -0.4, 0.9, 0, 0.5]);
  assert.strictEqual(out.length, 7);
  const sum = out[0] + out[1] + out[2] + out[3];
  assert.ok(Math.abs(sum - 1) < 1e-9);
  for (let i = 0; i < 4; i++) assert.ok(out[i] >= 0 && out[i] <= 1);
  for (let i = 4; i < 7; i++) assert.ok(out[i] >= -1 && out[i] <= 1);
  assert.strictEqual(net.parameterCount, 5 * 8 + 8 + 8 * 6 + 6 + 6 * 7 + 7);
});

test('forward est déterministe et enregistre les activations', () => {
  const net = new Reseau([3, 4, 2], 2);
  const x = [0.3, 0.2, -0.7];
  const a = Array.from(net.forward(x));
  const b = Array.from(net.forward(x));
  assert.deepStrictEqual(a, b);
  assert.strictEqual(net.activations[0][2], -0.7);
  assert.ok(Math.abs(net.activations[1][0]) <= 1, 'tanh');
});

test('rétropropagation : gradient analytique égal au gradient numérique', () => {
  const net = new Reseau([4, 5, 3, 5], 3);
  const sample = { x: [0.5, -0.2, 0.8, 0.1], y: [0, 1, 0, 0.3, -0.4] };
  const loss = () => {
    const raw = Array.from(net.forwardRaw(sample.x));
    const k = 3;
    const max = Math.max(raw[0], raw[1], raw[2]);
    const e = raw.slice(0, k).map(v => Math.exp(v - max));
    const total = e.reduce((s, v) => s + v, 0);
    let l = -Math.log(e[1] / total);
    for (let i = k; i < 5; i++) { const err = Math.tanh(raw[i]) - sample.y[i]; l += 0.5 * err * err; }
    return l;
  };
  const gradW = net.W.map(w => new Float64Array(w.length));
  const gradB = net.B.map(b => new Float64Array(b.length));
  const delta = net.sizes.map(n => new Float64Array(n));
  net.backward(sample, delta, gradW, gradB, null);
  const eps = 1e-6;
  for (let l = 0; l < net.W.length; l++) {
    for (const i of [0, 3, net.W[l].length - 1]) {
      const original = net.W[l][i];
      net.W[l][i] = original + eps; const plus = loss();
      net.W[l][i] = original - eps; const minus = loss();
      net.W[l][i] = original;
      const numeric = (plus - minus) / (2 * eps);
      assert.ok(Math.abs(numeric - gradW[l][i]) < 1e-5, `couche ${l} poids ${i} : ${numeric} vs ${gradW[l][i]}`);
    }
    const bi = 0;
    const original = net.B[l][bi];
    net.B[l][bi] = original + eps; const plus = loss();
    net.B[l][bi] = original - eps; const minus = loss();
    net.B[l][bi] = original;
    assert.ok(Math.abs((plus - minus) / (2 * eps) - gradB[l][bi]) < 1e-5, `biais couche ${l}`);
  }
});

test('apprentissage : le réseau apprend une frontière non linéaire (XOR de signes)', () => {
  const net = new Reseau([2, 12, 8, 2], 2);
  const samples = [];
  for (let i = 0; i < 600; i++) {
    const a = g.sandbox.random() * 2 - 1;
    const b = g.sandbox.random() * 2 - 1;
    samples.push({ x: [a, b], y: (a * b > 0) ? [1, 0] : [0, 1] });
  }
  const first = net.train(samples, { epochs: 1, lr: 0.01, batch: 32 });
  const stats = net.train(samples, { epochs: 60, lr: 0.01, batch: 32 });
  assert.ok(stats.loss < first.loss, 'la perte diminue');
  assert.ok(stats.accuracy > 0.93, `précision ${stats.accuracy}`);
});

test('apprentissage : les sorties continues convergent vers leurs cibles', () => {
  const net = new Reseau([1, 10, 2], 1);
  const samples = [];
  for (let i = 0; i < 200; i++) {
    const x = g.sandbox.random() * 2 - 1;
    samples.push({ x: [x], y: [1, Math.sin(2 * x) * 0.8] });
  }
  net.train(samples, { epochs: 80, lr: 0.01, batch: 20 });
  let err = 0;
  for (const s of samples) err += Math.abs(net.forward(s.x)[1] - s.y[1]);
  assert.ok(err / samples.length < 0.12, `erreur moyenne ${err / samples.length}`);
});

test('les poids de classe orientent l\'apprentissage vers les classes rares', () => {
  const samples = [];
  for (let i = 0; i < 400; i++) samples.push({ x: [0.1 * (i % 3), 0.2], y: [1, 0] });
  for (let i = 0; i < 20; i++) samples.push({ x: [0.9, -0.7], y: [0, 1] });
  const plain = new Reseau([2, 8, 2], 2);
  plain.train(samples, { epochs: 40, lr: 0.01, batch: 32 });
  const weighted = new Reseau([2, 8, 2], 2);
  weighted.train(samples, { epochs: 40, lr: 0.01, batch: 32, classWeights: [0.3, 4] });
  const rare = [0.9, -0.7];
  assert.ok(weighted.forward(rare)[1] >= plain.forward(rare)[1] - 1e-6);
  assert.ok(weighted.forward(rare)[1] > 0.5);
});

test('clone est indépendant de l\'original', () => {
  const net = new Reseau([3, 4, 2], 2);
  const copy = net.clone();
  assert.deepStrictEqual(Array.from(copy.forward([1, 0, -1])), Array.from(net.forward([1, 0, -1])));
  copy.W[0][0] += 5;
  assert.notStrictEqual(copy.W[0][0], net.W[0][0]);
});

test('mutate : taux 0 = clone exact, taux 1 modifie tous les poids, amplitude bornée par sigma', () => {
  const net = new Reseau([4, 6, 3], 3);
  const same = net.mutate(0, 0.5);
  assert.strictEqual(Reseau.distance(net, same), 0);
  const changed = net.mutate(1, 0.1);
  assert.ok(Reseau.distance(net, changed) > 0.01);
  const tiny = net.mutate(1, 0.001);
  assert.ok(Reseau.distance(net, tiny) < 0.01);
});

test('crossover : chaque poids vient d\'un parent', () => {
  const a = new Reseau([3, 5, 2], 2);
  const b = new Reseau([3, 5, 2], 2);
  const child = Reseau.crossover(a, b);
  let fromA = 0, fromB = 0;
  for (let l = 0; l < child.W.length; l++) {
    for (let i = 0; i < child.W[l].length; i++) {
      if (child.W[l][i] === a.W[l][i]) fromA++;
      else if (child.W[l][i] === b.W[l][i]) fromB++;
      else assert.fail('poids inconnu');
    }
  }
  assert.ok(fromA > 0 && fromB > 0);
});

test('JSON : aller-retour fidèle (aux arrondis près)', () => {
  const net = new Reseau([4, 6, 3], 2);
  const copy = Reseau.fromJSON(JSON.parse(JSON.stringify(net.toJSON(6))));
  const x = [0.3, -0.8, 0.5, 0.1];
  const a = net.forward(x), b = copy.forward(x);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < 1e-4);
  assert.deepStrictEqual(Array.from(copy.sizes), Array.from(net.sizes));
  assert.strictEqual(copy.softmaxCount, 2);
});
