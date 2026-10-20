# LAST ZONE — battle royale en vue de dessus

Un battle royale complet dans l'esprit des jeux de loot : bus de combat, atterrissage, coffres et armes de raretés différentes, tempête qui se resserre, construction de murs, largages, **véhicules** (quad, jeep), **armes explosives**, **mode équipe** (duos / escouades avec mise à terre et réanimation) et jusqu'à 23 adversaires… dont chacun est piloté par **son propre réseau de neurones** qui évolue d'une partie à l'autre.

## Liens (à compléter avant le rendu)

| | |
|---|---|
| Jeu en ligne (GitHub Pages — **obligatoire**) | https://warethedevils.github.io/LastZone-SteeringBehaviours/13-LastZone/ |
| Dépôt GitHub | https://github.com/warethedevils/LastZone-SteeringBehaviours |
| Vidéo YouTube de présentation, 1 à 2 minutes (**obligatoire**) | `À COMPLÉTER : https://youtu.be/...` |

Publier sur GitHub Pages : pousser le dépôt sur GitHub, puis *Settings → Pages → Deploy from a branch → `main` / `(root)`*. Le jeu est statique (aucune compilation) : le dossier `13-LastZone` est servi tel quel.

## Lancer

Ouvrir `index.html` dans un navigateur (ou `node serve.js` puis http://localhost:8080).
Tests : `npm test` (Node ≥ 20, aucune dépendance) — 250 tests.

## Le jeu

| Commande | Effet |
|---|---|
| Z Q S D / W A S D | Se déplacer (Maj : sprinter) · au volant : accélérer / tourner |
| Souris | Viser · clic gauche : tirer, frapper à la pioche, utiliser, lancer la grenade sélectionnée |
| E | Ramasser · ouvrir un coffre · monter / descendre d'un véhicule · **maintenir** près d'un coéquipier à terre pour le relever |
| G | Lancer une grenade (jusqu'au curseur) |
| 1 à 5 / molette | Changer d'objet · R : recharger |
| B ou clic droit | Construire un mur (10 bois, récolté à la pioche sur arbres et rochers) |
| Espace | Sauter du bus de combat |
| V | Changer la vue : **normale** (vue de dessus) ou **joueur** (première personne, comme un jeu de tir) |
| T | Ordres à l'équipe : libre → **suivez-moi** → **tenez la position** → **à l'attaque** |
| C | **Labo des comportements** : inspecter et régler le BehaviorManager d'un bot |
| H | Page d'aide (toutes les touches) |
| M · Échap · D · L | Carte complète · pause · debug (affiche le cerveau d'un bot) · labo de paramètres |

**Vue joueur (3D, première personne).** Une fois au sol, tu vois le monde en vraie 3D par les yeux de ton personnage : île texturée, bâtiments avec toits et fenêtres, arbres et rochers en volume, éclairage, brume de distance, véhicules, adversaires modélisés (jambes, torse, tête, arme), tempête en mur violet, arme tenue au premier plan (recul, lueur de tir, rechargement), tableau de bord au volant. Le moteur est `vue3d.js` (p5.js en mode WEBGL + un petit shader) ; `vuefps.js` ajoute les noms, barres de vie et l'arme tenue, et sert de repli en sprites si WebGL est indisponible. La vue ne tourne jamais seule : seule la souris oriente le regard — clique dans le jeu pour la capturer (Échap la libère et met en pause). Z/S avancent et reculent, Q/D se décalent. Dans le bus et en chute libre, la vue de dessus sert à choisir où atterrir. C'est du rendu : la simulation reste en 2D.

### Nouveau contenu

- **Armes** : lance-roquettes (explosion de zone, détruit murs et arbres), mitrailleuse lourde (100 balles, ralentit le porteur), arbalète (carreau perforant qui traverse un ennemi), grenades (lancées jusqu'au curseur, mèche de 1,7 s).
- **Véhicules** : quad (1 place, rapide) et jeep (3 places, solide). Ils écrasent les ennemis lancés à pleine vitesse, abattent arbres et murs, se détruisent en explosant. Les passagers de la jeep peuvent tirer. Les bots les utilisent aussi (rejoindre la zone, écraser un ennemi, descendre au cœur de la zone).
- **Équipes** (lobby : Solo / Duos / Escouade) : pas de tir allié (explosions comprises), un joueur dont la vie tombe à zéro est **mis à terre** (il rampe, saigne) et peut être relevé par un coéquipier qui maintient E ; si tous les survivants de l'équipe sont à terre, elle est éliminée. Le dernier équipage debout gagne ; le classement est par équipe. Les bots relèvent leurs coéquipiers, restent groupés et se montent dans les véhicules des leurs.

### Ce qui rend LAST ZONE unique

1. **Un monde vivant fait de steering behaviors.** Trois espèces, toutes des `Vehicle` :
   - le **loup** (`loup.js`) chasse en `pursue`, plus vite que le joueur, mais **se fatigue** (endurance) ; il se met en `flee` quand il est trop blessé ;
   - le **cerf** (`cerf.js`) vit en harde (cohésion + alignement + séparation) et fuit en `evade` ;
   - les **corbeaux** (`corbeau.js`) volent en bande (les trois règles de Reynolds) et, quand un combat éclate, **encerclent le combat** : ils apparaissent en rouge sur la minimap — un radar à combats gratuit, à condition de savoir lire le ciel. Les loups, eux, attaquent aussi les bots, qui se défendent.
2. **Des ordres d'escouade en boids** (touche T, en équipe). *Suivez-moi* : formation par `arriveBehind` + cohésion + alignement + séparation ; *tenez la position* : cercle autour d'un point (`arrive`) ; *à l'attaque* : `seek` vers l'ennemi le plus proche. Une menace proche ou la tempête reprennent la main, et les coéquipiers montent dans le véhicule du chef.
3. **Le Labo des comportements** (touche C) : le BehaviorManager rendu visible. Le bot choisi est au centre d'un radar ; chaque comportement de base est une **flèche de force**, la somme est en blanc. On active / désactive chaque comportement, on règle son poids, on **applique à tous les bots**, on **sauvegarde et charge** un comportement complexe dans trois emplacements (JSON validé), ou on revient à l'origine. C'est exactement le bonus demandé : ajouter / supprimer, activer / désactiver, sauver / charger des comportements complexes.
4. **Des bots qui apprennent, et on le voit** (onglet *Cerveaux* du lobby) : courbe d'apprentissage hors ligne (réseau vs règles), courbe d'évolution pendant tes parties, personnalité du champion, **export / import** du champion (un texte à partager) et **défi du champion** (toute la partie contre des copies du meilleur cerveau).
5. **Une vraie vue 3D à la première personne** (touche V), un **tutoriel** de première partie et une page d'aide.

## Les bots : un réseau de neurones par joueur

Architecture (sélection de l'action / steering / locomotion de Reynolds) :

```
42 capteurs ──► réseau 42 → 48 → 32 → 15 ──► état d'action + réglages ──► steering behaviors ──► locomotion
```

- **Capteurs** : vie, bouclier, arme, munitions, soins, zone sûre, tempête, ennemi (visible, distance, direction, vitalité, menace), butin, balles proches, couvert, vitesse, personnalité… (liste : `Cerveau.INPUT_LABELS`).
- **Sorties** : probabilité de chaque état (butin, errance, zone, combat, fuite, soin — les états impossibles sont masqués), réglage fin du combat (distance d'engagement, tolérance de visée, envie de construire) et **six gains de steering** (le réseau amplifie ou atténue butin, zone, engagement, fuite, esquive, errance).
- Le réseau ne déplace jamais un bot : les déplacements sont des forces de steering composées en somme pondérée puis appliquées avec `applyForce`.
- Les mécaniques ajoutées ensuite (relever un coéquipier, conduire, lancer une grenade) sont des **règles par-dessus le réseau** (`Bot.teamMode`, `thinkInVehicle`, `aimAndFire`) : l'architecture du réseau n'a pas changé, donc le cerveau fourni reste valable.

Entraînement en trois temps :
1. **Imitation** (`node outils/entrainer.js`) : un bot à règles (le « professeur ») joue des matchs entiers, ses décisions sont enregistrées, le réseau apprend à les reproduire par rétropropagation (Adam, poids de classe).
2. **Neuroévolution hors ligne** (`node outils/evoluer.js`) : une population de 48 cerveaux joue des matchs mélangés (12 réseaux contre 12 bots à règles) sur plusieurs processus ; croisement des poids, mutation recuite, élitisme ; le champion devient `cerveau_initial.js`.
3. **Neuroévolution en jeu** : à la fin de chaque match, les bots les mieux classés se reproduisent ; la population est sauvegardée (`localStorage`) et les bots progressent d'une session à l'autre. Active le debug (D) pour voir le réseau penser en direct.

Évaluation (`node outils/evaluer.js 24`, 24 matchs, 12 réseaux contre 12 bots à règles dans les mêmes parties) : avec le cerveau fourni, **classement moyen 11,6 pour les réseaux contre 13,4 pour les règles** (16 victoires contre 8). L'avance est plus faible qu'avant l'ajout des véhicules et des grenades (le champion a été entraîné sans eux) : ré-entraîner avec `outils/evoluer.js` est la suite logique.

## Le BehaviorManager

`vehicle.js` (copie de `4-Wander/vehicle.js` **modifiée avec l'accord explicite de l'utilisateur**, uniquement dans ce dossier) contient :

- les **comportements de base** comme méthodes de `Vehicle` : `seek`, `arrive`, `flee`, `pursue`, `evade`, `wander`, `separate`, `align`, `cohesion`, `avoid`, `boundaries`, `followPath` ;
- la classe **`BehaviorManager`**, propriété `behaviors` de tout `Vehicle` : `add` / `remove` / `clear`, `enable` / `disable` / `toggle`, `setWeight` / `setScale`, `compute` / `apply` (somme pondérée des forces, puis `applyForce`), des **comportements complexes** nommés (`define(nom, [...])`, `use(nom)`) et leur **sauvegarde / chargement en JSON** (`save()` / `load(json)`). Les poids peuvent pointer vers `CONFIG` (`weightKey`), ce qui permet de les régler en direct dans le Labo (touche L).

Les sous-classes ne contiennent que des comportements **personnalisés** (`esquive`, `seekSiHorsZone`, `commande`, `conduite`, `freinage`, `arriveBehind`, `stayInside`, `sidestep`) enregistrés dans le même registre, ou des **combinaisons** de comportements de base (états du bot : `butin`, `zone`, `errance`, `fuite`, `combat`, `soin`, `secours`, `regroupe`, `vehicule`, `ramper`).

## MON EXPÉRIENCE

> Les parties 1 et 5 sont personnelles : à écrire dans tes mots avant le rendu. Les parties 2 à 4 décrivent ce qui a réellement été fait dans le code.

### 1. Pourquoi ce jeu ? (à écrire)

`À COMPLÉTER : pourquoi un battle royale, ce qui t'a plu, ce que tu voulais montrer.`
Ce que le dépôt montre : deux idées précédentes (un essaim, puis un noyau à défendre) ont été écartées — trop simples et trop peu développées. Le battle royale permet d'utiliser **tous** les comportements du cours dans un même monde (voir tableau ci-dessous) et de poser une vraie question d'IA : des adversaires qui apprennent.

### 2. Quels comportements, et à quoi ils servent

| Comportement | Utilisation dans le jeu |
|---|---|
| `seek` | rejoindre la zone sûre, rejoindre un coéquipier, le véhicule piloté par un bot vers sa destination |
| `arrive` | aller au butin sans le dépasser, cercle d'engagement autour d'un ennemi, la tempête qui glisse vers la zone suivante, aller relever un coéquipier |
| `flee` / `evade` | fuite d'un ennemi plus fort, esquive |
| `pursue` + `leadPoint` | visée à interception de la cible mobile |
| `wander` | errance des bots qui fouillent, dérive des largages |
| `avoid` | arbres, rochers, bâtiments, murs, y compris au volant d'un véhicule |
| `separate` | les bots ne se superposent pas |
| `followPath` | le bus de combat suit son trajet |
| `sidestep` (personnalisé) | esquive latérale d'un projectile qui va passer près du bot |
| `stayInside` (personnalisé) | rappel vers l'île près du rivage |
| `conduite` (personnalisé) | un véhicule est un `Vehicle` : la direction demandée devient une vitesse désirée, la force est limitée à `maxForce` (d'où l'inertie et les dérapages) |

### 3. Comment je les ai réglés

- Chaque force est `vitesse désirée − vitesse actuelle`, limitée à `maxForce` ; le caractère d'un bot vient de ses **poids** (`bot.weights` dans `config.js`) : `avoid` 3 et `dodge` 3 (survivre d'abord), `zone` 1,6 (la tempête est la seule menace certaine), `wander` 0,6 (assez bas pour que l'errance reste une dérive).
- Le **Labo** (touche L) modifie les paramètres en direct : on joue pendant qu'on règle.
- Au volant, `maxForce` du quad (0,17) et de la jeep (0,12) sont volontairement faibles devant `maxSpeed` : les véhicules accélèrent doucement et glissent dans les virages, ce qui les rend lourds mais maîtrisables.
- Les **gains** appris par le réseau multiplient les poids (1 + 0,6 × gain, gain ∈ [−1 ; 1]) : le réseau règle lui-même la façon de composer les comportements.

### 4. Difficultés rencontrées et résolutions

- **Les hardes de cerfs se dispersaient** : la séparation utilisait les mêmes voisins (rayon 200) que la cohésion, donc les animaux se repoussaient à toute distance. Résolu en séparant deux listes : voisins lointains (cohésion, alignement) et voisins très proches (séparation, 55 px).
- **Les corbeaux ne restaient pas autour du combat** : j'avais mesuré trop tard, après les 7 s pendant lesquelles un combat est « récent ». Le test mesure maintenant la bande pendant l'alerte (et c'est la bonne règle de jeu : l'alerte s'éteint avec le combat).
- **Les réglages du Labo étaient perdus** à chaque changement d'état du bot (`use()` reconstruit les comportements depuis la définition du complexe). Résolu en écrivant les réglages dans la définition (`Reglages.tweak`), avec un test qui vérifie qu'ils survivent.
- **Un JSON de sauvegarde peut être n'importe quoi** : l'import ne garde que les comportements du registre, borne les poids, ignore les états inconnus ; même chose pour l'import d'un cerveau (architecture, tailles, nombres finis).

- **Le réseau jouait moins bien que les règles** après l'imitation. Résolu en rendant le professeur déterministe (le réseau peut alors l'apprendre exactement), en rééquilibrant les classes, puis par neuroévolution parallèle.
- **Des tirs rapides (sniper) traversaient les cibles** : les balles sont balayées sur tout leur segment à chaque pas (`Grille.segmentCircle`).
- **Armes semi-automatiques qui ne tiraient pas au clic** : le tir lit le front montant de la gâchette (`firePressed`).
- **Le bus ne partait jamais** (trajet fermé) : test `progress >= 0.985`, le bus disparaît puis la tempête démarre.
- **Les bots montaient dans les véhicules sans le décider** (le même appel « interagir » servait au butin) : seul le joueur monte avec E, les bots passent par une demande explicite (`boardRequest`).
- **Tests dépendants de la graine aléatoire** : ajouter des véhicules change la suite des tirages ; les tests de murs ne supposent plus un terrain vide.
- **Vue première personne** : ma première version faisait pivoter la vue de dessus (pas ce qui était demandé), la deuxième était en sprites 2D (pas assez « 3D »), et la rotation se déclenchait toute seule quand le curseur était décentré. Version finale : vrai rendu WebGL (`vue3d.js`) et rotation uniquement pilotée par les déplacements de la souris. Tests : projection, repère du rendu, repli sans WebGL.

### 5. Outils (à confirmer)

- IDE / environnement : **Claude Code dans l'application de bureau Claude** (onglet Code). `À COMPLÉTER si tu as utilisé un autre éditeur.`
- Modèle IA : **Claude Sonnet 5.5** (`claude-sonnet-5-5`).
- Fichiers pour assistants IA : `CLAUDE.md` (ce dossier), `../AGENTS.md` et `../ARCHITECTURE.md` (règles du dépôt).

## Tests

`npm test` : plus de 300 tests (Node, aucune dépendance) : steering et BehaviorManager, armes et explosions, véhicules, équipes, faune, ordres d'escouade, Labo des comportements, évolution et import / export des cerveaux, tutoriel, projection de la vue 3D.

## Où est chaque notion du cours

| Dossier du dépôt | Dans LAST ZONE |
|---|---|
| 1-Seek | Pose et état des bots, rejoindre la zone sûre |
| 2-PursueEvade | `leadPoint` (visée à interception), esquive `sidestep` des balles, **loups qui poursuivent, cerfs qui évitent** |
| 3-Arrival | `arrive` vers le butin, les points d'atterrissage, le cercle d'engagement |
| 4-Wander | Errance des bots, des loups, des cerfs, dérive des largages |
| 5-PathFollowing | Le bus de combat suit son trajet (`Chemin.line`) |
| 6-ObstacleAvoidance | `avoid` (arbres, rochers, bâtiments, murs) via une grille spatiale, conduite des véhicules |
| 7-Boids | Séparation entre combattants, **hardes de cerfs, bandes de corbeaux, formation d'escouade** (cohésion + alignement + séparation) |
| 8-EvolutionarySteeringBehavior, 9, 10 | `Genome` (personnalité), `Reseau` (réseau de neurones), `Evolution` (algorithme génétique) |
| 1-Seek (TargetFutante) | La tempête : le centre glisse vers la zone suivante par `arrive` |

## Organisation du code

- `vehicle.js` : copie de `4-Wander/vehicle.js` étendue (comportements de base + `BehaviorManager`), modifiée avec accord explicite. **Aucun autre `vehicle.js` du dépôt n'est modifié.**
- Un fichier par entité, toutes héritent de `Vehicle` : `animal.js` (base de `loup.js`, `cerf.js`, `corbeau.js`), `combattant.js` (base de `joueur.js` et `bot.js`), `vehicule.js` (quad / jeep), `balle.js`, `butin.js`, `coffre.js`, `arbre.js`, `rocher.js`, `batiment.js`, `mur.js`, `bus.js`, `largage.js`, `tempete.js`, `etincelle.js`.
- Données et modules : `armes.js`, `grille.js`, `carte.js`, `config.js`, `behaviors.js`, `genome.js`, `reseau.js`, `cerveau.js`, `evolution.js`, `profil.js`.
- Contrôleur : `match.js` (règles de scène : collisions, véhicules, explosions, équipes, dégâts, ramassage, récolte, construction, éliminations, classement).
- Réglages : `reglages.js` (logique du Labo : poids, sauvegardes JSON), `tutoriel.js`.
- Rendu 3D : `vue3d.js` (WebGL), `vuefps.js` (projection, noms, arme tenue).
- Interface : `labocomportements.js`, `ui.js`, `lobby.js`, `hud.js`, `ecrans.js`, `reseauvue.js`, `labo.js`, `son.js`, `sketch.js`.
- Outils : `outils/entrainer.js`, `outils/evoluer.js`, `outils/evaluer.js`.
- Tests : `tests/*.test.js` (`npm test`), validation du rendu dans le vrai p5.js à faire dans le navigateur.
