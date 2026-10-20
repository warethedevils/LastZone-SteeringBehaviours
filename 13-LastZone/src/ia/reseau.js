// Réseau de neurones multicouche (perceptron) écrit à la main, sans dépendance :
//   - propagation avant (tanh sur les couches cachées, sortie linéaire),
//   - rétropropagation + optimiseur Adam (apprentissage supervisé),
//   - opérateurs génétiques : clone, mutation gaussienne, croisement (neuroévolution),
//   - sérialisation JSON.
// La sortie est découpée en deux parties : les `softmaxCount` premières sorties
// forment une distribution de probabilités (choix d'un état), les suivantes sont
// des valeurs continues dans [-1, 1] (tanh).
// Structure de données, pas une entité du monde.

class Reseau {
  // sizes : [entrées, cachée1, cachée2, ..., sorties]
  constructor(sizes, softmaxCount = 0) {
    this.sizes = sizes.slice();
    this.softmaxCount = softmaxCount;
    this.W = [];      // W[l] : matrice (sizes[l+1] x sizes[l]) à plat
    this.B = [];      // B[l] : biais de la couche l+1
    for (let l = 0; l < sizes.length - 1; l++) {
      const fanIn = sizes[l];
      const fanOut = sizes[l + 1];
      const scale = Math.sqrt(2 / (fanIn + fanOut));         // initialisation de Glorot
      const w = new Float64Array(fanIn * fanOut);
      for (let i = 0; i < w.length; i++) w[i] = Reseau.gaussian() * scale;
      this.W.push(w);
      this.B.push(new Float64Array(fanOut));
    }
    // dernière propagation (affichage du réseau en direct)
    this.activations = sizes.map(n => new Float64Array(n));
  }

  static gaussian() {
    return (random(-1, 1) + random(-1, 1) + random(-1, 1)) * 1.0;   // ≈ N(0, 1)
  }

  get layerCount() { return this.sizes.length; }
  get inputSize() { return this.sizes[0]; }
  get outputSize() { return this.sizes[this.sizes.length - 1]; }

  get parameterCount() {
    return this.W.reduce((s, w) => s + w.length, 0) + this.B.reduce((s, b) => s + b.length, 0);
  }

  // ---------- Propagation avant ----------

  // Retourne le tableau des sorties brutes (avant softmax / tanh de sortie)
  forwardRaw(input) {
    let current = input;
    this.activations[0].set(input);
    for (let l = 0; l < this.W.length; l++) {
      const inN = this.sizes[l];
      const outN = this.sizes[l + 1];
      const w = this.W[l];
      const b = this.B[l];
      const next = this.activations[l + 1];
      const last = l === this.W.length - 1;
      for (let j = 0; j < outN; j++) {
        let sum = b[j];
        const row = j * inN;
        for (let i = 0; i < inN; i++) sum += w[row + i] * current[i];
        next[j] = last ? sum : Math.tanh(sum);
      }
      current = next;
    }
    return current;
  }

  // Sorties interprétées : probabilités (softmax) puis valeurs continues (tanh)
  forward(input) {
    const raw = this.forwardRaw(input);
    const out = new Float64Array(raw.length);
    const k = this.softmaxCount;
    if (k > 0) {
      let max = -Infinity;
      for (let i = 0; i < k; i++) max = Math.max(max, raw[i]);
      let total = 0;
      for (let i = 0; i < k; i++) { out[i] = Math.exp(raw[i] - max); total += out[i]; }
      for (let i = 0; i < k; i++) out[i] /= total;
    }
    for (let i = k; i < raw.length; i++) out[i] = Math.tanh(raw[i]);
    return out;
  }

  // ---------- Apprentissage ----------

