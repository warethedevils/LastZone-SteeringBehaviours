// Boîte à outils d'interface en « mode immédiat » : chaque widget se dessine et
// renvoie son état dans le même appel (clic, valeur). Rendu uniquement, en
// coordonnées logiques 1280 x 720 ; aucune logique de jeu ici.

const FONT_TITLE = 'Impact';
const FONT_BODY = 'Trebuchet MS';

const PALETTE = {
  yellow: [255, 214, 56], yellowDark: [214, 150, 20],
  blue: [48, 120, 255], blueDark: [22, 52, 140],
  panel: [14, 20, 52], panelEdge: [70, 104, 220],
  white: [245, 248, 255], dim: [150, 165, 205],
  green: [90, 230, 120], red: [255, 80, 90], purple: [170, 90, 255]
};

const Ui = {
  mx: 0, my: 0,
  down: false,       // bouton enfoncé
  clicked: false,    // front montant, valable pour cette image
  released: false,
  dragging: null,    // identifiant du slider en cours de déplacement
  editing: null,     // identifiant du champ texte en cours d'édition
  hover: null,

  // Appelé au début de chaque image avec la souris en coordonnées logiques
  begin(mx, my, down, clicked, released) {
    this.mx = mx;
    this.my = my;
    this.down = down;
    this.clicked = clicked;
    this.released = released;
    if (released) this.dragging = null;
    this.hover = null;
  },

  over(x, y, w, h) {
    return this.mx >= x && this.mx <= x + w && this.my >= y && this.my <= y + h;
  },

  setFont(name, size) {
    textFont(name);
    textSize(size);
  },

  // Texte avec ombre portée
  label(str, x, y, size, color = PALETTE.white, align = LEFT, font = FONT_BODY, shadow = true) {
    push();
    textFont(font);
    textSize(size);
    textAlign(align, CENTER);
    noStroke();
    if (shadow) {
      fill(0, 0, 0, 150);
      text(str, x + 2, y + 2);
    }
    fill(color[0], color[1], color[2], color[3] === undefined ? 255 : color[3]);
    text(str, x, y);
    pop();
  },

  // Gros titre façon jeu : contour sombre + remplissage
  title(str, x, y, size, color = PALETTE.yellow, align = CENTER) {
    push();
    textFont(FONT_TITLE);
    textSize(size);
    textAlign(align, CENTER);
    stroke(20, 24, 60);
    strokeWeight(Math.max(4, size / 7));
    strokeJoin(ROUND);
    fill(0, 0, 0, 120);
    text(str, x + size * 0.05, y + size * 0.06);
    stroke(20, 24, 60);
    fill(color[0], color[1], color[2]);
    text(str, x, y);
    noStroke();
    fill(255, 255, 255, 60);
    pop();
  },

  panel(x, y, w, h, opts = {}) {
    push();
    const [r, g, b] = opts.color || PALETTE.panel;
    noStroke();
    fill(0, 0, 0, 70);
    rect(x + 4, y + 6, w, h, opts.radius === undefined ? 14 : opts.radius);
    fill(r, g, b, opts.alpha === undefined ? 225 : opts.alpha);
    stroke(...(opts.edge || PALETTE.panelEdge), 190);
    strokeWeight(opts.edgeWeight || 2);
    rect(x, y, w, h, opts.radius === undefined ? 14 : opts.radius);
    pop();
    if (opts.title) this.label(opts.title, x + 18, y + 24, 18, PALETTE.yellow, LEFT, FONT_TITLE);
  },

  // style : 'primary' (jaune), 'secondary' (bleu), 'ghost', 'danger'
  button(id, x, y, w, h, label, style = 'secondary', opts = {}) {
    const enabled = opts.enabled !== false;
    const hot = enabled && this.over(x, y, w, h);
    if (hot) this.hover = id;
    const pressed = hot && this.down;
    const palette = {
      primary: [PALETTE.yellow, PALETTE.yellowDark, [40, 28, 6]],
      secondary: [PALETTE.blue, PALETTE.blueDark, PALETTE.white],
      ghost: [[40, 54, 110], [24, 32, 78], PALETTE.white],
      danger: [PALETTE.red, [150, 30, 50], PALETTE.white],
      selected: [PALETTE.green, [30, 120, 60], [8, 40, 20]]
    }[style];
    const [top, bottom, text] = palette;
    push();
    translate(0, pressed ? 3 : 0);
    noStroke();
    fill(0, 0, 0, 90);
    rect(x + 2, y + 6, w, h, 10);
    fill(bottom[0], bottom[1], bottom[2], enabled ? 255 : 120);
    rect(x, y + 4, w, h, 10);
    fill(top[0] * (hot ? 1.1 : 1), top[1] * (hot ? 1.1 : 1), top[2] * (hot ? 1.1 : 1), enabled ? 255 : 120);
    rect(x, y, w, h, 10);
    fill(255, 255, 255, hot ? 60 : 36);
    rect(x + 4, y + 3, w - 8, h * 0.42, 8);
    pop();
    this.label(label, x + w / 2, y + h / 2 + (pressed ? 3 : 0), opts.size || Math.min(26, h * 0.52),
      enabled ? text : [170, 175, 190], CENTER, opts.font || FONT_TITLE, false);
    return enabled && hot && this.clicked;
  },

  toggle(id, x, y, text, value) {
    const hot = this.over(x, y - 14, 300, 28);
    if (hot) this.hover = id;
    push();
    noStroke();
    fill(value ? color(...PALETTE.green) : color(60, 70, 110));
    rect(x, y - 12, 48, 24, 12);
    fill(255);
    circle(x + (value ? 36 : 12), y, 18);
    pop();
    this.label(text, x + 62, y, 17, PALETTE.white);
    return hot && this.clicked ? !value : value;
  },

  slider(id, x, y, w, value, min, max, format = v => v.toFixed(2)) {
    const hot = this.over(x - 8, y - 14, w + 16, 28);
    if (hot) this.hover = id;
    if (hot && this.clicked) this.dragging = id;
    if (this.dragging === id && this.down) {
      value = min + constrain((this.mx - x) / w, 0, 1) * (max - min);
    }
    const t = (value - min) / (max - min);
    push();
    noStroke();
    fill(40, 52, 100);
    rect(x, y - 4, w, 8, 4);
    fill(...PALETTE.yellow);
    rect(x, y - 4, w * t, 8, 4);
    fill(255);
    stroke(20, 24, 60);
    strokeWeight(2);
    circle(x + w * t, y, 20);
    pop();
    this.label(format(value), x + w + 18, y, 15, PALETTE.dim);
    return value;
  },

  bar(x, y, w, h, ratio, color, back = [10, 14, 34]) {
    push();
    noStroke();
    fill(back[0], back[1], back[2], 190);
    rect(x, y, w, h, h / 2);
    if (ratio > 0) {
      fill(color[0], color[1], color[2]);
      rect(x, y, Math.max(h, w * constrain(ratio, 0, 1)), h, h / 2);
      fill(255, 255, 255, 60);
      rect(x + 2, y + 1, Math.max(h - 4, w * constrain(ratio, 0, 1) - 4), h * 0.4, h / 2);
    }
    pop();
  },

  // Champ texte : retourne le texte (la saisie arrive via Ui.type)
  textField(id, x, y, w, h, value) {
    const hot = this.over(x, y, w, h);
    if (hot) this.hover = id;
    if (this.clicked) this.editing = hot ? id : (this.editing === id ? null : this.editing);
    const active = this.editing === id;
    push();
    noStroke();
    fill(8, 12, 34);
    stroke(...(active ? PALETTE.yellow : PALETTE.panelEdge));
    strokeWeight(2);
    rect(x, y, w, h, 8);
    pop();
    const cursor = active && Math.floor(frameCount / 25) % 2 === 0 ? '|' : '';
    this.label(value + cursor, x + 14, y + h / 2, 20, PALETTE.white, LEFT, FONT_BODY, false);
    return value;
  },

  // Saisie clavier pour le champ en édition ; retourne la nouvelle valeur ou null
  type(value, keyName, maxLength = 12) {
    if (keyName === 'Backspace') return value.slice(0, -1);
    if (keyName === 'Enter' || keyName === 'Escape') { this.editing = null; return value; }
    if (keyName.length === 1 && value.length < maxLength && /[\p{L}\p{N} _\-.!]/u.test(keyName)) return value + keyName;
    return value;
  },

  // Étiquette de rareté (pastille colorée + texte)
  chip(str, x, y, color, size = 14) {
    push();
    textFont(FONT_BODY);
    textSize(size);
    const w = textWidth(str) + 20;
    noStroke();
    fill(color[0], color[1], color[2], 60);
    stroke(color[0], color[1], color[2], 200);
    strokeWeight(1.5);
    rect(x, y - size / 2 - 5, w, size + 10, 10);
    pop();
    this.label(str, x + 10, y, size, color, LEFT, FONT_BODY, false);
    return w;
  }
};
