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
4. **Baseline avant la PR** (voir `.claude/kit/core.md`) : les étapes de la CI, e2e compris
   (`test:e2e:ci`). Si le diff ajoute ou modifie une spec e2e, la relancer seule sans réessai :
   `test:e2e:ci --repeat-each=3 --retries=0 <spec>` (un échec signale un test instable). Rouge →
   corriger d'abord, ne pas ouvrir la PR.
   **Accessibilité** (si `.claude/kit/a11y.md` existe et que le diff touche l'UI : `*.tsx`,
   `*.css`, contenus affichés) : lancer l'agent `a11y-reviewer` du plugin sur `origin/main...HEAD`.
   Un constat « bloquant » se corrige avant la PR ; les « majeurs » se corrigent ou deviennent une
   issue liée, à décider avec l'utilisateur. Une nouvelle page doit figurer dans `e2e/routes.ts`.
5. **PR** : `git push -u origin HEAD`, puis `gh pr create` avec le template du repo, un titre
   clair et `Closes #n` dans le corps. Donner le lien.
6. **Merge** (uniquement si `--merge` ou accord explicite, et CI verte : `gh pr checks`) :
   `gh pr merge --squash --delete-branch`, puis `git switch main && git pull`.
7. **Board** : les workflows intégrés (PR mergée, issue fermée) passent normalement la carte en
   « Terminé ». Vérifier (`gh project item-list <n> --owner <owner> --format json`) et ne lancer
   `node "$KIT/scripts/board.mjs" status <url-issue> done` que s'ils ne l'ont pas fait. Si c'est le
   cas, le signaler : un workflow du board est probablement désactivé.
8. **Suites** : ce qui a été repéré en route mais volontairement laissé de côté devient une issue,
   en « À faire » si c'est décidé, en « Backlog » (avec la raison de l'attente) sinon, via
   `/claude-kit:start-task --todo|--backlog`.
