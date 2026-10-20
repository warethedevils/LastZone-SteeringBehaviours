# LAST ZONE — battle royale à steering behaviors

> ## ▶️ **[JOUER MAINTENANT — https://warethedevils.github.io/LastZone-SteeringBehaviours/](https://warethedevils.github.io/LastZone-SteeringBehaviours/)**
>
> **Accès en 1 clic, rien à installer** : le jeu s'ouvre directement dans le navigateur (Chrome, Edge ou Firefox sur ordinateur ; la vue 3D demande WebGL). Clique sur **JOUER** dans le lobby : le tutoriel guide la première partie, la touche **H** affiche toutes les commandes.

> Un battle royale complet (bus de combat, loot, tempête, construction, véhicules, équipes, faune, vue 3D)
> dans lequel **tout ce qui bouge est un `Vehicle`** piloté par des *steering behaviors*, et dont les
> adversaires sont des **bots à réseau de neurones qui évoluent d'une partie à l'autre**.

| | |
|---|---|
| 🎮 **Jouer en ligne** (GitHub Pages) | https://warethedevils.github.io/LastZone-SteeringBehaviours/13-LastZone/ |
| 💻 **Dépôt GitHub** | https://github.com/warethedevils/LastZone-SteeringBehaviours |
| 🎬 **Vidéo de présentation** (YouTube, 2 min) | `À COMPLÉTER : https://youtu.be/...` |
| 📥 **Fichier de la vidéo** (MP4, voix off et sous-titres) | https://github.com/warethedevils/LastZone-SteeringBehaviours/releases/download/video-v1/LAST-ZONE-presentation.mp4 |
| 🧪 **Tests** | `npm test` — 310 tests, aucune dépendance |

---

## Table des matières

