# Lancer les tests en local (alternative au backend Vercel)

Quand le backend Vercel est indisponible, vous pouvez tout faire fonctionner en local.

## 1. Lancer le backend

```bash
cd backend
npm install
npm run dev
```

Le serveur démarre sur **http://localhost:3000**.

## 2. Ouvrir les pages de test

Dans votre navigateur :

- **Dashboard** : http://localhost:3000/tests/reports/dashboard-synthese.html
- **Phase 1** : http://localhost:3000/tests/phase1.html
- **Phase 2** : http://localhost:3000/tests/phase2.html
- **Phase 3** : http://localhost:3000/tests/phase3.html

Les pages détectent automatiquement l'origine (`localhost:3000`) et appellent l'API locale.

## 3. Option : paramètre `?backend=`

Si vous ouvrez les pages depuis un autre domaine (ex. Vercel) mais voulez cibler votre backend local :

- `.../dashboard-synthese.html?backend=http://localhost:3000`
- `.../phase1.html?backend=http://localhost:3000`
- etc.

Les liens entre les pages propagent ce paramètre pour garder le même backend.
