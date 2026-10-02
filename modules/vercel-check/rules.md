## Vercel

La CI rapporte son statut à Vercel comme Deployment Check nommé `{{vercelCheckName}}`, qui bloque la
promotion en production. Ce nom doit rester synchronisé avec celui sélectionné dans Vercel (Settings
› Deployment Checks), qui vit hors du repo : ne pas renommer le step sans mettre Vercel à jour.
