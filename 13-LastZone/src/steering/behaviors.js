// Comportements PERSONNALISÉS et utilitaires de pilotage.
//
// Les comportements de BASE (seek, arrive, flee, pursue, evade, wander, separate,
// align, cohesion, avoid, boundaries, followPath) sont des méthodes de Vehicle : ils
// ne sont pas redéfinis ici. Cet objet ne contient que
//   - des comportements propres au jeu : sidestep (esquive latérale d'un tir),
//     arriveBehind (suivi à distance), stayInside (rappel vers un disque) ;
//   - des utilitaires : leadPoint (point d'interception), angleDifference,
//     neighbors, applyWeighted ;
//   - des raccourcis (Behaviors.flee(v, p) = v.flee(p), etc.) pour garder une écriture
//     fonctionnelle dans les tests et les modules.
//
// Loi commune : steering = vitesse désirée - vitesse actuelle, limité à maxForce.

const Behaviors = {
  // ---------- Raccourcis vers les comportements de base de Vehicle ----------
  steerToward(vehicle, desired) { return vehicle.steerToward(desired); },
  predictPosition(vehicle, other, maxFrames = 30) { return vehicle.predictPosition(other, maxFrames); },
  pursue(vehicle, other, maxFrames = 30) { return vehicle.pursue(other, maxFrames); },
  flee(vehicle, point) { return vehicle.flee(point); },
  evade(vehicle, other, maxFrames = 30) { return vehicle.evade(other, maxFrames); },
  separation(vehicle, neighbors) { return vehicle.separate(neighbors); },
  alignment(vehicle, neighbors) { return vehicle.align(neighbors); },
  cohesion(vehicle, neighbors) { return vehicle.cohesion(neighbors); },
  avoidObstacles(vehicle, obstacles, lookAhead = 24, margin = 8) { return vehicle.avoid(obstacles, lookAhead, margin); },
  boundaries(vehicle, rect, margin = 25) { return vehicle.boundaries(rect, margin); },
  followPath(vehicle, path, predictFrames = 20, aheadDistance = 30, insideGain = 0.5) {
    return vehicle.followPath(path, predictFrames, aheadDistance, insideGain);
  },

  // ---------- Comportements personnalisés ----------

  // Arrivée avec distance de suivi `spacing` (queue d'un serpent, suivi d'un coéquipier)
  arriveBehind(vehicle, target, spacing = 20, slowRadius = 60) {
    const distance = p5.Vector.dist(vehicle.pos, target);
    const speed = vehicle.maxSpeed * constrain((distance - spacing) / slowRadius, 0, 1);
    const desired = p5.Vector.sub(target, vehicle.pos);
    if (desired.magSq() === 0) return createVector(0, 0);
    desired.setMag(speed);
    return vehicle.steerToward(desired);
  },

  // Esquive latérale d'un projectile : s'il se rapproche et passerait tout près, la
  // vitesse désirée est perpendiculaire à sa trajectoire, du côté où l'on se trouve.
  sidestep(vehicle, shotPos, shotVel, margin = 26) {
    const speed = shotVel.mag();
    if (speed === 0) return createVector(0, 0);
    const dir = p5.Vector.div(shotVel, speed);
    const rel = p5.Vector.sub(vehicle.pos, shotPos);
    const along = rel.dot(dir);
    if (along <= 0) return createVector(0, 0);          // le tir est déjà passé
    const lateral = p5.Vector.sub(rel, p5.Vector.mult(dir, along));
    const distance = lateral.mag();
    if (distance >= margin + vehicle.r) return createVector(0, 0);
    const side = distance === 0 ? createVector(-dir.y, dir.x) : lateral.setMag(1);
    return vehicle.steerToward(side.mult(vehicle.maxSpeed));
  },

  // Rappel vers l'intérieur d'un disque (le rivage de l'île) : nulle tant qu'on est
  // à plus de `margin` du bord, sinon vitesse désirée vers le centre.
  stayInside(vehicle, center, radius, margin = 80) {
    const toCenter = p5.Vector.sub(center, vehicle.pos);
    const distance = toCenter.mag();
    if (distance <= radius - margin) return createVector(0, 0);
    if (distance === 0) return createVector(0, 0);
    return vehicle.steerToward(toCenter.setMag(vehicle.maxSpeed));
  },

  // ---------- Utilitaires ----------

  // Voisins d'un véhicule dans un rayon (inclusif), soi-même exclu.
  neighbors(vehicle, others, radius) {
    const found = [];
    for (const other of others) {
      if (other === vehicle) continue;
      if (p5.Vector.dist(vehicle.pos, other.pos) <= radius) found.push(other);
    }
    return found;
  },

  // Point d'interception : où viser pour toucher une cible en mouvement avec un
  // projectile de vitesse constante (résolution exacte, repli sur la cible).
  leadPoint(shooterPos, targetPos, targetVel, bulletSpeed) {
    const rel = p5.Vector.sub(targetPos, shooterPos);
    const a = targetVel.dot(targetVel) - bulletSpeed * bulletSpeed;
    const b = 2 * rel.dot(targetVel);
    const c = rel.dot(rel);
    let t = -1;
    if (Math.abs(a) < 1e-9) {
      if (b < 0) t = -c / b;
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const root = Math.sqrt(disc);
        const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)].filter(x => x > 0);
        if (candidates.length > 0) t = Math.min(...candidates);
      }
    }
    if (t <= 0 || !Number.isFinite(t)) return targetPos.copy();
    return p5.Vector.add(targetPos, p5.Vector.mult(targetVel, t));
  },

  // Différence d'angle signée dans [-π, π] : de a vers b
  angleDifference(a, b) {
    let d = (b - a) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
  },

  // Somme pondérée de forces nommées : { nom: [force, poids] } -> applique chacune au
  // véhicule et retourne les forces pondérées (pour le debug).
  applyWeighted(vehicle, weighted) {
    const applied = {};
    for (const name of Object.keys(weighted)) {
      const [force, weight] = weighted[name];
      const scaled = force.copy().mult(weight);
      vehicle.applyForce(scaled);
      applied[name] = scaled;
    }
    return applied;
  }
};

// Comportements personnalisés enregistrés pour pouvoir être sauvegardés par nom dans un BehaviorManager
BehaviorManager.register('arriveBehind', (v, ctx, key, spacing) => (ctx[key] ? Behaviors.arriveBehind(v, ctx[key], spacing) : null));
BehaviorManager.register('stayInside', (v, ctx, key = 'island') => (ctx[key] ? Behaviors.stayInside(v, ctx[key].center, ctx[key].radius, ctx[key].margin) : null));
