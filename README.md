# 🏎️ F1 Cockpit — Race Analysis Dashboard

Dashboard d'analyse de courses F1 avec visualisation ERS sur circuit (2026 regs).

## Fonctionnalités

- **Circuit avec zones ERS** — Déploiement (bleu), Récolte (vert), Clipping (orange), Super Clipping (rouge), Lift & Coast (gris)
- **Mode "Par tour" / "Tous"** — Voir l'ERS tour par tour ou l'agrégé de toute la course
- **Replay tour par tour** — Slider + boutons ◀▶ + play automatique
- **Télémétrie** — Vitesse, throttle, frein, RPM, rapport, ERS estimé
- **Radio team** — Filtrable par pilote ET par tour, avec lecteur audio
- **Direction de course** — Drapeaux, Safety Car, pénalités
- **Stints pneus** — Compounds et âge des gommes
- **Support 2026** — Détection super clipping (recharge à plein gaz)

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
