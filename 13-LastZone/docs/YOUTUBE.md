# Description YouTube (à copier-coller)

## Titre

LAST ZONE — un battle royale 100 % steering behaviors (bots à réseau de neurones, vue 3D, p5.js)

## Description

LAST ZONE est un battle royale en vue de dessus et en 3D à la première personne, réalisé pour le cours de steering behaviors (M2 IA). Tout ce qui bouge — joueur, bots, véhicules, loups, cerfs, corbeaux, balles — est un Vehicle piloté par des forces de steering (seek, arrive, flee, pursue, evade, wander, avoid, séparation / alignement / cohésion…). Chaque entité possède un BehaviorManager, et les adversaires sont des bots dotés d'un réseau de neurones qui évolue d'une partie à l'autre.

🎮 Jouer en ligne (rien à installer) : https://warethedevils.github.io/LastZone-SteeringBehaviours/
💻 Code source et documentation : https://github.com/warethedevils/LastZone-SteeringBehaviours

⏱️ Chapitres
0:00 Présentation du jeu
0:07 Réglages : mode Duos, vue 3D
0:13 Le menu d'aide (touche H)
0:23 Le bus de combat et l'atterrissage
0:30 Vue 3D à la première personne : combat, esquive, visée
0:43 La faune : cerfs en harde, loup qui poursuit, corbeaux qui encerclent les combats
0:57 Mode équipe : ordres d'escouade (boids) et réanimation
1:14 Véhicules : la jeep et le quad
1:28 Le Labo des comportements (BehaviorManager visible)
1:45 Les cerveaux : évolution des bots et courbe d'apprentissage
1:55 Conclusion

🧠 Ce qui est mis en œuvre
• Steering behaviors de base dans la classe Vehicle ; comportements personnalisés et combinaisons dans les sous-classes
• BehaviorManager : ajout, retrait, activation, comportements complexes, sauvegarde / chargement JSON
• Réseau de neurones 42 → 48 → 32 → 15 : choisit l'état d'action et règle les gains de steering ; entraîné par imitation puis par neuroévolution
• Véhicules, armes explosives, mode équipe, faune, vue 3D WebGL (p5.js)
• 311 tests automatisés (Node, aucune dépendance)

🛠️ Outils
IDE : Claude Code (application de bureau Claude)
Modèle IA : Claude Sonnet 5.5 (claude-sonnet-5-5)
Bibliothèque : p5.js
Voix off : synthèse vocale française hors ligne de Windows

📚 Références
Craig W. Reynolds, « Steering Behaviors for Autonomous Characters » (GDC 1999)

#steeringbehaviors #p5js #gamedev #intelligenceartificielle #reseauxdeneurones #neuroevolution #battleroyale #javascript #webgl #m2ia

## Réglages YouTube

- Visibilité : **non répertoriée** ou publique (le professeur doit pouvoir ouvrir le lien).
- Miniature : une capture de la vue 3D avec le titre « LAST ZONE ».
- Catégorie : Science et technologie (ou Jeux vidéo).
- Langue de la vidéo : français. Pas « conçue pour les enfants ».
- Les chapitres (horodatages ci-dessus) s'activent automatiquement si la liste commence à 0:00.

> Les horodatages correspondent à la vidéo actuelle ; ils pourront bouger de quelques secondes si la vidéo est refaite (voir `docs/VIDEO.md`).
