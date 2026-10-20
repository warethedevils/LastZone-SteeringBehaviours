// LAST ZONE — tous les paramètres du jeu au même endroit (reprennent ceux des
// exemples : maxSpeed / maxForce, rayons de perception, poids des comportements,
// wander, chemin, endurance...). Le panneau « Labo » (touche L) les modifie en direct.
//
// DEFAULTS n'est jamais modifié ; CONFIG en est une copie que resetConfig()
// remet à zéro avant chaque match.

const WORLD = { w: 3200, h: 3200 };
const VIEW = { w: 1280, h: 720 };

const DEFAULTS = {
  step: 1 / 60,

  island: { cx: 1600, cy: 1600, radius: 1400, shoreMargin: 60 },

  match: {
    fighters: 24,
    busSpeed: 4.2,        // px / image
    busMargin: 140,       // le bus sort de la carte de cette distance avant de disparaître
    fallTime: 5,          // durée de la chute libre (s)
    airSpeed: 7.5,        // vitesse en chute / sous parachute
    landingShield: 1.5,   // invulnérabilité à l'atterrissage (s)
    autoJumpAfter: 14,    // le joueur est éjecté du bus après ce délai
    damageScale: 0.65     // atténue tous les dégâts d'armes (durée des combats)
  },

  // ----- Le joueur : WASD pilote une vitesse désirée, la force reste limitée -----
  joueur: {
    maxSpeed: 3.0, sprintFactor: 1.5, maxForce: 0.7, r: 13,
    pickupRadius: 58,
    harvestRange: 74, harvestDamage: 22, harvestCooldown: 0.42,
    buildCost: 10, wallHp: 180, wallCooldown: 0.4, wallDistance: 52,
    useSlowFactor: 0.45
  },

  // ----- Les bots : machine à états pilotée par des steering behaviors -----
  bot: {
    maxSpeed: 2.85, maxForce: 0.42, r: 13,
    perception: 520,          // détection d'un ennemi
    lootPerception: 560,      // détection du butin
    aimTurn: 0.16,            // vitesse de rotation du viseur (rad / image)
    weights: {
      loot: 1, wander: 0.6, avoid: 3, separation: 1.2, zone: 1.6,
      engage: 1.2, dodge: 3, flee: 2.2
    },
    wanderDistance: 120, wanderRadius: 45, wanderDisplace: 0.3,
    strafeEvery: 1.6,         // durée d'un sens de déplacement latéral en combat (s)
    calmMin: 14, calmMax: 28,  // après l'atterrissage, un bot fouille avant de chercher la bagarre (s)
    reaction: 0.55,           // délai avant de tirer sur un ennemi qu'il vient de repérer (s)
    lootGiveUp: 14,           // abandonne un butin inaccessible après (s)
    zoneMargin: 90            // anticipe la tempête de cette distance
  },

  difficulte: {
    facile: { aim: 0.55, perception: 0.8, reaction: 0.75 },
    normal: { aim: 1, perception: 1, reaction: 1 },
    difficile: { aim: 1.4, perception: 1.2, reaction: 1.25 }
  },

  // ----- La tempête : cercle qui se resserre (le centre se déplace par arrive) -----
  tempete: {
    startRadius: 1700,
    speedFactor: 1,           // multiplie la vitesse des phases (Options)
    phases: [
      { wait: 50, shrink: 45, radius: 1000, dps: 1.5 },
      { wait: 40, shrink: 40, radius: 640, dps: 3 },
      { wait: 32, shrink: 32, radius: 380, dps: 5 },
      { wait: 26, shrink: 26, radius: 190, dps: 8 },
      { wait: 20, shrink: 20, radius: 70, dps: 11 },
      { wait: 10, shrink: 14, radius: 8, dps: 16 }
    ]
  },

  balle: { r: 3 },

  butin: {
    chests: 40, floorWeapons: 60, floorHeals: 45, ammoBoxes: 55, materialPiles: 40,
    chestRarity: [28, 30, 24, 13, 5],
    floorRarity: [55, 27, 12, 5, 1],
    airdropEvery: 1,         // un largage au début de chaque phase de tempête
    grenades: 22             // grenades au sol sur la carte
  },

  // ----- Véhicules (quad / jeep) -----
  vehicule: { quads: 6, jeeps: 3, ramSpeed: 2.2, ramDamage: 10 },

  // ----- Mode équipe : mise à terre, réanimation -----
  equipe: { reviveTime: 3, reviveRange: 75, reviveHp: 40, downedHp: 30, bleedRate: 2 },

  // ----- Faune : loups (poursuite), cerfs (harde, fuite), corbeaux (bande, signal de combat) -----
  faune: {
    loups: 5, cerfs: 16, corbeauxGroupes: 2, corbeauxParGroupe: 7,
    loupHp: 70, loupWalk: 1.7, loupRun: 3.5, loupForce: 0.34, loupPerception: 420,
    loupBiteDelay: 0.9, loupBite: 9, loupStamina: 9, loupRecovery: 7,
    cerfHp: 40, cerfWalk: 1.1, cerfRun: 3.3, cerfForce: 0.3, cerfAlert: 260,
    corbeauSpeed: 3.4, corbeauForce: 0.12, corbeauRange: 700
  },

  carte: { trees: 300, rocks: 46, towns: 7, housesPerTown: [5, 8] },

  // ----- Progression -----
  progression: { xpBase: 100, xpPerKill: 25, xpMatch: 20, xpWin: 120, xpTop3: 60, xpTop10: 30 }
};

function cloneConfig(source) {
  return JSON.parse(JSON.stringify(source));
}

let CONFIG = cloneConfig(DEFAULTS);

function resetConfig() {
  const fresh = cloneConfig(DEFAULTS);
  for (const key of Object.keys(CONFIG)) delete CONFIG[key];
  Object.assign(CONFIG, fresh);
  return CONFIG;
}
