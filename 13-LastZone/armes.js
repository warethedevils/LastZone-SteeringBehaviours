// Données des armes, raretés, munitions et soins (aucune entité ici : de la donnée
// et des fonctions pures). Les raretés suivent la logique des jeux de loot :
// commun < peu commun < rare < épique < légendaire.

const RARITES = [
  { id: 'commun', nom: 'Commun', color: [175, 180, 190], mult: 1.0 },
  { id: 'peu', nom: 'Peu commun', color: [110, 225, 90], mult: 1.1 },
  { id: 'rare', nom: 'Rare', color: [70, 165, 255], mult: 1.2 },
  { id: 'epique', nom: 'Épique', color: [195, 105, 255], mult: 1.3 },
  { id: 'legendaire', nom: 'Légendaire', color: [255, 195, 65], mult: 1.45 }
];

// damage : par projectile ; rate : tirs / s ; mag : chargeur ; reload : s ;
// spread : dispersion (rad) ; speed : px / image ; range : px ; pellets : projectiles par tir
const WEAPONS = {
  pistolet: { nom: 'Pistolet', court: 'PIS', ammo: 'legere', damage: 22, rate: 3.2, mag: 12, reload: 1.3, spread: 0.035, speed: 20, range: 480, pellets: 1, auto: false },
  mitraillette: { nom: 'Mitraillette', court: 'SMG', ammo: 'legere', damage: 14, rate: 10, mag: 30, reload: 1.7, spread: 0.085, speed: 19, range: 430, pellets: 1, auto: true },
  fusil: { nom: "Fusil d'assaut", court: 'AR', ammo: 'moyenne', damage: 26, rate: 5.2, mag: 30, reload: 2.0, spread: 0.045, speed: 23, range: 680, pellets: 1, auto: true },
  pompe: { nom: 'Fusil à pompe', court: 'SG', ammo: 'cartouche', damage: 10, rate: 1.1, mag: 6, reload: 2.4, spread: 0.2, speed: 18, range: 300, pellets: 8, auto: false },
  sniper: { nom: 'Sniper', court: 'SNP', ammo: 'lourde', damage: 95, rate: 0.6, mag: 5, reload: 2.8, spread: 0.004, speed: 42, range: 1400, pellets: 1, auto: false },
  // blast : explosion à l'impact (rayon en px, multiplicateur de dégâts sur les murs) ; slow : facteur de vitesse du porteur ;
  // pierce : nombre de combattants traversés en plus du premier
  lance_roquettes: { nom: 'Lance-roquettes', court: 'RPG', ammo: 'roquette', damage: 95, rate: 0.45, mag: 1, reload: 3.2, spread: 0.012, speed: 12, range: 780, pellets: 1, auto: false, blast: { radius: 125, wall: 3 } },
  mitrailleuse: { nom: 'Mitrailleuse lourde', court: 'MG', ammo: 'moyenne', damage: 12, rate: 16, mag: 100, reload: 4.2, spread: 0.12, speed: 21, range: 520, pellets: 1, auto: true, slow: 0.65 },
  arbalete: { nom: 'Arbalète', court: 'ARB', ammo: 'fleche', damage: 78, rate: 0.9, mag: 1, reload: 1.6, spread: 0.004, speed: 30, range: 900, pellets: 1, auto: false, pierce: 1 }
};

// Explosifs à lancer (emplacement d'inventaire, pile) : dégâts de zone après un délai de mèche
const EXPLOSIFS = {
  grenade: { nom: 'Grenades', kind: 'grenade', damage: 90, radius: 135, fuse: 1.7, speed: 9, stack: 6, color: [140, 210, 90], court: 'GR', wall: 3 }
};

