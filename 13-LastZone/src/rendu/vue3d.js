// Moteur 3D de la vue à la première personne : un vrai rendu WebGL (p5.js en mode WEBGL),
// avec une scène de volumes (sol texturé, bâtiments, arbres, rochers, murs, véhicules,
// combattants), un éclairage et de la brume via un petit shader.
//
// C'est du RENDU : la simulation (collisions, tirs) reste en 2D dans le Match ; ici on
// lit seulement les positions pour dessiner. Repère : le monde (x, y) du jeu devient
// (X = x, Z = y) et la hauteur est -Y (p5 a l'axe Y vers le bas).

const VUE3D_VERT = `
precision highp float;
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aTexCoord;
uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat3 uNormalMatrix;
varying vec3 vNormal;
varying vec2 vUV;
varying float vDepth;
void main() {
  vec4 p = uModelViewMatrix * vec4(aPosition, 1.0);
  vDepth = -p.z;
  vNormal = normalize(uNormalMatrix * aNormal);
  vUV = aTexCoord;
  gl_Position = uProjectionMatrix * p;
}`;

const VUE3D_FRAG = `
precision highp float;
uniform vec4 uMaterialColor;
uniform sampler2D uSampler;
uniform bool isTexture;
uniform vec3 uLight;
uniform vec3 uFogColor;
uniform float uFogFar;
uniform float uEmissive;
varying vec3 vNormal;
varying vec2 vUV;
varying float vDepth;
void main() {
  vec4 base = isTexture ? texture2D(uSampler, vUV) : uMaterialColor;
  float lambert = max(dot(normalize(vNormal), normalize(uLight)), 0.0);
  float shade = mix(0.52 + 0.55 * lambert, 1.0, uEmissive);
  vec3 c = base.rgb * shade;
  float fog = clamp(pow(vDepth / uFogFar, 1.35), 0.0, 1.0) * 0.92;
  c = mix(c, uFogColor, fog);
  gl_FragColor = vec4(c, base.a);
}`;

