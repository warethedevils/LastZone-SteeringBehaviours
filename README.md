# Steering Behaviors — M2 IA² (2026-2027)

> ## ▶️ **[JOUER MAINTENANT — https://warethedevils.github.io/LastZone-SteeringBehaviours/](https://warethedevils.github.io/LastZone-SteeringBehaviours/)**
>
> **Accès en 1 clic, rien à installer** : le jeu s'ouvre directement dans le navigateur (Chrome, Edge ou Firefox sur ordinateur ; la vue 3D demande WebGL). Clique sur **JOUER** dans le lobby : le tutoriel guide la première partie, la touche **H** affiche toutes les commandes.

Ce dépôt contient les exemples du cours de *steering behaviors* (dossiers `1-…` à `10-…`, fournis par l'enseignant)
et **mon projet : LAST ZONE** (dossier [`13-LastZone`](13-LastZone/)).

## Mon projet : LAST ZONE

> Un battle royale en vue de dessus et en 3D à la première personne, où **tout ce qui bouge est un `Vehicle`**
> piloté par des steering behaviors, et dont les adversaires sont des **bots à réseau de neurones qui évoluent**.

| | |
|---|---|
| 🎮 Jouer en ligne (GitHub Pages) | https://warethedevils.github.io/LastZone-SteeringBehaviours/13-LastZone/ |
| 💻 Dépôt | https://github.com/warethedevils/LastZone-SteeringBehaviours |
| 🎬 Vidéo de présentation (YouTube) | `À COMPLÉTER : https://youtu.be/...` |
| 📥 Fichier de la vidéo (MP4, 2 min) | https://github.com/warethedevils/LastZone-SteeringBehaviours/releases/download/video-v1/LAST-ZONE-presentation.mp4 |
| 📖 Documentation complète, **MON EXPÉRIENCE**, outils IA et IDE | [13-LastZone/README.md](13-LastZone/README.md) |
| 🤖 Fichiers pour assistants IA | [AGENTS.md](AGENTS.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [13-LastZone/CLAUDE.md](13-LastZone/CLAUDE.md) |
| 🧪 Tests | `cd 13-LastZone && npm test` (310 tests, aucune dépendance) |

Ce que le projet met en œuvre : `seek`, `arrive`, `flee`, `pursue`, `evade`, `wander`, `avoid`, `followPath`,
séparation / alignement / cohésion (boids), plus des comportements personnalisés ; un **`BehaviorManager`** par
entité (ajout, retrait, activation, comportements complexes, sauvegarde JSON) avec un **Labo des comportements**
visuel ; des bots à **réseau de neurones** entraînés par imitation puis par neuroévolution ; véhicules, équipes,
faune (loups, cerfs, corbeaux) et une vue 3D WebGL.

### Organisation de `13-LastZone`

```
13-LastZone/
├── index.html · style.css · serve.js · package.json
├── README.md · CLAUDE.md            documentation et consignes pour assistants IA
├── libraries/                       p5.js (local)
├── src/
│   ├── steering/                    Vehicle + BehaviorManager, comportements personnalisés, réglages
│   ├── config/                      tous les paramètres du jeu
│   ├── entites/                     une classe par fichier, toutes des Vehicle
│   ├── monde/                       Match (contrôleur), carte, armes, profil, tutoriel
│   ├── ia/                          réseau de neurones, cerveau, évolution, champion pré-entraîné
│   ├── rendu/                       vue 3D (WebGL) et projection
│   └── interface/                   boucle p5, lobby, HUD, écrans, Labo, sons
├── tests/                           310 tests (node:test)
├── outils/ia · outils/video         entraînement, évaluation, enregistrement de la vidéo
└── docs/                            scénario et fabrication de la vidéo
```

## Les exemples du cours (par ordre)

| Dossier | Thème |
|---|---|
| [`1-Seek`](1-Seek/) | `seek` : se diriger vers une cible |
| [`2-PursueEvade`](2-PursueEvade/) · [`correction`](2-PursueEvade_correction/) | `pursue` et `evade` : anticiper la position future |
| [`3-Arrival`](3-Arrival/) · [`correction`](3-Arrival_correction/) | `arrive` : ralentir près de la cible |
| [`4-Wander`](4-Wander/) | `wander` : errer ; base du `Vehicle` utilisé dans LAST ZONE |
| [`5-1-ScalarProjection`](5-1-ScalarProjection/) · [`5-2-PathFollowing`](5-2-PathFollowing/) · [`5-3-PathFollowingComplex`](5-3-PathFollowingComplex/) | projection scalaire et suivi de chemin |
| [`6-ObstacleAvoidance`](6-ObstacleAvoidance/) | évitement d'obstacles |
| [`7-Boids`](7-Boids/) | séparation, alignement, cohésion |
| [`8-EvolutionarySteeringBehavior`](8-EvolutionarySteeringBehavior/) | algorithme génétique appliqué aux comportements |
| [`9-VoitureSuitCircuit genetic algo`](9-VoitureSuitCircuit%20genetic%20algo/) · [`9b`](9b%20-%20Voiture%20suit%20circuit%20version%202/) | voiture qui suit un circuit, évolution génétique |
| [`10-missiles genetic algo`](10-missiles%20genetic%20algo/) | missiles évolués génétiquement |
| **[`13-LastZone`](13-LastZone/)** | **mon projet** |

## Références

- Craig W. Reynolds, *Steering Behaviors for Autonomous Characters* (GDC 1999) — [`ARTICLE_CRAIG_REYNOLDS`](ARTICLE_CRAIG_REYNOLDS/).
- Règles de développement du dépôt : [AGENTS.md](AGENTS.md) et [ARCHITECTURE.md](ARCHITECTURE.md).
- Dépôt de l'enseignant (exemples de départ) : https://github.com/micbuffa/SteeringBehavioursM2IA2_Casa_2026_2027
