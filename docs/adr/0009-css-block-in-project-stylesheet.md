# 0009 — Bloc géré dans une feuille de style du projet

**Statut** : Acceptée (08/11/2026, #4). Complète l'ADR 0008 : le mécanisme de bloc, limité à
`.gitignore` et `CLAUDE.md`, s'étend aux fichiers `.css`.

## Contexte

La règle a11y annonce un anneau `:focus-visible` global, mais aucun module ne l'installait
(#4) : sans lui, un bouton ou un lien natif n'a que le contour par défaut recoloré en `ring` à 50 %,
soit environ 2,2:1, sous le 3:1 de WCAG 1.4.11.

`globals.css` est généré par shadcn, patché une fois à la création (`patches`, `when: fresh`), puis
appartient au projet. Le sync ne pouvait donc rien y écrire : un patch littéral n'a pas de base à
comparer, et un fichier `managed/` écraserait les tokens du projet.

## Décision

- Un module peut avoir un dossier `block/` (ou `block@a+b/`) : chaque fichier est le **corps d'un
  bloc** que le kit tient dans le fichier du même chemin, sans toucher au reste.
- Pour un `.css`, les marqueurs sont `/* >>> claude-kit */` et `/* <<< claude-kit */`. Le bloc suit la
  fusion à trois voies de l'ADR 0008 (base, projet, kit), comme celui de `.gitignore` : intact, il suit
  le kit ; modifié par le projet, il est signalé (`drifts`) ; supprimé, il n'est pas recréé.
- Le bloc est écrit **après** les commandes post-installation et les patches, pour atterrir dans le
  `globals.css` que shadcn a généré.
- Le fichier hôte appartient au projet : absent, il n'est jamais créé, l'absence est signalée
  (`missing`, cas `H1`).
- Premier usage : `modules/a11y/block@tailwind-shadcn/__src__/app/globals.css`, la règle
  `:where(a, button, input, textarea, select, summary, [tabindex="0"]):focus-visible` dans
  `@layer base`, avec `outline: 3px solid var(--ring)`. `:where()` garde une spécificité nulle : les
  composants shadcn la surchargent sans conflit.

## Conséquences

- Un projet existant reçoit l'anneau au prochain sync, sans action manuelle : `written` contient
  `globals.css` et la base, puis `written: []`.
- Le bloc est inséré en fin de fichier. Un projet qui veut un autre anneau le modifie dans le bloc
  (signalé à chaque sync) ou le supprime (jamais recréé).
- L'anneau dépend de `--ring` : le test des tokens (`design-tokens.a11y.test.ts`) garde son contraste
  contre `--background`.
- Le mécanisme sert à tout autre ajout CSS du kit, sans nouvelle règle de sync.
