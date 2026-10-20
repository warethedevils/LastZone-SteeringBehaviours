# Reprendre le projet sur un autre ordinateur

## 1. Récupérer le projet

```bash
git clone https://github.com/warethedevils/LastZone-SteeringBehaviours.git
cd LastZone-SteeringBehaviours/13-LastZone
npm test            # 311 tests, Node >= 20 requis, aucune installation de paquet
node serve.js       # puis http://localhost:8080
```

Le jeu en ligne : https://warethedevils.github.io/LastZone-SteeringBehaviours/

## 2. Reprendre avec un assistant IA (Claude Code)

Ouvrir le dossier `13-LastZone` dans Claude Code : il lit automatiquement `CLAUDE.md` (règles du projet, où est quoi,
pièges connus), puis `../AGENTS.md` et `../ARCHITECTURE.md`. Pour redonner le contexte à une nouvelle conversation :

> « Lis CLAUDE.md, README.md et docs/REPRISE.md, puis reprends là où on s'est arrêtés. »

La conversation elle-même ne se transfère pas ; tout ce qui compte est dans le dépôt (code, tests, documentation).

## 3. État du projet

Terminé : jeu complet (battle royale, véhicules, équipes, faune, vue 3D, Labo des comportements, onglet Cerveaux,
tutoriel, aide), 311 tests, jeu en ligne (GitHub Pages), vidéo de présentation (release `video-v1` du dépôt),
README détaillé, description YouTube (`docs/YOUTUBE.md`).

Reste à faire (côté étudiant) :
- mettre la vidéo sur YouTube, puis remplacer `À COMPLÉTER` par le lien (README racine et `13-LastZone/README.md`) ;
- écrire la section « 1. Pourquoi ce jeu ? » de « MON EXPÉRIENCE » et confirmer l'IDE ;
- envoyer le lien du dépôt au professeur.

Optionnel :
- ré-entraîner les bots : `node outils/ia/evoluer.js 40 48 3` (≈ 1 h, ordinateur libre). Le script ne fait **rien** avant la
  fin : il écrit alors `src/ia/cerveau_initial.js` (avec la courbe d'apprentissage). Comparer ensuite l'ancien et le
  nouveau champion avec `node outils/ia/evaluer.js 24 <fichier.js>` et garder le meilleur ;
- refaire la vidéo : `outils/video/` et `docs/VIDEO.md` (Chrome requis : WebCodecs ; la voix off utilise les voix Windows,
  `outils/video/voix.ps1`).

## 4. Ce qui ne se trouve PAS dans le dépôt

- Le dossier `13-LastZone/video/` (ignoré par git, trop lourd) : la vidéo finale est téléchargeable dans les releases du
  dépôt (`video-v1`).
- L'authentification GitHub : sur le nouvel ordinateur, se connecter avec le compte du dépôt
  (`git-credential-manager github login --browser`, ou GitHub Desktop / VS Code) avant de pousser.
- Un éventuel ré-entraînement en cours sur l'ancien ordinateur : s'il est éteint avant la fin, il est perdu.
