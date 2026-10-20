// Aides de rendu : halos lumineux additifs. Pur dessin, aucune logique de jeu.

function drawGlow(x, y, radius, r, g, b, alpha = 70) {
  push();
  blendMode(ADD);
  noStroke();
  fill(r, g, b, alpha * 0.25);
  circle(x, y, radius * 2.4);
  fill(r, g, b, alpha * 0.5);
  circle(x, y, radius * 1.5);
  fill(r, g, b, alpha);
  circle(x, y, radius * 0.8);
  pop();
}

function drawRing(x, y, radius, r, g, b, alpha = 120, weight = 2) {
  push();
  blendMode(ADD);
  noFill();
  stroke(r, g, b, alpha);
  strokeWeight(weight);
  circle(x, y, radius * 2);
  pop();
}

// Rectangle jouable du monde (marge de confinement incluse par les appelants)
function boundsRect() {
  return { x: 0, y: 0, w: WORLD.w, h: WORLD.h };
}
