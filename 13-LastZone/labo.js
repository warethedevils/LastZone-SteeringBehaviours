// Labo : panneau de sliders (touche L) pour régler en direct les paramètres des
// comportements, comme dans les exemples du dépôt (maxSpeed, maxForce, wander,
// poids, rayons de perception...). Les entités relisent CONFIG à chaque pas.

const LABO_SECTIONS = [
  { titre: 'Joueur', params: [
    ['joueur.maxSpeed', 'Vitesse max', 1, 8, 0.1],
    ['joueur.sprintFactor', 'Facteur de sprint', 1, 2.5, 0.05],
    ['joueur.maxForce', 'Force max', 0.1, 2, 0.05],
    ['joueur.pickupRadius', 'Rayon de ramassage', 20, 140, 2],
    ['joueur.harvestDamage', 'Dégâts de la pioche', 5, 80, 1],
    ['joueur.wallHp', "Vie d'un mur", 40, 500, 10]
  ] },
  { titre: 'Bots : déplacement', params: [
    ['bot.maxSpeed', 'Vitesse max', 1, 6, 0.1],
    ['bot.maxForce', 'Force max', 0.05, 1.5, 0.05],
    ['bot.perception', 'Rayon de perception', 100, 1000, 10],
    ['bot.lootPerception', 'Rayon de perception du butin', 100, 1000, 10],
    ['bot.aimTurn', 'Vitesse du viseur', 0.02, 0.5, 0.01],
    ['bot.strafeEvery', 'Changement de côté (s)', 0.3, 5, 0.1]
  ] },
  { titre: 'Bots : poids des forces', params: [
    ['bot.weights.loot', 'Butin', 0, 4, 0.1],
    ['bot.weights.wander', 'Errance (wander)', 0, 3, 0.1],
    ['bot.weights.avoid', 'Évitement', 0, 8, 0.1],
    ['bot.weights.separation', 'Séparation', 0, 4, 0.1],
    ['bot.weights.zone', 'Zone', 0, 4, 0.1],
    ['bot.weights.engage', 'Engagement', 0, 4, 0.1],
    ['bot.weights.dodge', 'Esquive', 0, 8, 0.1],
    ['bot.weights.flee', 'Fuite', 0, 6, 0.1],
    ['bot.wanderDistance', 'Wander : distance', 10, 300, 5],
    ['bot.wanderRadius', 'Wander : rayon', 5, 150, 5],
    ['bot.wanderDisplace', 'Wander : variation', 0.05, 1, 0.05]
  ] },
  { titre: 'Bus & chute', params: [
    ['match.busSpeed', 'Vitesse du bus', 1, 12, 0.2],
    ['match.fallTime', 'Durée de chute (s)', 2, 12, 0.5],
    ['match.airSpeed', 'Vitesse en chute', 2, 14, 0.5],
    ['match.autoJumpAfter', 'Saut automatique (s)', 5, 30, 1]
  ] },
  { titre: 'Tempête', params: [
    ['tempete.speedFactor', 'Vitesse (prochain match)', 0.5, 4, 0.1],
    ['tempete.startRadius', 'Rayon initial', 1200, 2400, 50]
  ] }
];

class Labo {
  constructor(root, onDebugChange, onMuteChange) {
    this.root = root;
    this.inputs = [];
    this.build(onDebugChange, onMuteChange);
  }

  static get(path) {
    return path.split('.').reduce((o, k) => o[k], CONFIG);
  }

  static set(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((o, k) => o[k], CONFIG)[last] = value;
  }

  build(onDebugChange, onMuteChange) {
    this.panel = document.createElement('div');
    this.panel.id = 'labo';
    this.panel.hidden = true;
    const head = document.createElement('div');
    head.className = 'labo-head';
    head.textContent = 'LABO — paramètres en direct';
    this.panel.appendChild(head);
    for (const section of LABO_SECTIONS) {
      const title = document.createElement('h3');
      title.textContent = section.titre;
      this.panel.appendChild(title);
      for (const [path, label, min, max, step] of section.params) {
        this.panel.appendChild(this.row(path, label, min, max, step));
      }
    }
    const reset = document.createElement('button');
    reset.textContent = 'Valeurs par défaut';
    reset.addEventListener('click', () => { resetConfig(); this.refresh(); reset.blur(); });
    this.panel.appendChild(reset);
    this.root.appendChild(this.panel);

    // cases à cocher toujours visibles
    this.bar = document.createElement('div');
    this.bar.id = 'toolbar';
    this.debugBox = this.checkbox('Debug (D)', onDebugChange);
    this.muteBox = this.checkbox('Muet (M)', onMuteChange);
    this.laboBtn = document.createElement('button');
    this.laboBtn.textContent = 'Labo (L)';
    this.laboBtn.addEventListener('click', () => { this.toggle(); this.laboBtn.blur(); });
    this.bar.appendChild(this.laboBtn);
    this.root.appendChild(this.bar);
  }

  checkbox(text, onChange) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => { onChange(box.checked); box.blur(); });
    label.appendChild(box);
    label.appendChild(document.createTextNode(' ' + text));
    this.bar.appendChild(label);
    return box;
  }

  row(path, label, min, max, step) {
    const row = document.createElement('label');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = label;
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min;
    slider.max = max;
    slider.step = step;
    const value = document.createElement('output');
    slider.addEventListener('input', () => {
      Labo.set(path, parseFloat(slider.value));
      value.textContent = slider.value;
    });
    slider.addEventListener('change', () => slider.blur());
    row.append(name, slider, value);
    this.inputs.push({ path, slider, value });
    return row;
  }

  // Relit CONFIG (après une réinitialisation ou une amélioration)
  refresh() {
    for (const { path, slider, value } of this.inputs) {
      const v = Labo.get(path);
      slider.value = v;
      value.textContent = Number(v.toFixed ? v.toFixed(3) : v);
    }
  }

  toggle() {
    this.panel.hidden = !this.panel.hidden;
    if (!this.panel.hidden) this.refresh();
  }

  setDebug(on) { this.debugBox.checked = on; }
  setMute(on) { this.muteBox.checked = on; }
}