1. [Présentation](#1-présentation)
2. [Jouer](#2-jouer)
3. [Le jeu en détail](#3-le-jeu-en-détail)
4. [Les steering behaviors utilisés](#4-les-steering-behaviors-utilisés)
5. [Architecture du code](#5-architecture-du-code)
6. [Le BehaviorManager](#6-le-behaviormanager)
7. [Les bots : un réseau de neurones par joueur](#7-les-bots--un-réseau-de-neurones-par-joueur)
8. [Outils](#8-outils)
9. [Tests](#9-tests)
10. [Paramétrage](#10-paramétrage)
11. [MON EXPÉRIENCE](#11-mon-expérience)
12. [Conformité aux consignes du cours](#12-conformité-aux-consignes-du-cours)
13. [Crédits](#13-crédits)

---

## 1. Présentation

LAST ZONE est un battle royale en vue de dessus **et en 3D à la première personne** : 24 combattants sautent
d'un bus de combat au-dessus d'une île, cherchent des armes, des soins et des matériaux, construisent des murs,
conduisent des véhicules, se battent seuls ou en équipe, pendant qu'une tempête violette resserre la zone de jeu
jusqu'à ce qu'il n'en reste qu'un (ou qu'une équipe).

Ce qui le rend particulier :

- **Un seul modèle de mouvement.** Joueur, bots, balles, véhicules, loups, cerfs, corbeaux, bus, tempête, arbres :
  chacun est un `Vehicle` (la classe de base du cours). Le mouvement vient toujours d'une *vitesse désirée*,
  d'une *force de steering limitée à `maxForce`* et de `applyForce()`.
- **Un `BehaviorManager` par entité** : on ajoute, retire, active, désactive des comportements, on les règle
  en direct (touche **C**) et on sauvegarde / recharge des comportements complexes.
- **Des bots qui apprennent.** Chaque bot possède un réseau de neurones (42 entrées → 48 → 32 → 15) qui choisit
  son état d'action et règle ses forces de steering ; la population évolue pendant tes parties.
- **Un monde vivant** : des loups qui chassent (et se fatiguent), des cerfs qui fuient en harde, des corbeaux qui
  encerclent les combats — et se voient sur la minimap.
- **Une vraie vue 3D** (WebGL) à la première personne, écrite pour ce projet, avec repli en sprites 2D.

---

## 2. Jouer

### En ligne

https://warethedevils.github.io/LastZone-SteeringBehaviours/13-LastZone/ — rien à installer. Utilise un navigateur
récent (Chrome, Edge ou Firefox) ; la vue 3D demande WebGL.

### En local

```bash
cd 13-LastZone
node serve.js          # puis ouvrir http://localhost:8080
# ou simplement ouvrir index.html dans un navigateur
```

### Commandes

| Commande | Effet |
|---|---|
| **Z Q S D** / W A S D | Se déplacer (**Maj** : sprinter) · au volant : accélérer / tourner |
| **Souris** | Viser · en vue 3D : tourner le regard (clique pour capturer la souris, **Échap** la libère) |
| **Clic gauche** | Tirer · frapper à la pioche · utiliser un soin · lancer la grenade sélectionnée |
| **E** | Ramasser · ouvrir un coffre · monter / descendre d'un véhicule · **maintenir** près d'un coéquipier à terre pour le relever |
| **G** | Lancer une grenade jusqu'au curseur |
| **1 à 5** / molette | Changer d'objet · **R** : recharger |
| **B** ou clic droit | Construire un mur (10 bois, récoltés à la pioche sur arbres et rochers) |
| **Espace** | Sauter du bus de combat |
| **T** | Ordres à l'équipe : libre → *suivez-moi* → *tenez la position* → *à l'attaque* |
| **V** | Changer la vue : 3D à la première personne ↔ vue de dessus |
| **C** | **Labo des comportements** : inspecter et régler le BehaviorManager d'un bot |
| **M** · **Échap** · **D** · **L** · **H** | Carte complète · pause · debug (cerveau d'un bot) · paramètres en direct · aide |

Le lobby propose : difficulté des bots, nombre de combattants (12 / 18 / 24), vitesse de la tempête,
**mode Solo / Duos / Escouade**, vue (de dessus / 3D), onglets *Tenues*, *Stats*, *Cerveaux*, *Options*,
défis, niveau et XP. Un **tutoriel** guide la première partie (Entrée pour le passer) et la touche **H** ouvre
l'aide.

---

## 3. Le jeu en détail

### Déroulement d'une partie

1. **Bus de combat** : il traverse l'île sur un chemin (`followPath`) ; chacun choisit où sauter.
2. **Chute libre** puis **atterrissage** (brève invulnérabilité), au sol, près d'un bâtiment de préférence.
3. **Loot** : coffres, armes au sol de 5 raretés (commun → légendaire), munitions, soins, boucliers, matériaux.
4. **Tempête** : 6 phases, chacune avec attente puis réduction ; dégâts croissants hors du cercle ; un **largage**
   (coffre légendaire) tombe à chaque phase.
5. **Fin** : dernier combattant (ou dernière équipe) debout ; classement, statistiques, XP, niveau, défis.

### Armes et objets

| Catégorie | Contenu |
|---|---|
| Armes à feu | pistolet, mitraillette, fusil d'assaut, fusil à pompe, sniper |
| Armes spéciales | **lance-roquettes** (explosion de zone, détruit murs et arbres), **mitrailleuse lourde** (100 balles, ralentit le porteur), **arbalète** (carreau perforant) |
| Explosifs | **grenades** (lancées jusqu'au curseur, mèche de 1,7 s) |
| Soins | bandages, trousse de soins, mini et grande potions de bouclier |
| Construction | murs en bois (10 bois) ; récolte à la pioche sur arbres (bois) et rochers (métal) |

### Véhicules

Un **quad** (1 place, rapide) et une **jeep** (3 places, solide). La conduite est un steering : le conducteur
donne une direction, la vitesse désirée est `maxSpeed`, la force est limitée par `maxForce` — d'où l'inertie et les
dérapages. Ils **écrasent** les ennemis à pleine vitesse, abattent arbres et murs, se détruisent en explosant.
Les passagers de la jeep peuvent tirer. Les bots les conduisent aussi (rejoindre la zone, écraser un ennemi).

### Mode équipe (Duos / Escouade)

- Pas de tir allié (explosions comprises).
- Un joueur dont la vie tombe à zéro est **mis à terre** : il rampe et saigne ; un coéquipier qui **maintient E**
  près de lui le relève. Si tous les survivants d'une équipe sont à terre, elle est éliminée.
- **Ordres d'escouade (touche T)** : *suivez-moi* (formation en boids : cohésion + alignement + séparation +
  `arriveBehind`), *tenez la position* (cercle autour d'un point, `arrive`), *à l'attaque* (`seek` vers l'ennemi le
  plus proche). Une menace proche ou la tempête reprennent la main ; les coéquipiers montent dans le véhicule du chef.

### Faune

| Espèce | Comportements | Particularités |
|---|---|---|
| **Loup** (`loup.js`) | `wander` · `pursue` · `flee` · `separate` · `cohesion` | plus rapide que le joueur, mais **se fatigue** (endurance) ; attaque joueurs et bots ; fuit quand il est blessé |
| **Cerf** (`cerf.js`) | `wander` · `evade` · `cohesion` · `align` · `separate` | vit en **harde** ; fuit combattants et loups ; laisse des bandages |
| **Corbeau** (`corbeau.js`) | `separate` · `align` · `cohesion` · `wander` · `seek` | vole en **bande** et **encercle les combats** : les corbeaux en alerte apparaissent en rouge sur la minimap |

### Vue 3D à la première personne (touche V)

Une vraie scène WebGL (p5.js en mode `WEBGL`) : île texturée à partir de la carte, bâtiments avec toits et fenêtres,
arbres et rochers en volume, brume de distance (shader), éclairage, véhicules, combattants modélisés (jambes,
torse, tête, arme), faune, tempête en mur violet. L'arme tenue est dessinée au premier plan (recul, lueur de tir,
rechargement), avec un tableau de bord au volant. Dans le bus et en chute libre, la vue de dessus sert à choisir où
atterrir. C'est du **rendu** : la simulation (collisions, tirs) reste en 2D dans `Match`.

### Interface et progression

Lobby (niveau, XP, défis, 10 tenues à débloquer), HUD (vie, bouclier, hotbar, munitions, minimap, flux
d'éliminations, panneau d'équipe, tempête), carte complète, écran de pause, de mort et de résultats, **Labo des
comportements**, onglet **Cerveaux**, page d'aide, sons synthétisés (Web Audio : tirs, explosions, vent, corbeaux,
loups, pas…). Le profil est sauvegardé dans le navigateur (`localStorage`).

---

## 4. Les steering behaviors utilisés

Loi commune : `steering = vitesse désirée − vitesse actuelle`, limité à `maxForce`, appliqué avec `applyForce()`.

| Comportement | Où, et pourquoi |
|---|---|
| `seek` | rejoindre la zone sûre ; aller vers un coéquipier ; assaut vers un ennemi ; le véhicule d'un bot vers sa destination |
| `arrive` | aller au butin sans le dépasser ; cercle d'engagement autour d'un ennemi ; tenir une position ; aller relever un coéquipier ; **la tempête qui glisse vers la zone suivante** |
| `flee` / `evade` | fuite d'un ennemi plus fort ; cerfs qui évitent combattants et loups |
| `pursue` + `leadPoint` | loups qui poursuivent ; visée à interception des cibles mobiles |
| `wander` | bots qui fouillent, loups et cerfs au repos, dérive des largages |
| `avoid` | arbres, rochers, bâtiments, murs (grille spatiale), y compris au volant |
| `separate` / `align` / `cohesion` | hardes de cerfs, bandes de corbeaux, meutes de loups, **formation d'escouade** |
| `followPath` | le bus de combat suit son trajet |
| `sidestep` *(personnalisé)* | esquive latérale d'un projectile qui va passer près du bot |
| `stayInside` *(personnalisé)* | rappel vers l'île près du rivage |
| `arriveBehind` *(personnalisé)* | suivi à distance (formation derrière le chef) |
| `conduite`, `freinage` *(personnalisés)* | un véhicule est un `Vehicle` : la direction demandée devient une vitesse désirée |
| `esquive`, `seekSiHorsZone`, `commande` *(personnalisés)* | enveloppes des bots et du joueur dans le BehaviorManager |

Les comportements de **base** sont des méthodes de `Vehicle` ; seuls les comportements **personnalisés** ou les
**combinaisons** vivent dans les sous-classes.

---

## 5. Architecture du code

### Arborescence

```
13-LastZone/
├── index.html              point d'entrée (charge les scripts dans l'ordre des dépendances)
├── style.css · serve.js    page et petit serveur statique (node serve.js)
├── package.json            commande de test : npm test
├── README.md · CLAUDE.md   documentation · consignes pour les assistants IA
├── libraries/p5.min.js     p5.js 1.7 (local)
├── src/
│   ├── steering/           ★ vehicle.js (Vehicle + BehaviorManager) · behaviors.js · reglages.js
│   ├── config/             config.js — tous les paramètres du jeu au même endroit
│   ├── entites/            une classe par fichier, toutes héritent de Vehicle
│   │                       animal, arbre, balle, batiment, bot, bus, butin, cerf, coffre, combattant,
│   │                       corbeau, etincelle, joueur, largage, loup, mur, rocher, tempete, vehicule
│   ├── monde/              match.js (contrôleur de partie) · carte · grille · chemin · armes · profil · tutoriel
│   ├── ia/                 reseau, cerveau, genome, evolution, cerveau_initial (champion pré-entraîné)
│   ├── rendu/              vue3d.js (WebGL) · vuefps.js (projection, noms, arme tenue, repli 2D)
│   └── interface/          sketch.js (boucle p5) · ui · lobby · hud · ecrans · labo · labocomportements · son · reseauvue
├── tests/                  21 fichiers, 310 tests (node:test)
├── outils/
│   ├── ia/                 entrainer.js · evoluer.js · evaluer.js · ouvrier.js
│   └── video/              video.js (visite guidée enregistrée) · voix.ps1 · mixer-voix.js · narration.json
├── docs/                   VIDEO.md (scénario et fabrication de la vidéo)
└── video/                  enregistrements locaux (non versionnés)
```

### Règles d'architecture

- **Toute entité visible étend `Vehicle`**, un fichier par entité. Les classes qui ne sont pas des `Vehicle`
  (`Match`, `Carte`, `Grille`, `Profil`, `Reseau`, `Cerveau`, `Evolution`, `Son`…) sont des contrôleurs, des données
  ou de l'interface : pas des objets animés du monde.
- **Séparation de Reynolds** : *sélection de l'action* (état du bot choisi par règles ou réseau de neurones) →
  *steering* (forces des comportements) → *locomotion* (`applyForce` + `update` de `Vehicle`).
- **`Match` est le seul à connaître le monde entier** : collisions, dégâts, explosions, ramassage, éliminations,
  équipes, faune. Il fournit à chaque entité le « monde » qu'elle perçoit (`makeWorld()`), avec une perception
  limitée (rayon, ligne de vue).
- **Pas de déplacement direct** : aucune entité ne modifie sa position hors de `applyForce`/`update` (les collisions
  sont des corrections de scène dans `Match`).
- **Pas de dépendance** : p5.js local, Node ≥ 20 pour les tests.

### Boucle de jeu

Pas fixe de 1/60 s (`Match.step`) : bus → tempête → largages → combattants → véhicules → faune → interactions →
réanimation / hémorragie → balles → effets → fin de partie. Le rendu (`sketch.js`) accumule le temps réel et exécute
autant de pas que nécessaire ; l'interface est dessinée en 1280×720 logiques, mise à l'échelle de la fenêtre.

---

## 6. Le BehaviorManager

Défini dans `src/steering/vehicle.js`, propriété `behaviors` de **tout** `Vehicle`.

| Besoin | API |
|---|---|
| Ajouter / retirer | `add(nom, comportement, poids, options)` · `remove(nom)` · `clear()` |
| Activer / désactiver | `enable(nom)` · `disable(nom)` · `toggle(nom)` · `isEnabled(nom)` |
| Régler | `setWeight(nom, poids)` · `setScale(nom, facteur)` (le réseau de neurones règle ainsi ses gains) |
| Calculer et appliquer | `compute(ctx)` → forces pondérées · `apply(ctx)` → `applyForce` de chacune |
| Comportements complexes | `define(nom, [...])` · `use(nom)` — ex. états d'un bot : `butin`, `zone`, `errance`, `fuite`, `combat`, `soin`, `secours`, `regroupe`, `escouade`, `tenir`, `assaut`… |
| Sauvegarder / charger | `save()` → JSON · `load(json)` |
| Registre | `BehaviorManager.register(nom, (vehicle, ctx, ...args) => force)` |

Les poids peuvent pointer vers `CONFIG` (`weightKey`), ce qui permet de les régler en direct.

### Le Labo des comportements (touche C)

Le BehaviorManager rendu visible : le bot choisi est au centre d'un radar, **chaque comportement de base est une
flèche de force**, la somme est en blanc, la vitesse en jaune. On peut **activer / désactiver** chaque
comportement, régler son **poids**, **appliquer à tous les bots**, **sauvegarder / charger** un comportement
complexe dans 3 emplacements (JSON validé : seuls les comportements du registre sont acceptés, poids bornés) ou
revenir aux comportements d'origine. La logique est dans `src/steering/reglages.js` (testée), le dessin dans
`src/interface/labocomportements.js`.

---

## 7. Les bots : un réseau de neurones par joueur

```
42 capteurs ──► réseau 42 → 48 → 32 → 15 ──► état d'action + réglages ──► steering behaviors ──► locomotion
```

- **Capteurs** : vie, bouclier, arme, munitions, soins, zone sûre, tempête, ennemi (visibilité, distance, direction,
  vitalité, menace), butin, balles proches, couvert, vitesse, personnalité (liste : `Cerveau.INPUT_LABELS`).
- **Sorties** : probabilité de chaque état (les états impossibles sont masqués), réglage du combat (distance
  d'engagement, tolérance de visée, envie de construire) et **six gains de steering** qui amplifient ou atténuent
  butin, zone, engagement, fuite, esquive, errance.
- Le réseau **ne déplace jamais** un bot. Les mécaniques ajoutées ensuite (relever un coéquipier, conduire, lancer
  une grenade, obéir à un ordre) sont des **règles par-dessus le réseau** (`Bot.teamMode`, `thinkInVehicle`,
  `aimAndFire`) : l'architecture du réseau n'a pas changé, donc le cerveau fourni reste valable.

### Entraînement en trois temps

1. **Imitation** (`outils/ia/entrainer.js`) : un bot à règles (le « professeur », déterministe) joue des matchs entiers,
   ses décisions sont enregistrées et le réseau apprend à les reproduire (rétropropagation, Adam, poids de classe).
2. **Neuroévolution hors ligne** (`outils/ia/evoluer.js`) : 48 cerveaux jouent des matchs mélangés (12 réseaux contre 12
   bots à règles) sur plusieurs processus ; croisement des poids, mutation recuite, élitisme. Le champion devient
   `src/ia/cerveau_initial.js`.
3. **Neuroévolution en jeu** : à la fin de chaque match, les meilleurs bots se reproduisent ; la population est
   sauvegardée (`localStorage`) et progresse d'une session à l'autre. L'onglet **Cerveaux** du lobby montre la courbe
   d'évolution, le champion, permet d'**exporter / importer** un cerveau (texte JSON validé) et de **défier le champion**.

### Résultats

`node outils/ia/evaluer.js 24` (24 matchs, 12 réseaux contre 12 bots à règles dans les mêmes parties) :
**classement moyen 11,6 pour les réseaux contre 13,4 pour les règles**, 16 victoires contre 8. L'avance est plus
faible qu'avant l'ajout des véhicules, de la faune et des grenades (le champion a été entraîné sans eux) :
ré-entraîner avec `outils/ia/evoluer.js` est la suite logique.

---

## 8. Outils

| Commande (depuis `13-LastZone`) | Rôle |
|---|---|
| `npm test` | lance les 310 tests |
| `node serve.js` | serveur statique local (http://localhost:8080) |
| `node outils/ia/entrainer.js` | pré-entraînement par imitation |
| `node outils/ia/evoluer.js [générations] [population] [tours]` | neuroévolution parallèle (long : plusieurs dizaines de minutes) |
| `node outils/ia/evaluer.js [matchs]` | réseau contre règles |
| `http://localhost:8080/?video` puis `Video.start()` | enregistre la visite guidée (voir `docs/VIDEO.md`) |

---

## 9. Tests

`npm test` (Node ≥ 20, module `node:test`, **aucune dépendance**). Le rendu p5.js n'étant pas exécutable sous Node,
`tests/loadGame.js` charge les vrais fichiers du jeu dans un contexte isolé avec un p5 minimal et un hasard à graine
(résultats reproductibles) ; le rendu est validé dans le navigateur.

| Domaine | Fichiers | Tests |
|---|---|---|
| Steering et BehaviorManager | `behaviors`, `behaviormanager`, `vehicle`, `chemin`, `grille` | 62 |
| Combat, armes, véhicules, équipes | `armes`, `combattant`, `contenu`, `match`, `monde` | 112 |
| Bots, ordres d'escouade | `bot`, `ordres` | 36 |
| Faune | `faune` | 19 |
| Réseau de neurones et évolution | `reseau`, `cerveau`, `evolution`, `cerveaux` | 42 |
| Labo, profil, tutoriel | `reglages`, `profil`, `tutoriel` | 28 |
| Vue 3D (projection, repli sans WebGL) | `vuefps` | 11 |

---

## 10. Paramétrage

Tout est dans `src/config/config.js` : île et match, joueur, bots (poids, perception, réaction), difficultés,
tempête (6 phases), butin, véhicules, équipes, faune, progression. La touche **L** ouvre un panneau qui modifie ces
valeurs **en direct** ; `resetConfig()` les remet à zéro avant chaque match.

---

## 11. MON EXPÉRIENCE

> Les parties 1 et 5 sont personnelles : **à écrire dans tes mots avant le rendu**. Les parties 2 à 4 décrivent ce
> qui a réellement été fait dans le code.

### 1. Pourquoi ce jeu ? *(à écrire)*

`À COMPLÉTER : pourquoi un battle royale, ce qui t'a plu, ce que tu voulais montrer.`

Ce que le dépôt montre : deux idées précédentes (un essaim, puis un noyau à défendre) ont été écartées — trop
simples et trop peu développées. Le battle royale permet d'utiliser **tous** les comportements du cours dans un même
monde et de poser une vraie question d'IA : des adversaires qui apprennent.

### 2. Quels comportements, et pourquoi

Voir le [tableau de la section 4](#4-les-steering-behaviors-utilisés). Le fil conducteur : chaque situation du jeu
correspond à un comportement du cours (poursuivre → `pursue`, fuir → `evade`, aller au butin → `arrive`, rester
groupés → boids, éviter un arbre → `avoid`…), ce qui rend le comportement des entités **lisible** à l'écran — et dans
le Labo, où chaque comportement est une flèche.

### 3. Comment je les ai réglés

- Chaque force est `vitesse désirée − vitesse actuelle`, limitée à `maxForce` ; le caractère d'une entité vient de
  ses **poids** (`bot.weights` dans `config.js`) : `avoid` et `dodge` à 3 (survivre d'abord), `zone` à 1,6 (la tempête
  est la seule menace certaine), `wander` à 0,6 (assez bas pour que l'errance reste une dérive).
- Au volant, `maxForce` du quad (0,17) et de la jeep (0,12) sont volontairement faibles devant `maxSpeed` :
  accélération douce, dérapages, véhicules lourds mais maîtrisables.
- Les loups sont plus rapides que le joueur (3,5 contre 3,0) mais ont une **endurance** : pas invincibles.
- Les **gains** appris par le réseau multiplient les poids (1 + 0,6 × gain, gain ∈ [−1 ; 1]).
- Le **Labo** (touche C) et le panneau **L** servent à régler en jouant : on observe, on change un poids, on regarde.

### 4. Difficultés rencontrées et résolutions

- **Le réseau jouait moins bien que les règles** après l'imitation. Résolu en rendant le professeur déterministe (le
  réseau peut alors l'apprendre exactement), en rééquilibrant les classes, puis par neuroévolution parallèle.
- **Les tirs rapides (sniper) traversaient les cibles** : les balles sont balayées sur tout leur segment à chaque pas.
- **Les armes semi-automatiques ne tiraient pas au clic** : le tir lit le front montant de la gâchette.
- **Le bus ne partait jamais** (trajet fermé) : le bus disparaît à `progress ≥ 0,985` puis la tempête démarre.
- **Les bots montaient dans les véhicules sans le décider** (le même appel « interagir » servait au butin) : seul le
  joueur monte avec E, les bots passent par une demande explicite (`boardRequest`).
- **Les hardes de cerfs se dispersaient** : séparation et cohésion utilisaient les mêmes voisins ; on sépare
  maintenant voisins lointains (cohésion, alignement) et très proches (séparation, 55 px).
- **Les corbeaux ne restaient pas autour du combat** : un combat n'est « récent » que 7 s, et le test mesurait trop
  tard — c'est aussi la bonne règle de jeu (l'alerte s'éteint avec le combat).
- **Les réglages du Labo étaient perdus** à chaque changement d'état (`use()` reconstruit depuis la définition du
  complexe) : ils sont écrits dans la définition (`Reglages.tweak`), avec un test.
- **Un JSON de sauvegarde peut être n'importe quoi** : l'import ne garde que les comportements du registre, borne
  les poids ; même validation stricte pour l'import d'un cerveau.
- **Vue « joueur »** : ma première version faisait pivoter la vue de dessus (pas ce qui était demandé), la deuxième
  était en sprites 2D, et la rotation se déclenchait toute seule quand le curseur était décentré. Version finale :
  vrai rendu WebGL (`vue3d.js`), rotation uniquement pilotée par la souris.
- **Tests dépendants de la graine** : ajouter des véhicules ou de la faune change la suite des tirages ; les
  scénarios déterministes désactivent la faune (`faune: false`).

### 5. Outils *(à confirmer)*

- **IDE / environnement** : Claude Code dans l'application de bureau Claude (onglet Code). `À COMPLÉTER si un autre
  éditeur a été utilisé.`
- **Modèle IA** : Claude Sonnet 5.5 (`claude-sonnet-5-5`).
- **Fichiers pour assistants IA** : [`CLAUDE.md`](CLAUDE.md) (ce dossier), [`../AGENTS.md`](../AGENTS.md) et
  [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (règles du dépôt).
- **Vidéo** : montage avec VideoDB (voix off Windows hors ligne, sous-titres incrustés par le jeu).

---

## 12. Conformité aux consignes du cours

| Consigne | Où |
|---|---|
| Plusieurs steering behaviors | [section 4](#4-les-steering-behaviors-utilisés) |
| Tous les objets animés sont des sous-classes de `Vehicle` | `src/entites/` (un fichier par entité) |
| Comportements de base dans `Vehicle`, personnalisés dans les sous-classes | `src/steering/vehicle.js` · `registre` du BehaviorManager |
| Fichiers `.md` pour les assistants IA | `CLAUDE.md`, `../AGENTS.md`, `../ARCHITECTURE.md` |
| README avec « MON EXPÉRIENCE », IDE et modèles IA | [section 11](#11-mon-expérience) |
| **Jeu hébergé** (GitHub Pages) avec lien dans le README | en tête de ce fichier |
| `BehaviorManager` (optionnel) | [section 6](#6-le-behaviormanager) + Labo des comportements |
| **Vidéo YouTube** (1 à 2 min) | lien à ajouter en tête de ce fichier ; scénario et fabrication : [`docs/VIDEO.md`](docs/VIDEO.md) |
| Tests avant de présenter le travail | `npm test` — 310 tests |
| `vehicle.js` : modification avec accord explicite | accordée pour **cette copie uniquement** (`src/steering/vehicle.js`) ; aucun autre `vehicle.js` du dépôt n'est modifié |

---

## 13. Crédits

- **p5.js** 1.7 (LGPL) — rendu 2D et 3D.
- **Craig W. Reynolds**, *Steering Behaviors for Autonomous Characters* (GDC 1999) — référence théorique ;
  exemples du cours (dossiers `1-Seek` à `10-…` du dépôt parent).
- Code, tests et documentation écrits avec **Claude Code** (modèle Claude Sonnet 5.5).
