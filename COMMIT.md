# Pousser la v2.5 sur GitHub (https://github.com/Thomas-Ries/ma-cave)

Depuis le dossier décompressé du zip, sur ton PC :

```bash
cd ma-cave-vue

# 1) Premier push du projet (si le repo est vide)
git init
git branch -M main
git remote add origin https://github.com/Thomas-Ries/ma-cave.git

# 2) Commit
git add .
git commit -m "feat: en-têtes collants par région + synchro des listes vers Notion (v2.5)"

# 3) Push
git push -u origin main
```

Pour les mises à jour suivantes :

```bash
git add .
git commit -m "message court de la modif"
git push
```

Notes :
- `.gitignore` exclut `node_modules/` et `dist/` (build et dépendances ne partent pas sur GitHub).
- `npm install` + `npm run build` suffisent pour regénérer `dist/` depuis les sources.
