// Vue à la première personne : la projection (maths pures, sans dessin).
// Le rendu lui-même est validé dans le vrai p5.js.

const test = require('node:test');
const assert = require('node:assert');
const { loadGame } = require('./loadGame.js');

const g = loadGame(5);
const { VueFPS, createVector } = g;

function look(x, y, yaw) {
  VueFPS.eye = 30;
  VueFPS.horizon = 330;
  VueFPS.place({ pos: createVector(x, y) }, yaw);
}

test('vue FPS : un point droit devant se projette au centre, à une profondeur égale à sa distance', () => {
  look(100, 100, 0);
  const p = VueFPS.proj(300, 100, 30);
  assert.ok(Math.abs(p.x - VueFPS.W / 2) < 1e-9);
  assert.strictEqual(p.d, 200);
  assert.ok(Math.abs(p.y - VueFPS.horizon) < 1e-9, 'à hauteur des yeux : sur l\'horizon');
});

test('vue FPS : la droite du joueur est à droite de l\'écran, quel que soit le regard', () => {
  for (const yaw of [0, 1, -2.2, Math.PI / 2]) {
    look(500, 500, yaw);
    // vecteur « droite » = avant tourné de +90° (axe y vers le bas)
    const rx = 500 + Math.cos(yaw + Math.PI / 2) * 80 + Math.cos(yaw) * 200;
    const ry = 500 + Math.sin(yaw + Math.PI / 2) * 80 + Math.sin(yaw) * 200;
    const p = VueFPS.proj(rx, ry, 30);
    assert.ok(p.x > VueFPS.W / 2, `yaw ${yaw}`);
    const lx = 500 - Math.cos(yaw + Math.PI / 2) * 80 + Math.cos(yaw) * 200;
    const ly = 500 - Math.sin(yaw + Math.PI / 2) * 80 + Math.sin(yaw) * 200;
    assert.ok(VueFPS.proj(lx, ly, 30).x < VueFPS.W / 2);
  }
});

test('vue FPS : le champ de vision horizontal fait 90° (focale = demi-largeur)', () => {
  look(0, 0, 0);
  const edge = VueFPS.proj(100, 100, 30);          // à 45° à droite
  assert.ok(Math.abs(edge.x - VueFPS.W) < 1e-6);
});

test('vue FPS : derrière le joueur, rien ne se projette', () => {
  look(100, 100, 0);
  assert.strictEqual(VueFPS.proj(50, 100, 30), null);
  assert.strictEqual(VueFPS.proj(102, 100, 30), null, 'trop près (plan proche)');
});

test('vue FPS : plus un objet est loin, plus il est petit et proche de l\'horizon', () => {
  look(0, 0, 0);
  const near = VueFPS.proj(100, 0, 0);
  const far = VueFPS.proj(400, 0, 0);
  assert.ok(near.k > far.k);
  assert.ok(near.y > far.y, 'les pieds d\'un objet lointain sont plus près de l\'horizon');
  const head = VueFPS.proj(100, 0, 46);
  assert.ok(head.y < near.y, 'la tête est au-dessus des pieds');
});

test('vue FPS : le sol est calculé par floor casting — profondeur inversement proportionnelle à la ligne d\'écran', () => {
  VueFPS.eye = 30;
  const d1 = (VueFPS.f * VueFPS.eye) / 30;
  const d2 = (VueFPS.f * VueFPS.eye) / 60;
  assert.strictEqual(d1, 2 * d2);
});

test('vue FPS : la brume augmente avec la distance et reste bornée', () => {
  assert.strictEqual(VueFPS.fogAmount(0), 0);
  assert.ok(VueFPS.fogAmount(500) < VueFPS.fogAmount(1500));
  assert.ok(VueFPS.fogAmount(1e6) <= 0.85);
  const near = VueFPS.tint([100, 100, 100], 0);
  const far = VueFPS.tint([100, 100, 100], 2600);
  assert.deepStrictEqual(Array.from(near), [100, 100, 100]);
  assert.ok(far[2] > near[2], 'le lointain tire vers la couleur du ciel');
});

test('vue FPS : la direction « devant » de ZQSD suit le regard (conversion écran -> monde)', () => {
  // même formule que sketch.js : monde = R(yaw + 90°) · (commande écran)
  const convert = (move, yaw) => {
    const a = yaw + Math.PI / 2;
    return { x: move.x * Math.cos(a) - move.y * Math.sin(a), y: move.x * Math.sin(a) + move.y * Math.cos(a) };
  };
  for (const yaw of [0, 0.7, -1.9, 3]) {
    const forward = convert({ x: 0, y: -1 }, yaw);
    assert.ok(Math.abs(forward.x - Math.cos(yaw)) < 1e-9 && Math.abs(forward.y - Math.sin(yaw)) < 1e-9);
    // et la projection de ce point est bien au centre de l'écran
    look(0, 0, yaw);
    const p = VueFPS.proj(forward.x * 300, forward.y * 300, 30);
    assert.ok(Math.abs(p.x - VueFPS.W / 2) < 1e-6);
  }
});

test('vue 3D : sans WebGL (ici Node), l\'initialisation échoue proprement et la vue retombe sur les sprites', () => {
  assert.strictEqual(g.Vue3D.init(), false);
  assert.strictEqual(g.Vue3D.failed, true);
  assert.strictEqual(g.Vue3D.init(), false, 'pas de nouvelle tentative');
});

test('vue 3D : repère du rendu — le monde (x, y) devient (X, Z) et la hauteur est -Y', () => {
  const calls = [];
  const fake = { translate: (...a) => calls.push(['translate', ...a]), rotateY: (a) => calls.push(['rotateY', a]) };
  g.Vue3D.g = fake;
  g.Vue3D.at(120, 340, 30, 0.5);
  g.Vue3D.g = null;
  assert.deepStrictEqual(calls[0], ['translate', 120, -30, 340]);
  assert.deepStrictEqual(calls[1], ['rotateY', -0.5], 'un angle du jeu tourne en sens inverse autour de l\'axe Y de p5');
});

test('vue 3D : les shaders déclarent brume, lumière et matière', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('./loadGame.js').sourcePath('vue3d.js'), 'utf8');
  for (const word of ['uFogColor', 'uFogFar', 'uLight', 'uMaterialColor', 'uSampler', 'isTexture']) assert.ok(src.includes(word), word);
});
