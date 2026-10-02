---
name: ship-task
description: Termine une tâche selon le workflow GitHub du kit — baseline verte, commits par responsabilité, rebase sur main, PR liée à l'issue, puis après accord squash-merge, nettoyage des branches et board à jour. À utiliser quand l'utilisateur dit que c'est prêt, demande d'ouvrir la PR ou de merger.
argument-hint: "[--merge]"
---

# /claude-kit:ship-task

`KIT` = le répertoire de base de ce skill, remonté de deux niveaux (`<base>/../..`).

1. **Contexte** : branche courante `<prefix>/<n>-<slug>` → issue `#n`. Sur `main` : stop, rien à
   livrer.
2. **Commits** : chaque commit a une seule responsabilité. Si des changements sans rapport sont
   mélangés, proposer de les séparer (ou de les sortir dans une autre branche/issue). Si une
   dépendance ou une décision structurelle a changé, vérifier `docs/dependencies.md` et les ADR.
3. **À jour** : `git fetch origin && git rebase origin/main` (jamais de merge de `main`).
4. **Baseline** (voir `.claude/kit/core.md`) + `format:check`, et `test:e2e` si le parcours
   touché est couvert. Rouge → corriger d'abord, ne pas ouvrir la PR.
   **Accessibilité** (si `.claude/kit/a11y.md` existe et que le diff touche l'UI : `*.tsx`,
   `*.css`, contenus affichés) : lancer l'agent `a11y-reviewer` du plugin sur `origin/main...HEAD`.
   Un constat « bloquant » se corrige avant la PR ; les « majeurs » se corrigent ou deviennent une
   issue liée, à décider avec l'utilisateur. Une nouvelle page doit figurer dans `e2e/routes.ts`.
5. **PR** : `git push -u origin HEAD`, puis `gh pr create` avec le template du repo, un titre
   clair et `Closes #n` dans le corps. Donner le lien.
6. **Merge** (uniquement si `--merge` ou accord explicite, et CI verte : `gh pr checks`) :
   `gh pr merge --squash --delete-branch`, puis `git switch main && git pull`.
7. **Board** : `node "$KIT/scripts/board.mjs" status <url-issue> done` si les workflows intégrés
   du board ne l'ont pas déjà fait (vérifier avant avec `gh project item-list` si besoin).
