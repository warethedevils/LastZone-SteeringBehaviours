# Scénario de la vidéo YouTube (1 min 45)

Objectif : montrer en moins de deux minutes **le jeu, les comportements de steering et ce qui le rend unique**.
Enregistre l'écran (OBS, ou Win + G sous Windows), micro actif, jeu en plein écran, vue 3D (touche V) pour les plans « action ».
Avant de filmer : onglet *Cerveaux* → rien à régler ; lance une partie en **Duos** pour montrer l'équipe.

| Temps | À l'écran | Ce que tu dis (adapte avec tes mots) |
|---|---|---|
| 0:00 – 0:10 | Lobby, puis clic sur JOUER | « LAST ZONE est un battle royale où tous les mouvements sont des steering behaviors : chaque joueur, chaque animal, chaque projectile est un Vehicle. » |
| 0:10 – 0:25 | Bus, saut (vue de dessus), chute, atterrissage, passage en vue 3D | « Je choisis où atterrir, puis je passe en vue 3D à la première personne. » |
| 0:25 – 0:40 | Ramasser une arme, tirer sur un bot, un bot qui esquive les balles | « Les bots esquivent avec *sidestep*, visent à l'interception avec *leadPoint*, évitent les obstacles avec *avoid*. » |
| 0:40 – 0:55 | Cerfs en harde qui fuient, corbeaux qui tournent au-dessus d'un combat, loup qui poursuit | « La faune : les cerfs fuient en *evade*, les corbeaux volent en boids et encerclent les combats — on les voit sur la minimap — et le loup poursuit en *pursue*, mais il se fatigue. » |
| 0:55 – 1:10 | Duos : touche T (suivez-moi, tenez la position, à l'attaque), les coéquipiers en formation, relever un coéquipier (maintenir E), monter dans un quad | « En équipe, mes coéquipiers obéissent avec des boids : cohésion, alignement, séparation. » |
| 1:10 – 1:30 | Touche C : Labo des comportements, flèches de force, baisser le poids d'un comportement, « Appliquer à tous », sauver dans un emplacement | « Le BehaviorManager est visible : chaque flèche est un comportement de base, je règle les poids en direct, j'active ou désactive, je sauvegarde un comportement complexe. » |
| 1:30 – 1:45 | Onglet *Cerveaux* : courbe d'apprentissage, champion, bouton *Défier le champion* | « Chaque bot a un réseau de neurones qui choisit son comportement, entraîné par imitation puis par neuroévolution : la courbe montre qu'il bat les bots à règles. Merci ! » |

## Conseils

- 1 min 30 à 2 min maximum (consigne du cours) ; coupe les temps morts.
- Montre le lien du jeu (GitHub Pages) et du dépôt à la fin, ou dans la description.
- Description YouTube : IDE utilisé (Claude Code dans l'application Claude), modèle (Claude Sonnet 5.5), lien du jeu, lien du dépôt.
- Mets le lien de la vidéo dans le README (`À COMPLÉTER`), puis envoie le dépôt au prof par mail.

## Vidéo déjà enregistrée

> **Quel fichier ouvrir ?** `video/VIDEO-FINALE-LAST-ZONE.mp4` (en local) ou le lien de téléchargement ci-dessous : image, sous-titres, voix off et écran de fin, **sans filigrane**.

**Fichier prêt à publier sur YouTube** : https://github.com/warethedevils/LastZone-SteeringBehaviours/releases/download/video-v1/LAST-ZONE-presentation.mp4 (2 min 03 : visite guidée avec voix off française, sous-titres, titre d'ouverture et écran de fin avec les liens ; la voix est celle de Windows — tu peux la remplacer par la tienne).

Une visite guidée complète est générée automatiquement par le jeu lui-même (le « joueur » est piloté par l'IA, la mise en scène et les sous-titres sont dans `outils/video/video.js`) : lobby, **menu d'aide**, bus, vue 3D, combat, faune, ordres d'escouade et réanimation, véhicule, Labo des comportements, onglet Cerveaux.

```bash
node serve.js
# ouvrir http://localhost:8080/?video puis, dans la console du navigateur (F12) :
#   Video.start()
# ~2 minutes plus tard : video/last-zone-presentation.webm
```

- La voix off est générée par `outils/video/voix.ps1` (voix française hors ligne de Windows, textes dans `outils/video/narration.json`, un segment .wav par scène dans `video/brut/voix/`). **Le jeu la joue lui-même pendant l'enregistrement** (une voix à la fois, la suivante attend si la scène précédente déborde) : image, sous-titres, titre, voix et écran de fin sortent donc dans un seul fichier, sans montage externe. `outils/video/mixer-voix.js` permet, si besoin, de produire une piste voix alignée pour un éditeur externe. Pour mettre **ta** voix, utilise le tableau ci-dessus avec n'importe quel éditeur (Clipchamp, DaVinci Resolve…).
- Format .webm : YouTube l'accepte directement.
- Le dossier `video/` est ignoré par git (fichier trop lourd) : la vidéo vit sur YouTube.
