## UI : Tailwind v4 + shadcn/ui

- Design system en tokens Tailwind v4 `@theme` dans `{{src}}app/globals.css`, pas de
  `tailwind.config.js`. Pas de couleur ni d'espacement en dur quand un token existe.
- `{{src}}components/ui/` contient les primitives générées par le CLI shadcn sur **Radix UI**, jamais
  Base UI (le défaut actuel du CLI). Ajouter un composant : `{{run}} dlx shadcn@latest add <composant> -y`.
  Réinitialiser : `{{run}} dlx shadcn@latest init -b radix -p nova -y`. Vérifier ensuite que
  `package.json` liste `radix-ui` et pas `@base-ui/react`.
- On peut modifier un composant généré, mais dans un commit dédié pour garder la trace de l'écart
  avec la version shadcn.
