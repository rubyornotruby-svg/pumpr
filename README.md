# Pumpr

Desk de trading personnel : journal de trades, calcul du risque, graphiques TradingView et cours crypto Binance en direct. Lecture seule : aucun courtier, aucun ordre.

Phase actuelle : **test gratuit réservé aux fondateurs** (20 places, inscription par formulaire Tally, avis à 7, 15 et 30 jours).

## Structure

| Chemin | Rôle |
|---|---|
| `index.html` | Site de présentation |
| `desk/` | Le desk : configuration « mon desk », engagement fondateur, puis le desk |
| `decouvrir.html` | Le desk en images |
| `mentions-legales.html` | Mentions légales, CGV (applicables à l'ouverture des ventes) et confidentialité, à compléter |
| `retractation.html` | Page de rétractation, en attente de l'ouverture des ventes |
| `assets/` | Styles, polices, traductions |
| `wrangler.jsonc`, `.assetsignore` | Déploiement sur Cloudflare |

## Fonctionnement

- Le journal et les réglages du desk restent dans le navigateur de l'utilisateur.
- Aucun compte n'est géré par Pumpr. La connexion par e-mail et code sera assurée par Cloudflare Access (liste des e-mails fondateurs réglée dans Cloudflare).
- Les avis passent par un formulaire Tally (`FEEDBACK_URL` dans `desk/gate.js`).

## Mettre en ligne

Chaque publication sur la branche `main` redéploie le site automatiquement via Cloudflare. Après un changement de CSS ou de JS, lancer `./bump-version.sh` pour forcer les navigateurs à recharger.

## Au lancement des ventes (plus tard)

Mettre `FOUNDER_PHASE = false` dans `desk/gate.js`, choisir un prestataire de paiement, compléter les passages jaunes des mentions légales et rouvrir la page de rétractation.
