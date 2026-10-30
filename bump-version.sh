#!/bin/sh
# Met à jour le numéro de version des fichiers CSS/JS pour forcer les navigateurs à recharger.
V=$(date +%Y%m%d%H%M)
for f in index.html desk/index.html admin/index.html retractation.html mentions-legales.html; do
  perl -pi -e "s#\?v=\d+\"#?v=$V\"#g" "$f"
done
echo "version $V"