const Vue3D = {
  g: null,
  shader: null,
  failed: false,
  W: 1280,
  H: 720,
  far: 2600,
  light: [0.5, -0.8, 0.35],          // direction vers le soleil (repère du rendu, hauteur = -Y)

  // Crée le rendu WebGL (une fois). Retourne false si le navigateur ne sait pas.
  init() {
    if (this.g) return true;
    if (this.failed) return false;
    try {
      const g = createGraphics(this.W, this.H, WEBGL);
      g.pixelDensity(1);
      try { g.setAttributes('antialias', true); } catch (e) { /* facultatif */ }
      this.g = g;
      this.shader = g.createShader(VUE3D_VERT, VUE3D_FRAG);
      return true;
    } catch (e) {
      this.failed = true;
      this.g = null;
      return false;
    }
  },

  // Place un volume à (x, y) du jeu, à la hauteur h (centre), tourné de `angle` autour de la verticale
  at(x, y, h, angle = 0) {
    const g = this.g;
    g.translate(x, -h, y);
    if (angle) g.rotateY(-angle);
  },

  col(c, alpha = 255) { this.g.fill(c[0], c[1], c[2], alpha); },

  glow(v) { this.shader.setUniform('uEmissive', v); },

  // Disque d'ombre au sol
  shadow(x, y, radius, alpha = 70) {
    const g = this.g;
    g.push();
    g.translate(x, -0.8, y);
    g.rotateX(HALF_PI);
    g.fill(0, 0, 0, alpha);
    g.ellipse(0, 0, radius * 2, radius * 2, 14);
    g.pop();
  },

  // ---------- Scène ----------

  // vue : VueFPS (position, regard, brume) ; match, player : état du jeu
  render(vue, match, player, terrain, opts = {}) {
    const g = this.g;
    const sh = this.shader;
    const time = opts.time || 0;
    const outside = !!opts.outside;
    g.clear();
    g.noStroke();
    g.shader(sh);
    const yaw = vue.yaw;
    const cs = Math.cos(yaw);
    const sn = Math.sin(yaw);
    // lumière : repère du rendu -> repère de la caméra (x droite, y bas, z vers l'œil)
    const L = this.light;
    const right = [-sn, 0, cs];
    const forward = [cs, 0, sn];
    const lv = [
      L[0] * right[0] + L[1] * right[1] + L[2] * right[2],
      L[1],
      -(L[0] * forward[0] + L[2] * forward[2])
    ];
    sh.setUniform('uLight', lv);
    const fog = outside ? [0.62, 0.42, 0.85] : [vue.FOG[0] / 255, vue.FOG[1] / 255, vue.FOG[2] / 255];
    sh.setUniform('uFogColor', fog);
    sh.setUniform('uFogFar', this.far);
    sh.setUniform('uEmissive', 0);

    const fovY = 2 * Math.atan(Math.tan(Math.PI / 4) * this.H / this.W);
    g.perspective(fovY, this.W / this.H, 3, this.far + 400);
    const ex = vue.px;
    const ez = vue.py;
    const ey = -vue.eye;
    g.camera(ex, ey, ez, ex + cs * 100, ey, ez + sn * 100, 0, 1, 0);

    // mer au loin, puis l'île texturée
    g.push();
    g.translate(WORLD.w / 2, 1.2, WORLD.h / 2);
    g.rotateX(HALF_PI);
    this.col(outside ? [90, 60, 150] : [28, 104, 168]);
    g.plane(30000, 30000);
    g.pop();
    g.push();
    g.translate(WORLD.w / 2, 0, WORLD.h / 2);
    g.rotateX(HALF_PI);
    g.texture(terrain);
    g.plane(WORLD.w, WORLD.h);
    g.pop();

    const reach = this.far + 200;
    const nearEnough = (pos, margin = 0) => {
      const dx = pos.x - ex;
      const dy = pos.y - ez;
      if (dx * dx + dy * dy > (reach + margin) * (reach + margin)) return false;
      return dx * cs + dy * sn > -150 - margin;           // pas derrière (avec marge)
    };

    for (const t of match.carte.trees) if (nearEnough(t.pos, 50)) this.tree(t, time);
    for (const r of match.carte.rocks) if (nearEnough(r.pos, 50)) this.rock(r);
    for (const h of match.carte.houses) if (nearEnough(h.pos, 90)) this.house(h);
    for (const m of match.murs) if (nearEnough(m.pos, 50)) this.wall(m);
    for (const co of match.coffres) if (nearEnough(co.pos, 30)) this.chest(co);
    for (const b of match.butins) if (nearEnough(b.pos, 30)) this.loot(b, time);
    for (const v of match.vehicules) if (v !== player.vehicle && nearEnough(v.pos, 60)) this.vehicle(v);
    for (const f of match.fighters) {
      if (f === player || !f.alive || f.phase === 'bus' || f.phase === 'chute' || f.phase === 'vehicule') continue;
      if (nearEnough(f.pos, 40)) this.fighter(f, time);
    }
    for (const d of match.largages) if (nearEnough(d.pos, 80)) this.airdrop(d);
    for (const a of match.faune) if (nearEnough(a.pos, 40)) this.animal(a, time);
    for (const b of match.bullets) if (nearEnough(b.pos, 30)) this.bullet(b);

    // éléments translucides en dernier
    this.glow(1);
    for (const e of match.sparks) if (nearEnough(e.pos, 20)) this.spark(e);
    if (match.stormStarted) this.storm(match.storm);
    this.glow(0);
    g.resetShader();
  },

  // ---------- Décor ----------

  tree(t, time) {
    const g = this.g;
    const k = t.r / 18;
    const sway = Math.sin(time * 1.3 + t.sway) * 1.6;
    g.push();
    this.at(t.pos.x, t.pos.y, 0);
    g.push();
    g.translate(0, -36, 0);
    this.col([96 * t.shade, 66 * t.shade, 38 * t.shade]);
    g.cylinder(5 * k, 72, 7, 1);
    g.pop();
    g.push();
    g.translate(sway, -98, 0);
    this.col([30 * t.shade, 96 * t.shade, 44 * t.shade]);
    g.sphere(t.canopy * 0.95, 8, 6);
    g.translate(-4, -22, 3);
    this.col([54 * t.shade, 132 * t.shade, 62 * t.shade]);
    g.sphere(t.canopy * 0.62, 7, 5);
    g.pop();
    if (t.hitFlash > 0) {
      g.translate(0, -98, 0);
      this.col([255, 255, 255], 90);
      g.sphere(t.canopy * 0.97, 8, 6);
    }
    g.pop();
  },

  rock(r) {
    const g = this.g;
    g.push();
    this.at(r.pos.x, r.pos.y, r.r * 0.45);
    g.scale(1, 0.8, 1);
    this.col([128, 132, 142]);
    g.sphere(r.r * 0.98, 7, 5);
    g.translate(r.r * 0.25, -r.r * 0.35, -r.r * 0.1);
    this.col([156, 160, 170]);
    g.sphere(r.r * 0.55, 6, 4);
    g.pop();
  },

  house(h) {
    const g = this.g;
    const height = 112;
    g.push();
    this.at(h.pos.x, h.pos.y, height / 2);
    this.col([232, 220, 196]);
    g.box(h.w, height, h.h);
    // toit coloré débordant
    g.push();
    g.translate(0, -height / 2 - 9, 0);
    this.col(h.roof);
    g.box(h.w + 8, 18, h.h + 8);
    g.pop();
    // fenêtres et porte sur les quatre faces
    const win = [50, 72, 104];
    const addWindows = (sx, sz, along, half) => {
      for (const u of [-0.28, 0.28]) {
        g.push();
        g.translate(sx * (half + 0.8) + (sx === 0 ? u * along : 0), -4, sz * (half + 0.8) + (sz === 0 ? u * along : 0));
        this.col(win);
        g.box(sx === 0 ? 14 : 1.6, 20, sz === 0 ? 14 : 1.6);
        g.pop();
      }
    };
    addWindows(0, 1, h.w, h.h / 2);
    addWindows(0, -1, h.w, h.h / 2);
    addWindows(1, 0, h.h, h.w / 2);
    addWindows(-1, 0, h.h, h.w / 2);
    g.push();
    g.translate(0, height / 2 - 24, h.h / 2 + 0.9);
    this.col([102, 70, 46]);
    g.box(18, 48, 1.8);
    g.pop();
    g.pop();
  },

  wall(m) {
    const g = this.g;
    const health = m.hp / m.maxHp;
    g.push();
    this.at(m.pos.x, m.pos.y, 33, m.angle);
    if (m.flash > 0) this.col([255, 255, 255]);
    else this.col([150 + 40 * health, 105 + 30 * health, 60]);
    g.box(m.length, 66, 18);
    g.pop();
  },

  chest(co) {
    const g = this.g;
    g.push();
    this.at(co.pos.x, co.pos.y, 0);
    const gold = co.legendary;
    const base = co.opened ? [90, 70, 50] : (gold ? [255, 200, 70] : [180, 120, 50]);
    g.push();
    g.translate(0, -9, 0);
    this.col(base);
    g.box(30, 18, 22);
    g.pop();
    g.push();
    g.translate(0, -(co.opened ? 28 : 21), co.opened ? -8 : 0);
    if (co.opened) g.rotateX(-0.7);
    this.col([base[0] * 0.8, base[1] * 0.8, base[2] * 0.8]);
    g.box(31, 6, 23);
    g.pop();
    if (!co.opened) {
      this.glow(1);
      g.translate(0, -300, 0);
      this.col(gold ? [255, 215, 90] : [255, 200, 80], gold ? 70 : 30);
      g.cylinder(gold ? 7 : 4, 600, 8, 1, false, false);
      this.glow(0);
    }
    g.pop();
  },

  loot(b, time) {
    const g = this.g;
    const bob = Math.sin(time * 3 + b.phase) * 2.5;
    const c = b.color;
    g.push();
    this.at(b.pos.x, b.pos.y, 16 + bob);
    g.rotateY(time * 1.6 + b.phase);
    this.glow(0.9);
    this.col(c);
    g.box(13, 13, 13);
    if (b.drop.kind === 'arme' && b.rarity >= 1) {
      g.rotateY(-(time * 1.6 + b.phase));
      g.translate(0, -120, 0);
      this.col(c, 38);
      g.cylinder(2.6, 250, 8, 1, false, false);
    }
    this.glow(0);
    g.pop();
  },

  airdrop(d) {
    const g = this.g;
    const alt = d.altitude * 520;
    g.push();
    this.at(d.pos.x, d.pos.y, alt + 14);
    this.col([255, 215, 90]);
    g.box(28, 24, 28);
    g.translate(0, -76, 0);
    g.scale(1, 0.55, 1);
    this.col([255, 140, 70]);
    g.sphere(50, 10, 6);
    g.pop();
  },

  // ---------- Combattants et véhicules ----------

  fighter(f, time) {
    const g = this.g;
    const flash = f.hitFlash > 0;
    const body = flash ? [255, 255, 255] : f.skin.body;
    const accent = flash ? [255, 255, 255] : f.skin.accent;
    const skin = flash ? [255, 255, 255] : [255, 214, 178];
    const downed = f.phase === 'terre';
    const stride = f.phase === 'sol' ? Math.sin(time * 9 + f.pos.x * 0.05) * Math.min(1, f.vel.mag() / 2) * 6 : 0;
    this.shadow(f.pos.x, f.pos.y, 15);
    g.push();
    this.at(f.pos.x, f.pos.y, 0, f.aim);
    if (downed) {
      g.rotateZ(-HALF_PI * 0.92);
      g.translate(18, 0, 0);
    }
    // jambes
    this.col([40, 44, 62]);
    for (const side of [-1, 1]) {
      g.push();
      g.translate(side * stride * 0.4, -9, side * 5);
      g.box(8, 18, 8);
      g.pop();
    }
    // torse
    g.push();
    g.translate(0, -28, 0);
    this.col(body);
    g.box(11, 20, 23);
    g.translate(5.6, 0, 0);
    this.col(accent);
    g.box(1, 9, 9);
    g.pop();
    // tête
    g.push();
    g.translate(0, -44, 0);
    this.col(skin);
    g.sphere(7.5, 8, 6);
    g.translate(0, -3, 0);
    this.col([body[0] * 0.8, body[1] * 0.8, body[2] * 0.8]);
    g.box(15.5, 6, 15.5);
    g.translate(6.4, 5, 0);
    this.col([40, 30, 28]);
    g.box(1.5, 2.6, 9);
    g.pop();
    // arme tenue vers l'avant
    if (!downed) {
      const w = f.weapon;
      const len = w ? { pistolet: 16, mitraillette: 24, fusil: 32, pompe: 34, sniper: 42, lance_roquettes: 40, mitrailleuse: 32, arbalete: 26 }[w.type] || 26 : 22;
      g.push();
      g.translate(10 + len / 2, -29, 0);
      this.col(w ? RARITES[w.rarity].color : [190, 200, 215]);
      g.box(len, 5, 5);
      g.translate(-len / 2 - 3, 0, 0);
      this.col(skin);
      g.sphere(3.6, 6, 4);
      g.pop();
    }
    g.pop();
    if (downed) {
      g.push();
      g.translate(f.pos.x, -1.2, f.pos.y);
      g.rotateX(HALF_PI);
      this.glow(1);
      this.col([255, 70, 70], 120);
      g.ellipse(0, 0, 54, 54, 16);
      this.glow(0);
      g.pop();
    }
  },

  vehicle(v) {
    const g = this.g;
    const def = v.def;
    const flash = v.flash > 0;
    const col = flash ? [255, 255, 255] : def.color;
    this.shadow(v.pos.x, v.pos.y, def.l * 0.6, 80);
    g.push();
    this.at(v.pos.x, v.pos.y, 0, v.angle);
    // roues
    this.col([26, 26, 32]);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.push();
        g.translate(sx * def.l * 0.31, -7.5, sz * (def.w / 2 + 1));
        g.rotateX(HALF_PI);
        g.cylinder(7.5, 7, 10, 1);
        g.pop();
      }
    }
    // caisse
    g.push();
    g.translate(0, -(v.type === 'quad' ? 15 : 18), 0);
    this.col(col);
    g.box(def.l, v.type === 'quad' ? 12 : 18, def.w - 4);
    g.pop();
    if (v.type === 'jeep') {
      g.push();
      g.translate(-def.l * 0.08, -36, 0);
      this.col([62, 104, 72]);
      g.box(def.l * 0.5, 18, def.w - 8);
      g.translate(def.l * 0.2, -1, 0);
      this.col([40, 64, 90]);
      g.box(2, 12, def.w - 12);
      g.pop();
      g.push();
      g.translate(-def.l * 0.3, -50, 0);
      this.col([30, 40, 30]);
      g.box(3, 3, def.w - 8);                       // arceau
      g.pop();
    } else {
      g.push();
      g.translate(def.l * 0.18, -27, 0);
      this.col([30, 30, 38]);
      g.box(4, 3, def.w - 4);                       // guidon
      g.pop();
    }
    // phares
    this.glow(1);
    this.col([255, 255, 200]);
    for (const sz of [-1, 1]) {
      g.push();
      g.translate(def.l / 2, -17, sz * def.w * 0.28);
      g.sphere(3, 6, 4);
      g.pop();
    }
    this.glow(0);
    // occupants
    v.occupants.forEach((o, i) => {
      if (!o) return;
      const off = v.type === 'quad' ? -2 : (i === 2 ? -def.l * 0.28 : def.l * 0.05);
      const side = v.type === 'quad' ? 0 : (i === 0 ? -def.w * 0.18 : (i === 1 ? def.w * 0.2 : 0));
      g.push();
      g.translate(off, v.type === 'quad' ? -34 : -48, side);
      this.col(o.skin.body);
      g.sphere(7.5, 7, 5);
      g.pop();
    });
    g.pop();
  },

  // Animaux : modèles en volumes simples, pattes qui bougent avec la vitesse
  animal(a, time) {
    const g = this.g;
    const flash = a.flash > 0;
    const tone = (c) => (flash ? [255, 255, 255] : c);
    if (a instanceof Corbeau) {
      g.push();
      this.at(a.pos.x, a.pos.y, 105, a.angle);
      const flap = Math.sin(a.age * 14 + a.phaseFlap) * 0.7;
      this.col(tone([18, 18, 26]));
      g.box(11, 4, 5);
      for (const side of [-1, 1]) {
        g.push();
        g.translate(0, 0, side * 6);
        g.rotateX(side * flap);
        this.col(tone([34, 34, 46]));
        g.box(7, 1.2, 12);
        g.pop();
      }
      g.pop();
      if (a.alerted) {
        this.shadow(a.pos.x, a.pos.y, 6, 40);
      }
      return;
    }
    const wolf = a instanceof Loup;
    const speed = a.vel.mag();
    const stride = Math.sin(a.age * (wolf ? 16 : 13)) * Math.min(1, speed / 2) * 5;
    const body = wolf ? [112, 114, 124] : [160, 112, 66];
    this.shadow(a.pos.x, a.pos.y, wolf ? 17 : 19);
    g.push();
    this.at(a.pos.x, a.pos.y, 0, a.angle);
    // pattes
    this.col(tone(wolf ? [80, 82, 92] : [110, 76, 44]));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.push();
        g.translate(sx * 9 + stride * sx * sz * 0.4, -6, sz * 4);
        g.box(3, 12, 3);
        g.pop();
      }
    }
    // corps
    g.push();
    g.translate(0, wolf ? -14 : -18, 0);
    this.col(tone(body));
    g.box(wolf ? 26 : 28, wolf ? 10 : 13, wolf ? 10 : 12);
    g.pop();
    // tête
    g.push();
    g.translate(wolf ? 16 : 18, wolf ? -17 : -26, 0);
    this.col(tone(wolf ? [128, 130, 140] : [150, 104, 60]));
    g.box(wolf ? 10 : 9, wolf ? 8 : 8, 8);
    if (wolf) {
      this.glow(1);
      this.col(a.state === 'chasse' ? [255, 80, 60] : [250, 220, 90]);
      for (const sz of [-1, 1]) { g.push(); g.translate(4, -1, sz * 2.5); g.box(1.5, 1.5, 1.5); g.pop(); }
      this.glow(0);
    } else {
      this.col(tone([214, 190, 150]));
      for (const sz of [-1, 1]) { g.push(); g.translate(-1, -9, sz * 3); g.box(2, 12, 2); g.pop(); }
    }
    g.pop();
    if (!wolf) {
      g.push();
      g.translate(13, -22, 0);
      g.rotateZ(-0.6);
      this.col(tone(body));
      g.box(5, 12, 6);
      g.pop();
    }
    // queue
    g.push();
    g.translate(-15, wolf ? -15 : -21, 0);
    this.col(tone(wolf ? [90, 92, 102] : [235, 225, 200]));
    g.box(wolf ? 10 : 4, wolf ? 3 : 4, 3);
    g.pop();
    g.pop();
  },

  bullet(b) {
    const g = this.g;
    g.push();
    if (b.grenade) {
      this.at(b.pos.x, b.pos.y, 22);
      this.col([50, 80, 40]);
      g.sphere(5, 7, 5);
    } else {
      const a = Math.atan2(b.vel.y, b.vel.x);
      this.glow(1);
      this.at(b.pos.x - b.vel.x, b.pos.y - b.vel.y, 30, a);
      this.col(b.tint);
      g.box(b.vel.mag() * 2.2 + 4, 2.4, 2.4);
      this.glow(0);
    }
    g.pop();
  },

  spark(e) {
    const g = this.g;
    const t = Math.max(0, e.life / e.maxLife);
    g.push();
    this.at(e.pos.x, e.pos.y, 14 + (1 - t) * 22);
    this.col(e.color, 230 * t);
    g.sphere(Math.max(0.8, e.size * (0.25 + 0.3 * t)), 5, 3);
    g.pop();
  },

  // Mur de la tempête : un cylindre ouvert, vu de l'intérieur comme de l'extérieur
  storm(storm) {
    const g = this.g;
    g.push();
    g.translate(storm.pos.x, -450, storm.pos.y);
    this.col([150, 60, 230], 70);
    g.cylinder(storm.r, 900, 96, 1, false, false);
    g.pop();
  }
};
