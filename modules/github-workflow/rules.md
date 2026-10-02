## Workflow Git et GitHub

- **Toute tâche de dev, même petite, commence par une issue GitHub.** La créer si elle n'existe pas
  avant d'écrire du code, et la référencer dans la PR (`Closes #NN`). L'ajouter **immédiatement** au
  board {{#if boardNumber}}(project n°{{boardNumber}} de `{{owner}}`){{/if}} : une issue absente du
  board n'est pas suivie. `/claude-kit:start-task` fait tout ça en une fois (issue, label, board,
  statut « {{statusDoing}} », branche).
- Chaque issue porte **exactement un** label de type, posé à la création : `bug` (comportement
  défectueux), `enhancement` (fonctionnalité ou amélioration UX), `documentation` (docs seules),
  `chore` (outillage/infra/maintenance sans impact fonctionnel direct).
- **Une branche + une PR par sujet.** Ne pas empiler un changement sans rapport sur une branche qui a
  déjà une PR ouverte : repartir de `main`. Nommage : `<type>/<n°issue>-<slug>` (`feat/`, `fix/`,
  `docs/`, `chore/`).
- Garder la branche à jour par `git fetch origin && git rebase origin/main`, jamais en mergeant
  `main` dedans.
- Dans une PR, séparer les changements sans rapport en commits distincts, chacun avec une seule
  responsabilité (lisibilité de la review ; le squash les aplatit ensuite sur `main`).
- **Merge en squash** (`gh pr merge --squash --delete-branch`), jamais de merge commit, pour que
  `main` reste linéaire (un commit par PR). Supprimer les branches locale et distante après merge.
  `/claude-kit:ship-task` enchaîne vérifications, PR et mise à jour du board.
- Le board est la référence de ce qui est fait et reste à faire : tenir le champ Status de chaque
  issue synchronisé (« {{statusTodo}} » → « {{statusDoing}} » → « {{statusDone}} »), ne jamais le
  laisser dériver de la réalité.
