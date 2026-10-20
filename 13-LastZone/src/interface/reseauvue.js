// Visualisation du réseau de neurones d'un bot : couches, activations en direct,
// connexions les plus influentes, sorties (probabilité de chaque état) et
// personnalité. Rendu uniquement ; lit les activations déjà calculées (aucun
// recalcul des décisions).

const ReseauVue = {
  // Couleur d'une activation tanh [-1, 1] : bleu (négatif) -> sombre -> orange (positif)
  tint(a) {
    const t = Math.max(-1, Math.min(1, a));
    if (t >= 0) return [30 + 225 * t, 40 + 150 * t, 60 - 20 * t];
    return [30 + 20 * -t, 50 + 110 * -t, 70 + 180 * -t];
  },

  // Positions des nœuds de chaque couche dans la zone (x, y, w, h)
  layout(sizes, x, y, w, h, labelWidth) {
    const left = x + labelWidth;
    const span = w - labelWidth - 120;
    return sizes.map((n, l) => {
      const cx = left + (span * l) / (sizes.length - 1);
      return Array.from({ length: n }, (_, i) => ({ x: cx, y: y + 34 + ((h - 48) * (i + 0.5)) / n }));
    });
  },

  // bot : Bot doté d'un cerveau ; (x, y, w, h) : emplacement du panneau
  draw(bot, x, y, w, h) {
    if (!bot || !bot.brain) return;
    const net = bot.brain.reseau;
    const act = net.activations;
    const nodes = this.layout(net.sizes, x, y, w, h, 8);
    Ui.panel(x, y, w, h, { alpha: 215, radius: 12, edgeWeight: 1.5 });
    Ui.label(`CERVEAU · ${bot.name}`, x + 14, y + 16, 15, PALETTE.yellow, LEFT, FONT_TITLE, false);
    const decision = bot.brain.last;
    Ui.label(bot.state.toUpperCase(), x + w - 14, y + 16, 15, PALETTE.green, RIGHT, FONT_TITLE, false);

    // connexions : les plus influentes (|poids x activation d'entrée|) de chaque couche
    push();
    for (let l = 0; l < net.W.length; l++) {
      const inN = net.sizes[l];
      const outN = net.sizes[l + 1];
      const W = net.W[l];
      const influence = new Float64Array(W.length);
      for (let j = 0; j < outN; j++) for (let i = 0; i < inN; i++) influence[j * inN + i] = Math.abs(W[j * inN + i] * act[l][i]);
      const sorted = Float64Array.from(influence).sort();
      const keep = Math.min(70, sorted.length);
      const threshold = sorted[sorted.length - keep];
      for (let j = 0; j < outN; j++) {
        for (let i = 0; i < inN; i++) {
          const v = influence[j * inN + i];
          if (v < threshold || v < 0.02) continue;
          const a = nodes[l][i], b = nodes[l + 1][j];
          const positive = W[j * inN + i] * act[l][i] >= 0;
          stroke(positive ? 255 : 90, positive ? 170 : 150, positive ? 60 : 255, Math.min(210, 40 + v * 220));
          strokeWeight(0.6 + Math.min(2, v * 2));
          line(a.x, a.y, b.x, b.y);
        }
      }
    }
    // nœuds
    noStroke();
    nodes.forEach((layer, l) => {
      const r = Math.max(1.8, Math.min(5, (h - 60) / layer.length / 2.2));
      layer.forEach((p, i) => {
        const [cr, cg, cb] = this.tint(l === 0 ? act[0][i] * 2 - 1 : act[l][i]);
        fill(cr, cg, cb);
        circle(p.x, p.y, r * 2);
      });
    });
    pop();

    // entrées les plus actives (étiquettes)
    const labels = Cerveau.INPUT_LABELS;
    const top = Array.from(act[0]).map((v, i) => ({ v: Math.abs(v), i })).sort((a, b) => b.v - a.v).slice(0, 4);
    top.forEach((t, k) => {
      const p = nodes[0][t.i];
      Ui.label(labels[t.i], x + 14, y + h - 14 - k * 13, 10, PALETTE.dim, LEFT, FONT_BODY, false);
    });

    // sorties : probabilité de chaque état + réglages continus
    const outs = nodes[nodes.length - 1];
    const stateCount = Cerveau.STATES.length;
    outs.forEach((p, i) => {
      const isState = i < stateCount;
      const continuous = decision ? [decision.idealScale, decision.aimTol, decision.buildBias, ...decision.gains] : [];
      const value = isState ? (decision ? decision.probs[i] : 0) : (continuous[i - stateCount] || 0);
      const chosen = isState && decision && Cerveau.STATES[i] === bot.state;
      Ui.label(Cerveau.OUTPUT_LABELS[i], p.x + 14, p.y, 11, chosen ? PALETTE.yellow : PALETTE.white, LEFT, FONT_BODY, false);
      push();
      noStroke();
      fill(8, 12, 34, 220);
      rect(p.x + 70, p.y - 4, 48, 8, 4);
      if (isState) fill(...(chosen ? PALETTE.yellow : [90, 150, 255]));
      else fill(value >= 0 ? color(255, 170, 70) : color(90, 150, 255));
      const width = isState ? 48 * value : 24 * Math.abs(value);
      rect(isState ? p.x + 70 : p.x + 70 + (value >= 0 ? 24 : 24 - width), p.y - 4, Math.max(1, width), 8, 4);
      pop();
    });
  },

  // Schéma statique de l'architecture (page Stats du lobby)
  schema(sizes, x, y, w, h, phase = 0) {
    const nodes = this.layout(sizes, x, y, w, h, 0);
    push();
    stroke(120, 150, 255, 26);
    strokeWeight(1);
    for (let l = 0; l < nodes.length - 1; l++) {
      for (let k = 0; k < 90; k++) {
        const a = nodes[l][(k * 7 + l * 3) % nodes[l].length];
        const b = nodes[l + 1][(k * 11 + 5) % nodes[l + 1].length];
        line(a.x, a.y, b.x, b.y);
      }
    }
    noStroke();
    nodes.forEach((layer, l) => {
      const r = Math.max(2, Math.min(5.5, (h - 40) / layer.length / 2.1));
      layer.forEach((p, i) => {
        const pulse = 0.5 + 0.5 * Math.sin(phase * 2 + l * 1.3 + i * 0.7);
        fill(60 + 190 * pulse, 110 + 80 * pulse, 255 - 150 * pulse);
        circle(p.x, p.y, r * 2);
      });
    });
    pop();
  }
};