const MUNITIONS = {
  legere: { nom: 'Munitions légères', color: [255, 205, 90], boite: 30 },
  moyenne: { nom: 'Munitions moyennes', color: [110, 220, 110], boite: 30 },
  cartouche: { nom: 'Cartouches', color: [255, 110, 90], boite: 8 },
  lourde: { nom: 'Munitions lourdes', color: [120, 170, 255], boite: 6 },
  roquette: { nom: 'Roquettes', color: [255, 140, 60], boite: 3 },
  fleche: { nom: 'Carreaux', color: [190, 160, 120], boite: 8 }
};

// kind 'soin' : restaure des PV jusqu'à `cap` ; kind 'bouclier' : restaure le bouclier
const SOINS = {
  bandage: { nom: 'Bandages', kind: 'soin', use: 3.0, amount: 15, cap: 75, stack: 15, color: [235, 235, 235], court: '+' },
  trousse: { nom: 'Trousse de soins', kind: 'soin', use: 6.0, amount: 100, cap: 100, stack: 3, color: [255, 90, 90], court: '✚' },
  mini: { nom: 'Mini potion', kind: 'bouclier', use: 2.0, amount: 25, cap: 50, stack: 6, color: [100, 190, 255], court: '◇' },
  grand: { nom: 'Grande potion', kind: 'bouclier', use: 4.0, amount: 50, cap: 100, stack: 3, color: [60, 130, 255], court: '◆' }
};

const MATERIAUX = {
  bois: { nom: 'Bois', color: [200, 150, 90] },
  metal: { nom: 'Métal', color: [170, 190, 210] }
};

// Statistiques réelles d'une arme selon sa rareté
function weaponStats(item) {
  const w = WEAPONS[item.type];
  const rarity = item.rarity;
  return {
    ...w,
    damage: w.damage * RARITES[rarity].mult,
    rate: w.rate * (1 + 0.04 * rarity),
    spread: w.spread * (1 - 0.05 * rarity),
    reload: w.reload * (1 - 0.03 * rarity)
  };
}

// Dégâts par seconde théoriques (hors rechargement)
function weaponDps(item) {
  const s = weaponStats(item);
  return s.damage * s.pellets * s.rate;
}

function makeWeapon(type, rarity = 0) {
  return { kind: 'arme', type, rarity, mag: WEAPONS[type].mag };
}

function makeHeal(type, count = 1) {
  return { kind: SOINS[type].kind, type, count };
}

function makeGrenade(count = 1) {
  return { kind: 'grenade', type: 'grenade', count };
}

function itemName(item) {
  if (!item) return '';
  if (item.kind === 'arme') return WEAPONS[item.type].nom;
  if (item.kind === 'pioche') return 'Pioche';
  if (item.kind === 'grenade') return EXPLOSIFS.grenade.nom;
  return SOINS[item.type].nom;
}

function itemColor(item) {
  if (!item) return [90, 100, 125];
  if (item.kind === 'arme') return RARITES[item.rarity].color;
  if (item.kind === 'pioche') return [210, 215, 225];
  if (item.kind === 'grenade') return EXPLOSIFS.grenade.color;
  return SOINS[item.type].color;
}

// Tirage pondéré d'un indice : weights = [p0, p1, ...]
function rollIndex(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let x = random(total);
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}

const ARMES_TIRAGE = { pistolet: 20, mitraillette: 18, fusil: 22, pompe: 20, sniper: 7, lance_roquettes: 4, mitrailleuse: 5, arbalete: 7 };
const SOINS_TIRAGE = { bandage: 40, trousse: 12, mini: 32, grand: 12 };

function rollKey(table) {
  const keys = Object.keys(table);
  return keys[rollIndex(keys.map(k => table[k]))];
}

function rollWeapon(rarityWeights) {
  return makeWeapon(rollKey(ARMES_TIRAGE), rollIndex(rarityWeights));
}

function rollHeal() {
  const type = rollKey(SOINS_TIRAGE);
  return makeHeal(type, type === 'bandage' ? 3 + Math.floor(random(3)) : 1);
}
