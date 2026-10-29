# Pumpr

Desk de trading personnel vendu en paiement unique : journal de trades, calcul du risque, graphiques TradingView et cours crypto Binance en direct. Lecture seule : aucun courtier, aucun ordre.

## Structure

| Chemin | Rôle |
|---|---|
| `index.html` | Site de vente |
| `desk/` | Le desk : connexion, configuration « mon desk », puis le desk |
| `admin/` | Espace admin : acheteurs et accès, réglages du site de vente, utilisateurs du desk |
| `mentions-legales.html` | Modèle de mentions légales et CGV, à compléter |
| `config.js` | Clés Supabase (vides = mode démo) |
| `assets/pumpr.js` | Comptes, accès et réglages, partagés par les trois pages |
| `supabase/schema.sql` | Base de données et règles de sécurité |

## Parcours client

1. Achat sur le site de vente (lien d'achat réglé dans l'admin).
2. L'e-mail de l'acheteur est ajouté à la liste des accès (à la main dans l'admin pour l'instant, automatiquement plus tard via le prestataire de paiement).
3. L'acheteur ouvre `desk/` et crée son compte avec ce même e-mail. Un e-mail sans achat est refusé.
4. À la première connexion, il configure son desk : pseudo, niveau, marchés, risque, couleur, modules.

## Mode démo

Tant que `config.js` est vide, tout est simulé dans le navigateur (localStorage). Pratique pour tester, mais **pas sécurisé** : n'importe qui peut ouvrir l'admin. Ne pas ouvrir les ventes dans ce mode.

## Brancher Supabase (comptes sécurisés)

1. Créer un projet sur supabase.com (par un adulte, titulaire du projet).
2. SQL Editor → coller `supabase/schema.sql`, remplacer `ADMIN_EMAIL` par l'e-mail admin, puis Run.
3. Authentication → URL Configuration : mettre l'adresse du site dans « Site URL » et ajouter `…/desk/` dans « Redirect URLs ».
4. Project Settings → API : copier « Project URL » et la clé « anon public » dans `config.js`.
5. Créer le compte admin depuis `desk/` (onglet « Créer mon compte ») avec l'e-mail admin.

La sécurité repose sur les règles RLS de `schema.sql` : un utilisateur ne lit que son accès et son profil, seuls les admins voient et modifient la liste des acheteurs.

**Limite connue :** le code du desk est public sur GitHub Pages. La connexion protège les comptes et les données, pas le code lui-même. Étape suivante prévue : servir le desk depuis un stockage privé après connexion.

## Avertissement

Pumpr est un outil d'organisation et d'analyse. Ce n'est pas un conseil en investissement. Le trading comporte un risque élevé de perte en capital.
