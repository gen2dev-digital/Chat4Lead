# Variable Redis pour Vercel

## Nom de la variable

```
REDIS_URL
```

## Valeur (format Upstash)

1. Crée un compte gratuit sur [console.upstash.com](https://console.upstash.com)
2. Crée une base Redis (gratuit)
3. Dans la console, onglet **Connect** → **Node** → copie l’URL

Format attendu :
```
rediss://:TON_MOT_DE_PASSE@ton-endpoint.upstash.io:6379
```

> **Important** : Upstash utilise `rediss://` (avec TLS). Le mot de passe est visible dans la console Upstash.

## Où l’ajouter dans Vercel

1. Projet Vercel → **Settings** → **Environment Variables**
2. Ajouter :
   - **Name** : `REDIS_URL`
   - **Value** : ton URL complète (ex. `rediss://:xxx@xxx.upstash.io:6379`)
   - **Environments** : Production, Preview, Development

3. Redéployer le projet pour appliquer la variable.