  // samples : [{ x: tableau d'entrées, y: tableau de cibles (one-hot puis continues) }]
  // Retourne { loss, accuracy } sur les échantillons (précision = bonne classe).
  train(samples, { epochs = 20, lr = 0.003, batch = 64, classWeights = null, l2 = 1e-5, onEpoch = null } = {}) {
    const layers = this.W.length;
    const m = this.W.map(w => new Float64Array(w.length));
    const v = this.W.map(w => new Float64Array(w.length));
    const mb = this.B.map(b => new Float64Array(b.length));
    const vb = this.B.map(b => new Float64Array(b.length));
    const gradW = this.W.map(w => new Float64Array(w.length));
    const gradB = this.B.map(b => new Float64Array(b.length));
    const delta = this.sizes.map(n => new Float64Array(n));
    const order = samples.map((_, i) => i);
    let step = 0;
    let stats = { loss: 0, accuracy: 0 };

    for (let epoch = 0; epoch < epochs; epoch++) {
      for (let i = order.length - 1; i > 0; i--) {                 // mélange
        const j = Math.floor(random(i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      let lossSum = 0;
      let correct = 0;
      for (let start = 0; start < order.length; start += batch) {
        const end = Math.min(order.length, start + batch);
        for (const g of gradW) g.fill(0);
        for (const g of gradB) g.fill(0);
        for (let s = start; s < end; s++) {
          const sample = samples[order[s]];
          const result = this.backward(sample, delta, gradW, gradB, classWeights);
          lossSum += result.loss;
          if (result.correct) correct++;
        }
        const scale = 1 / (end - start);
        step++;
        const b1 = 0.9, b2 = 0.999, eps = 1e-8;
        const corr1 = 1 - Math.pow(b1, step);
        const corr2 = 1 - Math.pow(b2, step);
        for (let l = 0; l < layers; l++) {
          const w = this.W[l], gw = gradW[l], mw = m[l], vw = v[l];
          for (let i = 0; i < w.length; i++) {
            const g = gw[i] * scale + l2 * w[i];
            mw[i] = b1 * mw[i] + (1 - b1) * g;
            vw[i] = b2 * vw[i] + (1 - b2) * g * g;
            w[i] -= lr * (mw[i] / corr1) / (Math.sqrt(vw[i] / corr2) + eps);
          }
          const bias = this.B[l], gb = gradB[l], mbl = mb[l], vbl = vb[l];
          for (let i = 0; i < bias.length; i++) {
            const g = gb[i] * scale;
            mbl[i] = b1 * mbl[i] + (1 - b1) * g;
            vbl[i] = b2 * vbl[i] + (1 - b2) * g * g;
            bias[i] -= lr * (mbl[i] / corr1) / (Math.sqrt(vbl[i] / corr2) + eps);
          }
        }
      }
      stats = { loss: lossSum / samples.length, accuracy: correct / samples.length };
      if (onEpoch) onEpoch(epoch, stats);
    }
    return stats;
  }

  // Passe avant + rétropropagation d'un échantillon ; accumule les gradients.
  backward(sample, delta, gradW, gradB, classWeights) {
    const raw = this.forwardRaw(sample.x);
    const k = this.softmaxCount;
    const outN = raw.length;
    const layers = this.W.length;
    const out = delta[layers];
    let loss = 0;
    let correct = true;
    // sortie : entropie croisée (softmax) + erreur quadratique (tanh)
    if (k > 0) {
      let max = -Infinity;
      for (let i = 0; i < k; i++) max = Math.max(max, raw[i]);
      let total = 0;
      const p = new Float64Array(k);
      for (let i = 0; i < k; i++) { p[i] = Math.exp(raw[i] - max); total += p[i]; }
      let target = 0;
      let predicted = 0;
      for (let i = 0; i < k; i++) {
        p[i] /= total;
        if (sample.y[i] > sample.y[target]) target = i;
        if (p[i] > p[predicted]) predicted = i;
      }
      const weight = classWeights ? classWeights[target] : 1;
      loss += -Math.log(Math.max(1e-9, p[target])) * weight;
      correct = target === predicted;
      for (let i = 0; i < k; i++) out[i] = (p[i] - sample.y[i]) * weight;
    }
    for (let i = k; i < outN; i++) {
      const t = Math.tanh(raw[i]);
      const err = t - sample.y[i];
      loss += 0.5 * err * err;
      out[i] = err * (1 - t * t);
    }
    // couches
    for (let l = layers - 1; l >= 0; l--) {
      const inN = this.sizes[l];
      const nOut = this.sizes[l + 1];
      const w = this.W[l];
      const gw = gradW[l];
      const gb = gradB[l];
      const input = l === 0 ? sample.x : this.activations[l];
      const d = delta[l + 1];
      for (let j = 0; j < nOut; j++) {
        const dj = d[j];
        gb[j] += dj;
        const row = j * inN;
        for (let i = 0; i < inN; i++) gw[row + i] += dj * input[i];
      }
      if (l > 0) {
        const prev = delta[l];
        const a = this.activations[l];
        for (let i = 0; i < inN; i++) {
          let sum = 0;
          for (let j = 0; j < nOut; j++) sum += w[j * inN + i] * d[j];
          prev[i] = sum * (1 - a[i] * a[i]);
        }
      }
    }
    return { loss, correct };
  }

  // ---------- Neuroévolution ----------

  clone() {
    const copy = new Reseau(this.sizes, this.softmaxCount);
    for (let l = 0; l < this.W.length; l++) {
      copy.W[l].set(this.W[l]);
      copy.B[l].set(this.B[l]);
    }
    return copy;
  }

  // Mutation gaussienne : chaque poids est perturbé avec la probabilité `rate`
  mutate(rate, sigma) {
    const child = this.clone();
    for (let l = 0; l < child.W.length; l++) {
      for (const arr of [child.W[l], child.B[l]]) {
        for (let i = 0; i < arr.length; i++) {
          if (random(1) < rate) arr[i] += Reseau.gaussian() * sigma;
        }
      }
    }
    return child;
  }

  // Croisement uniforme poids par poids (réseaux de même architecture)
  static crossover(a, b) {
    const child = a.clone();
    for (let l = 0; l < child.W.length; l++) {
      for (let i = 0; i < child.W[l].length; i++) if (random(1) < 0.5) child.W[l][i] = b.W[l][i];
      for (let i = 0; i < child.B[l].length; i++) if (random(1) < 0.5) child.B[l][i] = b.B[l][i];
    }
    return child;
  }

  // Distance moyenne entre deux réseaux (diversité de la population)
  static distance(a, b) {
    let sum = 0;
    let n = 0;
    for (let l = 0; l < a.W.length; l++) {
      for (let i = 0; i < a.W[l].length; i++) { sum += Math.abs(a.W[l][i] - b.W[l][i]); n++; }
    }
    return n ? sum / n : 0;
  }

  // ---------- Sérialisation ----------

  toJSON(decimals = 4) {
    const round = arr => Array.from(arr, x => Number(x.toFixed(decimals)));
    return { sizes: this.sizes, softmaxCount: this.softmaxCount, W: this.W.map(round), B: this.B.map(round) };
  }

  static fromJSON(data) {
    const net = new Reseau(data.sizes, data.softmaxCount);
    for (let l = 0; l < net.W.length; l++) {
      net.W[l].set(data.W[l]);
      net.B[l].set(data.B[l]);
    }
    return net;
  }
}
