# Chat4Lead — Tests Manuels

## En ligne (Vercel)

Les pages sont servies depuis le même déploiement que l'API :

- **Hub** : https://chat4-lead-backend.vercel.app/
- **Dashboard** : https://chat4-lead-backend.vercel.app/tests/reports/dashboard-synthese.html
- **Phase 1** : https://chat4-lead-backend.vercel.app/tests/phase1.html
- **Phase 2** : https://chat4-lead-backend.vercel.app/tests/phase2.html
- **Phase 3** : https://chat4-lead-backend.vercel.app/tests/phase3.html

---

## En local

Quand le backend Vercel est indisponible, lancez tout en local.

### 1. Lancer le backend

```bash
cd backend
npm install
npm run dev
```

Le serveur démarre sur **http://localhost:3000**.

### 2. Ouvrir les pages de test

- **Hub** : http://localhost:3000/tests/index.html
- **Dashboard** : http://localhost:3000/tests/reports/dashboard-synthese.html
- **Phase 1** : http://localhost:3000/tests/phase1.html
- **Phase 2** : http://localhost:3000/tests/phase2.html
- **Phase 3** : http://localhost:3000/tests/phase3.html

Les pages détectent automatiquement l'origine (`localhost:3000`) et appellent l'API locale.

### 3. Option : paramètre `?backend=`

Si vous ouvrez les pages depuis un autre domaine mais voulez cibler votre backend local :

- `.../dashboard-synthese.html?backend=http://localhost:3000`
- `.../phase1.html?backend=http://localhost:3000`
- etc.

Les liens entre les pages propagent ce paramètre pour garder le même backend.
