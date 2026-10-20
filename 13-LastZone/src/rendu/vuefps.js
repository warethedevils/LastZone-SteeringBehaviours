// Vue à la première personne (option « Vue joueur », touche V).
//
// C'est du RENDU : la simulation reste celle de la vue de dessus (cercles, 2D). Ce module
// projette le monde dans l'œil du joueur, comme un jeu de tir :
//   - le sol est texturé en « floor casting » à partir de la carte vue de dessus ;
//   - bâtiments, murs et véhicules sont des boîtes dont on projette les faces ;
//   - arbres, rochers, combattants, butin, balles et étincelles sont des sprites dont la
//     taille suit la distance (perspective) ; tout est trié de loin en près ;
//   - l'arme tenue est dessinée au premier plan, avec recul et lueur de tir.
// Projection : écran_x = L/2 + latéral × f / profondeur ; écran_y = horizon − (z − œil) × f / profondeur.

const VueFPS = {
  W: 1280,
  H: 720,
  f: 640,                 // distance focale : champ de vision horizontal de 90°
  horizon: 330,
  eye: 30,                // hauteur des yeux (un combattant mesure 46)
  step: 3,                // le sol est calculé à 1/3 de la résolution
  fw: 427,
  fh: 130,
  FOG: [186, 214, 240],
  MAX: 2600,              // distance maximale de dessin
  terrain: null,
  px: 0, py: 0, c: 1, s: 0,
  time: 0,

  // Prépare la carte du sol (une fois par match)
  setup(terrain) {
    if (this.terrain === terrain && this.data) return;
    this.terrain = terrain;
    const ctx = terrain.drawingContext;
    this.tw = terrain.width;
    this.th = terrain.height;
    this.data = ctx.getImageData(0, 0, this.tw, this.th).data;
    this.scale = this.tw / WORLD.w;
    this.buffer = document.createElement('canvas');
    this.buffer.width = this.fw;
    this.buffer.height = this.fh;
    this.bctx = this.buffer.getContext('2d');
    this.image = this.bctx.createImageData(this.fw, this.fh);
    this.pixels = new Uint32Array(this.image.data.buffer);
  },

  // ---------- Projection ----------

  place(player, yaw) {
    this.px = player.pos.x;
    this.py = player.pos.y;
    this.yaw = yaw;
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
  },

  // Caméra de poursuite en véhicule : derrière le véhicule, dans la direction du regard, un peu en hauteur,
  // pour voir le véhicule rouler (la vue depuis l'intérieur ne montrait rien).
  CHASE_DISTANCE: 150,
  CHASE_HEIGHT: 44,

  chasePosition(vehicle, yaw, distance = this.CHASE_DISTANCE) {
    return { pos: { x: vehicle.pos.x - Math.cos(yaw) * distance, y: vehicle.pos.y - Math.sin(yaw) * distance } };
  },

  proj(x, y, z) {
    const dx = x - this.px;
    const dy = y - this.py;
    const d = dx * this.c + dy * this.s;
    if (d < 4) return null;
    const lat = -dx * this.s + dy * this.c;
    const k = this.f / d;
    return { x: this.W / 2 + lat * k, y: this.horizon - (z - this.eye) * k, d, k };
  },

  depthOf(x, y) { return (x - this.px) * this.c + (y - this.py) * this.s; },

  fogAmount(d) { return Math.min(1, Math.pow(d / this.MAX, 1.25)) * 0.85; },

  tint(col, d, shade = 1) {
    const t = this.fogAmount(d);
    return [0, 1, 2].map(i => col[i] * shade * (1 - t) + this.FOG[i] * t);
  },

  // ---------- Dessin principal ----------

  // Rendu principal : scène 3D WebGL (Vue3D) + éléments 2D par-dessus (noms, arme tenue).
  // Sans WebGL, on retombe sur le rendu en sprites (draw2d).
  // opts : { time, moving, bob, terrain }
  draw(match, player, yaw, opts = {}) {
    if (!opts.terrain || !Vue3D.init()) return this.draw2d(match, player, yaw, opts);
    this.time = opts.time || 0;
    const downed = player.phase === 'terre';
    const driving = player.phase === 'vehicule' && !!player.vehicle;
    this.chase = driving;
    this.eye = driving ? this.CHASE_HEIGHT : (downed ? 12 : 30) + (opts.bob || 0);
    this.horizon = this.H / 2;
    this.place(driving ? this.chasePosition(player.vehicle, yaw) : player, yaw);
    const storm = match.stormStarted ? match.storm : null;
    const outside = !!storm && !storm.inside(player.pos);
    this.sky(outside);
    Vue3D.render(this, match, player, opts.terrain, { time: this.time, outside });
    image(Vue3D.g, 0, 0, this.W, this.H);
    this.overlays(match, player);
    if (driving) {
      // pas d'arme ni de tableau de bord : on voit le véhicule (la barre d'état est dans le HUD)
    } else if (!downed) this.viewmodel(player, opts);
    if (downed) {
      push();
      noStroke();
      fill(120, 0, 0, 60);
      rect(0, 0, this.W, this.H);
      pop();
    }
  },

  // Éléments 2D projetés sur la scène 3D : noms et vie des combattants, vie des véhicules,
  // étiquettes du butin proche. Cachés derrière un obstacle (ligne de vue).
  overlays(match, player) {
    const eyePos = createVector(this.px, this.py);
    const hidden = pos => !!match.grid.segmentHit(eyePos, pos, 0);
    for (const f of match.fighters) {
      if (f === player || !f.alive || f.phase === 'bus' || f.phase === 'chute' || f.phase === 'vehicule') continue;
      const p = this.proj(f.pos.x, f.pos.y, f.phase === 'terre' ? 22 : 54);
      if (!p || p.x < -80 || p.x > this.W + 80) continue;
      if (!f.allyOfPlayer && (p.d > 800 || hidden(f.pos))) continue;
      this.tag(f, p, p.y, player);
    }
    for (const a of match.faune) {
      if (a instanceof Corbeau || a.hp >= a.maxHp) continue;
      const p = this.proj(a.pos.x, a.pos.y, 40);
      if (!p || p.d > 700 || hidden(a.pos)) continue;
      push();
      noStroke();
      fill(0, 0, 0, 150);
      rect(p.x - 18, p.y, 36, 5, 2);
      fill(a instanceof Loup ? color(255, 120, 90) : color(120, 230, 120));
      rect(p.x - 18, p.y, 36 * Math.max(0, a.hp / a.maxHp), 5, 2);
      pop();
    }
    for (const v of match.vehicules) {
      if (v === player.vehicle || v.hp >= v.maxHp) continue;
      const p = this.proj(v.pos.x, v.pos.y, 56);
      if (!p || p.d > 900 || hidden(v.pos)) continue;
      push();
      noStroke();
      fill(0, 0, 0, 150);
      rect(p.x - 30, p.y, 60, 6, 3);
      fill(v.hp > v.maxHp * 0.3 ? color(120, 230, 120) : color(255, 90, 90));
      rect(p.x - 30, p.y, 60 * Math.max(0, v.hp / v.maxHp), 6, 3);
      pop();
    }
    for (const b of match.butins) {
      if (b.taken || Math.hypot(b.pos.x - player.pos.x, b.pos.y - player.pos.y) > 150) continue;
      const p = this.proj(b.pos.x, b.pos.y, 34);
      if (!p) continue;
      push();
      textFont(FONT_BODY);
      textAlign(CENTER, BOTTOM);
      textSize(15);
      noStroke();
      fill(0, 0, 0, 170);
      text(b.label, p.x + 1, p.y + 1);
      fill(...b.color);
      text(b.label, p.x, p.y);
      pop();
    }
    for (const co of match.coffres) {
      if (co.opened || Math.hypot(co.pos.x - player.pos.x, co.pos.y - player.pos.y) > 150) continue;
      const p = this.proj(co.pos.x, co.pos.y, 34);
      if (!p) continue;
      push();
      textFont(FONT_BODY);
      textAlign(CENTER, BOTTOM);
      textSize(15);
      noStroke();
      fill(0, 0, 0, 170);
      text(co.legendary ? 'Coffre légendaire' : 'Coffre', p.x + 1, p.y + 1);
      fill(255, 214, 90);
      text(co.legendary ? 'Coffre légendaire' : 'Coffre', p.x, p.y);
      pop();
    }
  },

  // Rendu de repli en sprites 2D (sans WebGL)
  draw2d(match, player, yaw, opts = {}) {
    this.time = opts.time || 0;
    const downed = player.phase === 'terre';
    const driving = player.phase === 'vehicule' && !!player.vehicle;
    this.eye = driving ? this.CHASE_HEIGHT : (downed ? 12 : 30) + (opts.bob || 0);
    this.horizon = 330;
    this.place(driving ? this.chasePosition(player.vehicle, yaw) : player, yaw);
    const storm = match.stormStarted ? match.storm : null;
    const outside = !!storm && !storm.inside(player.pos);

    this.sky(outside);
    this.floor(outside);

    const items = [];
    const near = (pos, margin) => this.depthOf(pos.x, pos.y) > -margin && Math.hypot(pos.x - this.px, pos.y - this.py) < this.MAX + margin;
    const carte = match.carte;

    for (const t of carte.trees) if (near(t.pos, 60)) this.addItem(items, t.pos, () => this.tree(t));
    for (const r of carte.rocks) if (near(r.pos, 60)) this.addItem(items, r.pos, () => this.rock(r));
    for (const h of carte.houses) if (near(h.pos, 120)) this.addItem(items, h.pos, () => this.house(h));
    for (const m of match.murs) if (near(m.pos, 60)) this.addItem(items, m.pos, () => this.wall(m));
    for (const co of match.coffres) if (near(co.pos, 40)) this.addItem(items, co.pos, () => this.chest(co));
    for (const b of match.butins) if (near(b.pos, 30)) this.addItem(items, b.pos, () => this.loot(b, player));
    for (const v of match.vehicules) {
      if (v === player.vehicle && !driving) continue;
      if (near(v.pos, 80)) this.addItem(items, v.pos, () => this.vehicle(v));
    }
    for (const f of match.fighters) {
      if (f === player || !f.alive || f.phase === 'bus' || f.phase === 'chute' || f.phase === 'vehicule') continue;
      if (near(f.pos, 40)) this.addItem(items, f.pos, () => this.fighter(f, player));
    }
    for (const b of match.bullets) {
      if (near(b.pos, 40)) this.addItem(items, b.pos, () => this.bullet(b));
    }
    for (const e of match.sparks) if (near(e.pos, 20)) this.addItem(items, e.pos, () => this.spark(e));
    for (const d of match.largages) if (near(d.pos, 60)) this.addItem(items, d.pos, () => this.airdrop(d));
    if (storm) this.stormItems(items, storm);

    items.sort((a, b) => b.d - a.d);
    for (const it of items) it.draw();

    // en véhicule : caméra de poursuite, on voit le véhicule ; sinon arme en main
    if (!driving && !downed) this.viewmodel(player, opts);
    if (downed) {
      push();
      noStroke();
      fill(120, 0, 0, 60);
      rect(0, 0, this.W, this.H);
      pop();
    }
  },

  addItem(items, pos, draw) {
    const d = this.depthOf(pos.x, pos.y);
    items.push({ d, draw });
  },

  // ---------- Ciel et sol ----------

  sky(outside) {
    const c = drawingContext;
    const g = c.createLinearGradient(0, 0, 0, this.horizon);
    if (outside) {
      g.addColorStop(0, 'rgb(70,30,120)');
      g.addColorStop(1, 'rgb(180,120,230)');
    } else {
      g.addColorStop(0, 'rgb(58,118,214)');
      g.addColorStop(0.7, 'rgb(142,190,240)');
      g.addColorStop(1, 'rgb(196,222,244)');
    }
    c.fillStyle = g;
    c.fillRect(0, 0, this.W, this.horizon + 2);
    // soleil et nuages lointains (fixes dans le monde : ils tournent avec le regard)
    const sunAngle = -0.9;
    const rel = Math.atan2(Math.sin(sunAngle - this.yaw), Math.cos(sunAngle - this.yaw));
    if (Math.abs(rel) < 0.9 && !outside) {
      const x = this.W / 2 + Math.tan(rel) * this.f;
      push();
      noStroke();
      fill(255, 244, 200, 60);
      circle(x, 120, 150);
      fill(255, 248, 220, 140);
      circle(x, 120, 70);
      pop();
    }
    push();
    noStroke();
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.3;
      const r = Math.atan2(Math.sin(a - this.yaw), Math.cos(a - this.yaw));
      if (Math.abs(r) > 0.9) continue;
      const x = this.W / 2 + Math.tan(r) * this.f;
      fill(255, 255, 255, outside ? 30 : 110);
      ellipse(x, 90 + (i % 3) * 40, 210, 34);
      ellipse(x + 50, 80 + (i % 3) * 40, 120, 28);
    }
    pop();
  },

  floor(outside) {
    const { fw, fh, step, f, eye, W } = this;
    const data = this.data;
    const tw = this.tw;
    const th = this.th;
    const sc = this.scale;
    const out = this.pixels;
    const fog = this.FOG;
    const c = this.c;
    const s = this.s;
    for (let r = 0; r < fh; r++) {
      const off = (r + 0.5) * step;
      const d = (f * eye) / off;
      const t = this.fogAmount(d);
      const k = d / f;
      const latStart = ((0.5 * step) - W / 2) * k;
      let wx = this.px + c * d - s * latStart;
      let wy = this.py + s * d + c * latStart;
      const dx = -s * step * k;
      const dy = c * step * k;
      let row = r * fw;
      for (let col = 0; col < fw; col++, wx += dx, wy += dy) {
        const tx = (wx * sc) | 0;
        const ty = (wy * sc) | 0;
        let red, green, blue;
        if (tx < 0 || ty < 0 || tx >= tw || ty >= th) {
          red = 28; green = 104; blue = 168;
        } else {
          const i = (ty * tw + tx) * 4;
          red = data[i]; green = data[i + 1]; blue = data[i + 2];
        }
        if (outside) { red = red * 0.8 + 40; green *= 0.7; blue = blue * 0.85 + 50; }
        red = red * (1 - t) + fog[0] * t;
        green = green * (1 - t) + fog[1] * t;
        blue = blue * (1 - t) + fog[2] * t;
        out[row + col] = (255 << 24) | ((blue | 0) << 16) | ((green | 0) << 8) | (red | 0);
      }
    }
    this.bctx.putImageData(this.image, 0, 0);
    const ctx = drawingContext;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.buffer, 0, this.horizon, this.W, this.fh * step);
  },

  // ---------- Primitives ----------

  // Mur vertical entre deux points du sol, de la hauteur z0 à z1 (coupé au plan proche)
  wallQuad(ax, ay, bx, by, z0, z1, colour, edge) {
    const near = 8;
    let da = this.depthOf(ax, ay);
    let db = this.depthOf(bx, by);
    if (da < near && db < near) return null;
    let a = { x: ax, y: ay };
    let b = { x: bx, y: by };
    if (da < near) {
      const t = (near - da) / (db - da);
      a = { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    } else if (db < near) {
      const t = (near - db) / (da - db);
      b = { x: bx + (ax - bx) * t, y: by + (ay - by) * t };
    }
    const pa0 = this.proj(a.x, a.y, z0);
    const pb0 = this.proj(b.x, b.y, z0);
    const pb1 = this.proj(b.x, b.y, z1);
    const pa1 = this.proj(a.x, a.y, z1);
    if (!pa0 || !pb0 || !pb1 || !pa1) return null;
    push();
    fill(...colour);
    if (edge) { stroke(...edge); strokeWeight(1.5); } else noStroke();
    quad(pa0.x, pa0.y, pb0.x, pb0.y, pb1.x, pb1.y, pa1.x, pa1.y);
    pop();
    return [pa0, pb0, pb1, pa1];
  },

  // Point d'un quad (interpolation bilinéaire) : u le long du bord, v en hauteur
  at(q, u, v) {
    const bx = q[0].x + (q[1].x - q[0].x) * u;
    const by = q[0].y + (q[1].y - q[0].y) * u;
    const tx = q[3].x + (q[2].x - q[3].x) * u;
    const ty = q[3].y + (q[2].y - q[3].y) * u;
    return { x: bx + (tx - bx) * v, y: by + (ty - by) * v };
  },

  // Boîte posée sur le sol : centre, demi-dimensions locales, angle, de z0 à z1
  box(cx, cy, hw, hl, angle, z0, z1, colour, opts = {}) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const pts = [[hw, hl], [-hw, hl], [-hw, -hl], [hw, -hl]].map(([x, y]) => ({ x: cx + x * ca - y * sa, y: cy + x * sa + y * ca }));
    const faces = [];
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const nx = mx - cx;
      const ny = my - cy;
      const len = Math.hypot(nx, ny) || 1;
      if (nx * (this.px - mx) + ny * (this.py - my) <= 0) continue;     // face tournée dos à nous
      faces.push({ a, b, d: this.depthOf(mx, my), light: 0.62 + 0.38 * Math.max(0, (nx * -0.5 + ny * -0.85) / len) + 0.1 });
    }
    faces.sort((p, q) => q.d - p.d);
    const result = [];
    for (const fc of faces) {
      const col = this.tint(colour, fc.d, Math.min(1.1, fc.light));
      const q = this.wallQuad(fc.a.x, fc.a.y, fc.b.x, fc.b.y, z0, z1, col, opts.edge || null);
      if (q) result.push({ q, d: fc.d });
    }
    return result;
  },

  // ---------- Éléments du décor ----------

  tree(t) {
    const p = this.proj(t.pos.x, t.pos.y, 0);
    if (!p) return;
    const k = p.k;
    const sh = t.shade;
    const trunk = this.tint([96, 66, 38], p.d, sh);
    push();
    noStroke();
    fill(...trunk);
    rect(p.x - 6 * k * (t.r / 18), p.y - 92 * k, 12 * k * (t.r / 18), 92 * k);
    const cy = p.y - 112 * k;
    const R = t.canopy * 1.25 * k;
    const sway = Math.sin(this.time * 1.4 + t.sway) * 1.5 * k;
    fill(...this.tint([30, 90, 42], p.d, sh));
    ellipse(p.x + sway, cy, R * 2, R * 2.15);
    fill(...this.tint([46, 124, 58], p.d, sh));
    ellipse(p.x + sway - R * 0.15, cy - R * 0.2, R * 1.45, R * 1.5);
    fill(...this.tint([76, 160, 82], p.d, sh));
    ellipse(p.x + sway - R * 0.3, cy - R * 0.45, R * 0.8, R * 0.8);
    if (t.hitFlash > 0) { fill(255, 255, 255, 70); ellipse(p.x, cy, R * 2, R * 2.15); }
    pop();
  },

  rock(r) {
    const p = this.proj(r.pos.x, r.pos.y, 0);
    if (!p) return;
    const k = p.k;
    const w = r.r * 1.05 * k;
    const h = r.r * 1.1 * k;
    push();
    noStroke();
    fill(...this.tint([120, 124, 134], p.d));
    beginShape();
    vertex(p.x - w, p.y);
    vertex(p.x - w * 0.85, p.y - h * 0.55);
    vertex(p.x - w * 0.4, p.y - h * 0.95);
    vertex(p.x + w * 0.2, p.y - h);
    vertex(p.x + w * 0.8, p.y - h * 0.6);
    vertex(p.x + w, p.y);
    endShape(CLOSE);
    fill(...this.tint([160, 164, 174], p.d));
    beginShape();
    vertex(p.x - w * 0.6, p.y - h * 0.6);
    vertex(p.x - w * 0.4, p.y - h * 0.95);
    vertex(p.x + w * 0.2, p.y - h);
    vertex(p.x + w * 0.1, p.y - h * 0.55);
    endShape(CLOSE);
    pop();
  },

  house(h) {
    const horizontal = h.w >= h.h;
    const faces = this.box(h.pos.x, h.pos.y, h.w / 2, h.h / 2, 0, 0, 112, [232, 220, 196]);
    for (const { q, d } of faces) {
      const widthPx = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);
      // bandeau de toit coloré
      const top = this.at(q, 0, 0.8);
      const top2 = this.at(q, 1, 0.8);
      push();
      noStroke();
      fill(...this.tint(h.roof, d, 0.95));
      quad(top.x, top.y, top2.x, top2.y, q[2].x, q[2].y, q[3].x, q[3].y);
      if (widthPx > 40) {
        fill(...this.tint([50, 70, 100], d));
        [[0.14, 0.3], [0.7, 0.86]].forEach(([u0, u1]) => {
          const a = this.at(q, u0, 0.32), b = this.at(q, u1, 0.32), c = this.at(q, u1, 0.62), e = this.at(q, u0, 0.62);
          quad(a.x, a.y, b.x, b.y, c.x, c.y, e.x, e.y);
        });
        fill(...this.tint([96, 66, 44], d));
        const a = this.at(q, 0.42, 0), b = this.at(q, 0.58, 0), c = this.at(q, 0.58, 0.5), e = this.at(q, 0.42, 0.5);
        quad(a.x, a.y, b.x, b.y, c.x, c.y, e.x, e.y);
      }
      pop();
    }
    return horizontal;
  },

  wall(m) {
    const health = m.hp / m.maxHp;
    const base = [150 + 40 * health, 105 + 30 * health, 60];
    this.box(m.pos.x, m.pos.y, m.length / 2, 9, m.angle, 0, 66, m.flash > 0 ? [255, 255, 255] : base, { edge: [70, 45, 25] });
  },

  chest(co) {
    const gold = co.legendary;
    const col = co.opened ? [90, 70, 50] : (gold ? [255, 200, 70] : [180, 120, 50]);
    this.box(co.pos.x, co.pos.y, 15, 11, 0, 0, 20, col, { edge: [60, 40, 20] });
    if (!co.opened) {
      const p = this.proj(co.pos.x, co.pos.y, 34);
      if (p) {
        push();
        noStroke();
        blendMode(ADD);
        fill(255, 215, 90, 60);
        circle(p.x, p.y, 70 * p.k);
        if (gold) { fill(255, 215, 90, 40); rect(p.x - 6 * p.k, p.y - 600 * p.k, 12 * p.k, 600 * p.k); }
        blendMode(BLEND);
        pop();
      }
    }
  },

  loot(b, player) {
    const bob = Math.sin(this.time * 3 + b.phase) * 2;
    const p = this.proj(b.pos.x, b.pos.y, 16 + bob);
    if (!p) return;
    const [r, g, bl] = b.color;
    const k = p.k;
    push();
    noStroke();
    if (b.drop.kind === 'arme' && b.rarity >= 1) {
      blendMode(ADD);
      fill(r, g, bl, 38);
      rect(p.x - 5 * k, p.y - 280 * k, 10 * k, 280 * k);
      fill(r, g, bl, 60);
      circle(p.x, p.y, 54 * k);
      blendMode(BLEND);
    }
    fill(r * 0.35, g * 0.35, bl * 0.35);
    stroke(r, g, bl);
    strokeWeight(Math.max(1.5, 2 * k));
    rectMode(CENTER);
    rect(p.x, p.y, 26 * k, 20 * k, 5 * k);
    rectMode(CORNER);
    noStroke();
    fill(255, 255, 255, 235);
    textAlign(CENTER, CENTER);
    textFont(FONT_BODY);
    textSize(Math.max(8, Math.min(26, (b.drop.kind === 'arme' ? 10 : 13) * k)));
    text(b.icon, p.x, p.y);
    const dist = Math.hypot(b.pos.x - player.pos.x, b.pos.y - player.pos.y);
    if (dist < 150 && p.d < 200) {
      fill(0, 0, 0, 160);
      textSize(15);
      text(b.label, p.x + 1, p.y - 30 * k - 11);
      fill(r, g, bl);
      text(b.label, p.x, p.y - 30 * k - 12);
    }
    pop();
  },

  airdrop(d) {
    const alt = d.altitude * 520;
    const p = this.proj(d.pos.x, d.pos.y, alt + 10);
    if (!p) return;
    const k = p.k;
    push();
    stroke(255, 255, 255, 180);
    strokeWeight(Math.max(1, 1.5 * k));
    line(p.x - 36 * k, p.y - 48 * k, p.x - 10 * k, p.y);
    line(p.x + 36 * k, p.y - 48 * k, p.x + 10 * k, p.y);
    noStroke();
    fill(255, 140, 70, 235);
    ellipse(p.x, p.y - 62 * k, 96 * k, 54 * k);
    fill(255, 215, 90);
    stroke(90, 60, 20);
    strokeWeight(Math.max(1.5, 2 * k));
    rectMode(CENTER);
    rect(p.x, p.y + 6 * k, 30 * k, 24 * k, 4 * k);
    rectMode(CORNER);
    pop();
  },

  // ---------- Combattants et véhicules ----------

  fighter(f, player) {
    const hs = f.phase === 'terre' ? 0.45 : 1;
    const p = this.proj(f.pos.x, f.pos.y, 0);
    if (!p) return;
    const k = p.k;
    const flash = f.hitFlash > 0;
    const [br, bg, bb] = f.skin.body;
    const [ar, ag, ab] = f.skin.accent;
    const body = flash ? [255, 255, 255] : this.tint([br, bg, bb], p.d);
    const dark = this.tint([34, 38, 52], p.d);
    const skin = flash ? [255, 255, 255] : this.tint([255, 214, 178], p.d);
    const sway = f.phase === 'sol' ? Math.sin(this.time * 9 + f.pos.x * 0.05) * Math.min(1, f.vel.mag() / 2) * 3 : 0;
    push();
    noStroke();
    // ombre
    fill(0, 0, 0, 70);
    ellipse(p.x, p.y, 34 * k, 9 * k);
    if (f.phase === 'terre') {
      noFill();
      stroke(255, 70, 70, 200);
      strokeWeight(Math.max(1.5, 3 * k));
      ellipse(p.x, p.y, 54 * k, 14 * k);
      noStroke();
    }
    // jambes
    fill(...dark);
    rect(p.x - 9 * k + sway * k, p.y - 19 * hs * k, 7 * k, 19 * hs * k, 2 * k);
    rect(p.x + 2 * k - sway * k, p.y - 19 * hs * k, 7 * k, 19 * hs * k, 2 * k);
    // torse
    stroke(...this.tint([br * 0.4, bg * 0.4, bb * 0.4], p.d));
    strokeWeight(Math.max(1, 1.6 * k));
    fill(...body);
    rect(p.x - 12 * k, p.y - 38 * hs * k, 24 * k, 20 * hs * k, 5 * k);
    noStroke();
    fill(ar, ag, ab, 220);
    rect(p.x - 5 * k, p.y - 34 * hs * k, 10 * k, 10 * hs * k, 2 * k);
    // arme tenue : du torse jusqu'à la bouche, projetée dans le monde
    const aim = f.aim;
    const chest = this.proj(f.pos.x, f.pos.y, 28 * hs);
    const muzzle = this.proj(f.pos.x + Math.cos(aim) * 26, f.pos.y + Math.sin(aim) * 26, 28 * hs);
    if (chest && muzzle && f.phase !== 'terre') {
      const w = f.weapon;
      stroke(...(w ? this.tint(RARITES[w.rarity].color, p.d) : this.tint([190, 200, 215], p.d)));
      strokeWeight(Math.max(1.5, 5 * k));
      line(chest.x, chest.y, muzzle.x, muzzle.y);
      noStroke();
      fill(...skin);
      circle(muzzle.x, muzzle.y, 6 * k);
    }
    // tête
    fill(...skin);
    stroke(...this.tint([120, 90, 70], p.d));
    strokeWeight(Math.max(1, 1.4 * k));
    const headY = p.y - 44 * hs * k;
    circle(p.x, headY, 15 * k);
    noStroke();
    fill(ar * 0.9, ag * 0.9, ab * 0.9);
    arc(p.x, headY, 15.5 * k, 15.5 * k, Math.PI, TWO_PI);
    // visage visible seulement s'il nous regarde
    const faceToUs = Math.cos(aim) * (this.px - f.pos.x) + Math.sin(aim) * (this.py - f.pos.y) > 0;
    if (faceToUs) {
      fill(40, 30, 28);
      circle(p.x - 3 * k, headY + 1 * k, 2.4 * k);
      circle(p.x + 3 * k, headY + 1 * k, 2.4 * k);
    }
    pop();
    this.tag(f, p, headY - 14 * k, player);
  },

  // Nom et barres de vie au-dessus de la tête ; coéquipiers marqués en vert
  tag(f, p, y, player) {
    const ally = f.allyOfPlayer;
    if (p.d > (ally ? 2200 : 800)) return;
    push();
    textFont(FONT_BODY);
    textAlign(CENTER, BOTTOM);
    textSize(14);
    noStroke();
    const alpha = ally ? 255 : Math.max(60, 255 - p.d * 0.3);
    fill(0, 0, 0, alpha * 0.6);
    text(f.name, p.x + 1, y + 1);
    fill(ally ? color(130, 240, 160, alpha) : color(255, 255, 255, alpha));
    text(f.name, p.x, y);
    const w = 46;
    fill(0, 0, 0, 150);
    rect(p.x - w / 2 - 1, y + 3, w + 2, 9, 3);
    fill(90, 220, 90);
    rect(p.x - w / 2, y + 8, w * Math.max(0, f.hp) / (f.phase === 'terre' ? 30 : 100), 3);
    fill(90, 170, 255);
    rect(p.x - w / 2, y + 4, w * Math.max(0, f.shield) / 100, 3);
    if (ally) {
      fill(130, 240, 160);
      triangle(p.x - 7, y - 20, p.x + 7, y - 20, p.x, y - 8);
    }
    pop();
  },

  vehicle(v) {
    const def = v.def;
    const col = v.flash > 0 ? [255, 255, 255] : def.color;
    // bas de caisse et roues
    this.box(v.pos.x, v.pos.y, def.l / 2, def.w / 2, v.angle, 0, 10, [30, 30, 36]);
    const body = this.box(v.pos.x, v.pos.y, def.l / 2 - 1, def.w / 2 - 1, v.angle, 8, v.type === 'quad' ? 20 : 26, col, { edge: [20, 20, 20] });
    if (v.type === 'jeep') {
      this.box(v.pos.x - Math.cos(v.angle) * 8, v.pos.y - Math.sin(v.angle) * 8, def.l * 0.3, def.w / 2 - 4, v.angle, 26, 40, [60, 100, 70], { edge: [20, 30, 20] });
    }
    // occupants : leur tête dépasse
    v.occupants.forEach((o, i) => {
      if (!o) return;
      const off = i === 2 ? -def.l * 0.28 : def.l * 0.05;
      const side = v.type === 'quad' ? 0 : (i === 0 ? -def.w * 0.18 : def.w * 0.2);
      const x = v.pos.x + Math.cos(v.angle) * off - Math.sin(v.angle) * side;
      const y = v.pos.y + Math.sin(v.angle) * off + Math.cos(v.angle) * side;
      const p = this.proj(x, y, v.type === 'quad' ? 34 : 48);
      if (!p) return;
      push();
      stroke(0, 0, 0, 120);
      strokeWeight(1.5);
      fill(...o.skin.body);
      circle(p.x, p.y, 15 * p.k);
      pop();
    });
    const p = this.proj(v.pos.x, v.pos.y, 0);
    if (p && v.hp < v.maxHp) {
      push();
      noStroke();
      fill(0, 0, 0, 150);
      rect(p.x - 30, p.y - 70 * p.k - 20, 60, 6, 3);
      fill(v.hp > v.maxHp * 0.3 ? color(120, 230, 120) : color(255, 90, 90));
      rect(p.x - 30, p.y - 70 * p.k - 20, 60 * Math.max(0, v.hp / v.maxHp), 6, 3);
      pop();
    }
    return body;
  },

  bullet(b) {
    if (b.grenade) {
      const p = this.proj(b.pos.x, b.pos.y, 30);
      if (!p) return;
      push();
      noStroke();
      fill(50, 70, 40);
      stroke(140, 210, 90);
      strokeWeight(2);
      circle(p.x, p.y, 11 * p.k + 3);
      pop();
      return;
    }
    const a = this.proj(b.pos.x, b.pos.y, 30);
    const tailX = b.pos.x - b.vel.x * 2.4;
    const tailY = b.pos.y - b.vel.y * 2.4;
    const t = this.proj(tailX, tailY, 30);
    if (!a || !t) return;
    push();
    const [r, g, bl] = b.tint;
    stroke(r, g, bl, 110);
    strokeWeight(Math.max(2, 7 * a.k));
    line(a.x, a.y, t.x, t.y);
    stroke(255, 255, 255, 240);
    strokeWeight(Math.max(1, 3 * a.k));
    line(a.x, a.y, t.x, t.y);
    pop();
  },

  spark(e) {
    const t = Math.max(0, e.life / e.maxLife);
    const p = this.proj(e.pos.x, e.pos.y, 14 + (1 - t) * 18);
    if (!p) return;
    const [r, g, b] = e.color;
    push();
    noStroke();
    fill(r, g, b, 230 * t);
    circle(p.x, p.y, Math.max(2, e.size * (0.4 + t) * p.k * 1.4));
    pop();
  },

  // La zone de tempête : un mur violet translucide, vu par colonnes de pixels
  stormItems(items, storm) {
    const px = this.px - storm.pos.x;
    const py = this.py - storm.pos.y;
    const stepPx = 8;
    for (let x = 0; x < this.W; x += stepPx) {
      const lat = ((x + stepPx / 2) - this.W / 2) / this.f;
      // direction (profondeur 1) : avant + droite × lat
      const dx = this.c - this.s * lat;
      const dy = this.s + this.c * lat;
      const a = dx * dx + dy * dy;
      const b = 2 * (px * dx + py * dy);
      const cc = px * px + py * py - storm.r * storm.r;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      const root = Math.sqrt(disc);
      let t = (-b + root) / (2 * a);
      const t1 = (-b - root) / (2 * a);
      if (t1 > 6) t = t1;
      if (t < 6 || t > this.MAX * 1.6) continue;
      items.push({
        d: t,
        draw: () => {
          const k = this.f / t;
          const top = this.horizon - (700 - this.eye) * k;
          const bottom = this.horizon + this.eye * k;
          push();
          noStroke();
          const fade = Math.min(1, 900 / t);
          fill(150, 60, 230, 40 + 60 * fade);
          rect(x, top, stepPx + 1, bottom - top);
          fill(210, 150, 255, 80 * fade);
          rect(x, bottom - 40 * k, stepPx + 1, 40 * k);
          pop();
        }
      });
    }
  },

  // ---------- Premier plan : arme tenue, tableau de bord ----------

  viewmodel(p, opts) {
    const bob = opts.moving ? Math.sin(this.time * 9) * 5 : Math.sin(this.time * 1.6) * 1.5;
    const sway = opts.moving ? Math.cos(this.time * 4.5) * 4 : 0;
    const item = p.item;
    const baseX = this.W * 0.74 + sway;
    const baseY = this.H * 0.9 + bob;
    push();
    translate(baseX, baseY);
    if (p.weapon) {
      const w = p.weapon;
      const s = weaponStats(w);
      const [r, g, b] = RARITES[w.rarity].color;
      const fire = s.rate > 0 ? Math.max(0, p.cooldown * s.rate) : 0;     // 1 juste après le tir
      const recoil = fire * (w.type === 'sniper' || w.type === 'lance_roquettes' ? 46 : 22);
      const reload = p.reloading ? Math.sin((1 - p.reloadTimer / s.reload) * Math.PI) * 120 : 0;
      translate(-recoil * 0.4, recoil - reload);
      rotate(-0.04 + fire * 0.05);
      this.drawGun(w.type, [r, g, b]);
      if (fire > 0.7) {
        const len = this.gunLength(w.type);
        blendMode(ADD);
        noStroke();
        fill(255, 210, 120, 220);
        circle(-len - 8, -78, 70 * fire);
        fill(255, 255, 220, 230);
        circle(-len - 8, -78, 34 * fire);
        blendMode(BLEND);
      }
    } else if (item && item.kind === 'grenade') {
      noStroke();
      fill(50, 70, 40);
      stroke(140, 210, 90);
      strokeWeight(4);
      circle(-40, -80, 90);
      fill(255, 214, 178);
      noStroke();
      ellipse(-30, -40, 80, 110);
    } else if (item && (item.kind === 'soin' || item.kind === 'bouclier')) {
      const col = SOINS[item.type].color;
      const use = p.using ? Math.sin(p.using.t * 12) * 8 : 0;
      noStroke();
      fill(...col);
      stroke(30, 30, 40);
      strokeWeight(4);
      rect(-80, -190 + use, 60, 130, 14);
      fill(255, 255, 255, 200);
      noStroke();
      rect(-70, -170 + use, 40, 16, 6);
      fill(255, 214, 178);
      ellipse(-30, -40, 80, 110);
    } else {
      // pioche
      const t = p.swing > 0 ? Math.sin((1 - p.swing / 0.22) * Math.PI) : 0;
      rotate(-0.5 - t * 1.1);
      stroke(110, 74, 40);
      strokeWeight(14);
      line(-30, 0, -50, -240);
      stroke(190, 200, 215);
      strokeWeight(16);
      line(-120, -250, 40, -250);
      stroke(150, 160, 175);
      strokeWeight(8);
      line(-120, -250, -150, -226);
      line(40, -250, 70, -226);
      noStroke();
      fill(255, 214, 178);
      ellipse(-30, 0, 90, 80);
    }
    pop();
  },

  gunLength(type) {
    return { pistolet: 150, mitraillette: 230, fusil: 330, pompe: 360, sniper: 420, lance_roquettes: 430, mitrailleuse: 330, arbalete: 270 }[type] || 250;
  },

  // Arme vue de l'arrière-droite, pointée vers le haut-gauche (la bouche est à gauche)
  drawGun(type, accent) {
    const len = this.gunLength(type);
    const [r, g, b] = accent;
    stroke(12, 14, 20);
    strokeWeight(4);
    const dark = [38, 42, 54];
    const mid = [64, 70, 86];
    const body = (x0, x1, h, col = dark) => { fill(...col); rect(-x1, -78 - h / 2, x1 - x0, h, 8); };
    if (type === 'lance_roquettes') {
      body(0, len, 56, [70, 76, 66]);
      fill(34, 36, 30);
      rect(-len - 22, -78 - 40, 40, 80, 8);              // gueule du tube
      fill(255, 140, 60);
      circle(-len - 4, -78, 30);
      fill(...mid);
      rect(-150, -150, 90, 30, 6);                       // viseur
    } else if (type === 'sniper') {
      body(0, len, 28);
      fill(...mid);
      rect(-260, -122, 130, 34, 10);                     // lunette
      fill(r, g, b);
      circle(-262, -105, 26);
    } else if (type === 'arbalete') {
      body(0, len, 26, [96, 70, 44]);
      noFill();
      stroke(...dark);
      strokeWeight(14);
      arc(-len + 40, -78, 60, 300, HALF_PI, HALF_PI * 3);
      stroke(r, g, b);
      strokeWeight(3);
      line(-len + 10, -228, -len + 10, 72);
    } else if (type === 'mitrailleuse') {
      body(0, len, 60);
      fill(...mid);
      rect(-len + 40, -120, 140, 46, 8);
      fill(r, g, b);
      rect(-120, -64, 90, 14, 4);
      fill(30, 30, 20);
      rect(-len - 20, -78 - 12, 40, 24, 4);
    } else if (type === 'pompe') {
      body(0, len, 36, [96, 70, 44]);
      fill(...dark);
      rect(-len, -78 - 14, len * 0.55, 28, 4);
      fill(r, g, b);
      rect(-len * 0.5, -78 - 28, 100, 14, 4);
    } else {
      body(0, len, type === 'pistolet' ? 46 : 40);
      fill(...mid);
      rect(-len * 0.72, -78 - 32, len * 0.4, 14, 4);
      fill(r, g, b);
      rect(-len * 0.45, -78 - 8, 60, 8, 3);
      if (type !== 'pistolet') {
        fill(...dark);
        rect(-len * 0.32, -78, 36, 64, 6);                // chargeur
      }
    }
    // poignée et mains
    fill(...dark);
    rect(-52, -78, 40, 90, 8);
    noStroke();
    fill(255, 214, 178);
    ellipse(-30, 10, 92, 100);                            // main arrière
    ellipse(-len * 0.55, -60, 70, 64);                    // main avant
  },

  dashboard(p) {
    const veh = p.vehicle;
    push();
    noStroke();
    fill(24, 26, 34);
    rect(0, this.H - 120, this.W, 120);
    fill(40, 44, 56);
    rect(0, this.H - 120, this.W, 12);
    // volant
    const turn = 0;
    translate(this.W / 2, this.H + 40);
    rotate(turn);
    noFill();
    stroke(20, 20, 26);
    strokeWeight(22);
    circle(0, 0, 330);
    stroke(...(veh ? veh.def.color : [255, 255, 255]));
    strokeWeight(5);
    circle(0, 0, 306);
    pop();
  }
};
