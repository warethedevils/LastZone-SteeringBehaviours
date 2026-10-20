# LAST ZONE — consignes pour les assistants IA

Lire d'abord `../AGENTS.md` et `../ARCHITECTURE.md` (règles du dépôt), puis `README.md`.

## Règles du projet

- Toute entité visible étend `Vehicle` ; un fichier par entité.
- Les **comportements de base** (seek, arrive, flee, pursue, evade, wander, separate, align, cohesion, avoid, boundaries, followPath) sont des méthodes de `Vehicle` dans `vehicle.js`. Dans les sous-classes, ne mettre que des comportements **personnalisés** ou des **combinaisons** (les enregistrer avec `BehaviorManager.register(nom, (vehicle, ctx, ...args) => force)`).
- Chaque entité a un `BehaviorManager` (`this.behaviors`) : `add`, `remove`, `enable` / `disable`, `setWeight` / `setScale`, `define` / `use` (comportements complexes), `save` / `load` (JSON), `apply(ctx)` (somme pondérée puis `applyForce`).
- Steering = vitesse désirée − vitesse actuelle, limité à `maxForce`. Ne jamais déplacer une entité directement, toujours `applyForce`.
- **`vehicle.js` : ne modifier qu'avec l'accord explicite de l'utilisateur.** Accord donné uniquement pour `13-LastZone/vehicle.js` ; aucun autre `vehicle.js` du dépôt ne doit changer.
- Le réseau de neurones (42 entrées, 15 sorties) ne doit pas changer de forme sans ré-entraînement (`outils/entrainer.js`, `outils/evoluer.js`) ; les nouvelles mécaniques passent par des règles autour du réseau.

## Ajouts récents à connaître

- Faune : `animal.js` + `loup.js` / `cerf.js` / `corbeau.js` ; le Match les fait vivre (`stepFaune`), les bots perçoivent un loup en chasse comme un ennemi. Option de test `faune: false` pour des scénarios déterministes.
- Ordres d'escouade : `Match.cycleOrder`, comportements `escouade` / `tenir` / `assaut` des bots (`Bot.teamMode`).
- Labo des comportements : logique dans `reglages.js` (testée), dessin dans `labocomportements.js`. Toute modification d'un bot passe par la **définition** du comportement complexe, sinon `use()` l'écrase.
- Cerveaux : `Evolution.history`, `championBrains`, `exportJSON` / `importJSON` (validation stricte).

## Tests (obligatoires)

- `npm test` dans ce dossier (Node ≥ 20, `node:test`, aucune dépendance). Chaque nouvelle fonctionnalité a ses tests ; l'aléatoire est injecté (`g.seed`, `g.setRandom`).
- `tests/loadGame.js` charge les vrais fichiers du jeu avec un p5 minimal : y ajouter tout nouveau fichier (même ordre que `index.html`).
- Valider le rendu dans le vrai p5.js (navigateur) après un changement visuel ; l'évaluation du réseau : `node outils/evaluer.js 24`.

## Pièges connus

- Les tests de match dépendent de la graine : tout ajout qui consomme `random()` change la suite des tirages.
- En écrivant des scripts shell avec des apostrophes françaises, préférer l'outil d'écriture de fichiers aux heredocs.
- Vue « joueur » (touche V) = vraie 3D à la première personne : `vue3d.js` (scène WebGL, shader de brume) + `vuefps.js` (projection, noms, arme tenue, repli 2D). Rendu seul : collisions et tirs restent en 2D. Toute nouvelle entité visible doit y avoir son modèle 3D (`Vue3D`), sinon elle est invisible dans cette vue. Repère : monde (x, y) -> (X, Z), hauteur = -Y.
