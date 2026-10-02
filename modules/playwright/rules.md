## Tests e2e : Playwright

```bash
{{run}} test:e2e       # playwright test (build de prod en CI, serveur de dev en local)
{{run}} test:e2e:ui    # mode UI interactif
```

- Specs dans `e2e/*.spec.ts`, réservées aux parcours utilisateur critiques : ce qui peut être testé
  en Vitest l'est en Vitest (plus rapide, plus stable).
- Chaque nouvelle page reçoit au minimum un check d'accessibilité axe (`@axe-core/playwright`, voir
  `e2e/smoke.spec.ts`) : zéro violation `serious`/`critical`.
- Sélecteurs par rôle ou label (`getByRole`), jamais par classe CSS. Pas de `waitForTimeout` :
  utiliser les assertions auto-retry (`await expect(...).toBeVisible()`).
- Premier lancement local : `{{run}} exec playwright install chromium`. Sous Linux/WSL, Chromium a
  aussi besoin de bibliothèques système, à installer une fois par machine par l'utilisateur
  (`sudo` demande son mot de passe, ne pas le lancer à sa place) :
  `sudo $(which node) node_modules/.bin/playwright install-deps chromium`. Symptôme si elles
  manquent : `error while loading shared libraries: libnspr4.so`.
