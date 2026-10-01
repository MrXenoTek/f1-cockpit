# 🏎️ F1 Cockpit — Race Analysis Dashboard

Dashboard d'analyse de courses F1 avec visualisation ERS sur circuit (2026 regs).

## Fonctionnalités

- **Circuit avec zones ERS** — Déploiement (bleu), Récolte (vert), Clipping (ambre), Super Clipping (violet), Lift & Coast (gris pointillé)
- **Mode "Par tour" / "Tous"** — Voir l'ERS tour par tour ou l'agrégé de toute la course
- **Replay tour par tour** — Slider + boutons ◀▶ + play automatique
- **Télémétrie** — Vitesse, throttle, frein, RPM, rapport, ERS estimé
- **Radio team** — Filtrable par pilote ET par tour, avec lecteur audio
- **Direction de course** — Drapeaux, Safety Car, pénalités
- **Stints pneus** — Compounds et âge des gommes
- **Alignement par distance** — Les deux pilotes sont comparés au même endroit de la piste (calage sur la ligne et les secteurs chronométrés), d'où un vrai delta de vitesse, un écart de temps A−B, des vitesses de virage et des marqueurs de secteur cohérents. Repli sur l'alignement par fraction de tour si le tour n'a pas de temps de secteur (tour en cours).
- **Analyse d'incident** — Pour chaque drapeau jaune / double jaune : vitesse, accélérateur et frein de plusieurs pilotes sur le même axe de *distance* (pas de fraction de tour), zone sélectionnable à la souris, comparaison au meilleur tour de chaque pilote. Les courbes sont interpolées entre des mesures à ~3,7 Hz (limite de la source) ; les points mesurés sont affichables.
- **Support 2026** — Détection super clipping (recharge à plein gaz)

## Tests

```bash
npm test   # maths de reconstruction de télémétrie (node:test, sans dépendance)
```

Les sessions terminées sont mises en cache dans IndexedDB (rechargement instantané) ; les appels OpenF1 sont limités à 3 en parallèle.

## Lancement

```bash
cd f1-cockpit
npm install
npm run dev
```

→ http://localhost:3000

## Build & déploiement

```bash
npm run build    # génère dist/
npx vercel       # déploie sur Vercel (gratuit)
```

## Stack

React 18 • Vite 5 • Recharts • OpenF1 API (gratuit, sans clé)
