## Accessibilité (WCAG 2.2 AA, grille RGAA)

Cible : **WCAG 2.2 niveau AA**. Le RGAA 4.1.2 (méthode française, bâtie sur WCAG 2.1 AA) sert de
grille de lecture : citer le critère RGAA (ex. « RGAA 11.1 ») dans les issues, PR et commentaires
qui touchent à l'accessibilité. L'accessibilité fait partie de la définition de « terminé », au
même titre que les tests.

### Contrôles automatiques (ils ne couvrent qu'une partie des critères)

{{#if eslint}}- ESLint `jsx-a11y` en config strict : ne jamais désactiver une de ses règles pour passer le lint.
{{/if}}{{#if vitest}}- Vitest : `a11yViolations(container)` de `{{src}}test/a11y.ts` (axe-core, sans contraste ni
  mise en page, que jsdom ne calcule pas). Tout nouveau composant interactif reçoit un test
  `*.a11y.test.tsx` qui vérifie aussi son comportement clavier.
{{/if}}{{#if vitest+tailwind-shadcn}}- Contraste des tokens (`{{src}}test/design-tokens.a11y.test.ts`) : chaque couple `--x` /
  `--x-foreground` de `{{src}}app/globals.css`, en clair comme en sombre, doit atteindre 4.5:1. On
  corrige le token, pas le test.
{{/if}}{{#if playwright}}- Playwright (`e2e/a11y.spec.ts`) : axe WCAG 2.2 AA, reflow à 320 px, focus visible, `lang`,
  `<title>` et hiérarchie des titres, **pour chaque route de `e2e/routes.ts`**. Toute nouvelle page
  y est ajoutée dans la PR qui la crée.
{{/if}}

### À respecter en écrivant le code (ce que les outils ne voient pas)

- **Images (RGAA 1)** : `alt` qui transmet l'information utile ; `alt=""` si décorative ; jamais le
  nom du fichier ni « image de ». Les SVG informatifs ont `role="img"` + `aria-label`, les
  décoratifs `aria-hidden="true"`.
- **Couleurs (RGAA 3)** : l'information ne passe jamais par la couleur seule (erreur = texte +
  icône, lien = soulignement ou autre indice). Contraste 4.5:1 (texte), 3:1 (grand texte, bordures
  de champs, icônes, indicateur de focus). L'opacité appliquée par une classe échappe au test des
  tokens : un anneau `ring-ring/50` seul ne garantit pas 3:1, garder un indice opaque
  (`border-ring`, `outline`).
- **Scripts (RGAA 7)** : composant interactif = élément natif (`button`, `a`, `input`…) ou primitive
  Radix ; jamais de `div` cliquable. Changement de contenu important annoncé (`aria-live`, toast
  accessible). Modale : focus piégé dedans, rendu à l'élément d'origine à la fermeture, Échap ferme.
- **Structure (RGAA 8 et 9)** : un `<title>` unique et descriptif par page (`metadata`), `lang` sur
  `<html>`, un seul `h1`, titres sans saut de niveau, landmarks (`header`, `nav`, `main`, `footer`),
  listes en `ul`/`ol`.
- **Liens (RGAA 6)** : intitulé explicite hors contexte (pas de « cliquez ici », « en savoir plus »
  seul) ; lien icône = `aria-label` ; lien qui ouvre un nouvel onglet = le dire.
- **Formulaires (RGAA 11)** : chaque champ a un `label` visible et associé ; champs obligatoires
  indiqués autrement que par la couleur ; erreurs reliées par `aria-describedby` et
  `aria-invalid`, avec suggestion de correction ; `autocomplete` sur les champs personnels.
- **Navigation (RGAA 12)** : lien d'évitement vers `main` ; ordre de tabulation logique, pas de
  `tabindex` positif ; aucun piège clavier ; focus toujours visible (ne jamais `outline-none` sans
  alternative `focus-visible:`) ; cibles tactiles d'au moins 24×24 px (WCAG 2.5.8).
- **Consultation (RGAA 13)** : contenu lisible à 320 px de large et zoom 200 % sans perte ;
  animations désactivées sous `prefers-reduced-motion` (`motion-safe:`/`motion-reduce:`) ; rien
  qui clignote plus de 3 fois par seconde.

### Revue et audit

- Avant une PR qui touche l'UI, `/claude-kit:ship-task` fait relire le diff par l'agent
  `a11y-reviewer` : un constat « bloquant » se corrige avant d'ouvrir la PR.
- `/claude-kit:a11y-audit <route>` produit un rapport par thématique RGAA pour une page. Les
  critères qui demandent un lecteur d'écran (NVDA, VoiceOver) restent à vérifier par un humain :
  aucun rapport automatique ne vaut déclaration de conformité.
