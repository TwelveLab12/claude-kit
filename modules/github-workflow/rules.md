## Workflow Git et GitHub

- **Toute tâche de dev, même petite, commence par une issue GitHub.** La créer si elle n'existe pas
  avant d'écrire du code, et la référencer dans la PR (`Closes #NN`). L'ajouter **immédiatement** au
  board {{#if boardNumber}}(project n°{{boardNumber}} de `{{owner}}`){{/if}} : une issue absente du
  board n'est pas suivie. `/claude-kit:start-task` fait tout ça en une fois (issue, labels, board,
  statut, branche).
- Chaque issue porte **exactement un** label de type, posé à la création : `bug` (comportement
  défectueux), `enhancement` (fonctionnalité ou amélioration UX), `documentation` (docs seules),
  `chore` (outillage/infra/maintenance sans impact fonctionnel direct).{{#if a11y}} Une issue qui
  touche l'accessibilité porte **en plus** (jamais à la place) le label thématique `accessibility`.{{/if}}
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

### Board

- **Un board par dépôt** : il ne suit que ce repo. Il est la référence de ce qui est fait et reste à
  faire : tenir le champ Status de chaque issue synchronisé, ne jamais le laisser dériver de la
  réalité.
- Colonnes : « {{statusBacklog}} » → « {{statusTodo}} » → « {{statusDoing}} » → « {{statusDone}} ».
- **« {{statusBacklog}} »** garde en mémoire, sans engagement, ce qui attend un prérequis, du temps
  ou une relecture critique. Rien n'y est en cours. Dire dans l'issue **pourquoi** elle attend,
  sinon le parking devient illisible, et la passer en « {{statusTodo}} » une fois la décision prise.
- Une nouvelle issue arrive en **« {{statusTodo}} »** par défaut : la ranger en « {{statusBacklog}} »
  est un acte délibéré, pour que le vrai travail ne s'y perde pas.
- Les workflows intégrés du board font le reste (PR liée → « {{statusDoing}} », PR mergée ou issue
  fermée → « {{statusDone}} ») : ne déplacer une carte à la main que s'ils ne l'ont pas fait.

### Retours vers le kit

Un problème qui vient peut-être de claude-kit se trie ainsi :

- un fichier ou une règle du kit contourné, ou un défaut qui se reproduit sur un projet généré →
  issue `bug` sur `TwelveLab12/claude-kit`, tout de suite : le prochain sync effacerait le
  contournement ;
- une cause extérieure et passagère (panne GitHub, miroir apt, registre npm) → relancer une fois.
  Si ça échoue encore, noter une occurrence sur le signalement de ce symptôme, ou le créer avec le
  [formulaire « Signalement »](https://github.com/TwelveLab12/claude-kit/issues/new?template=signalement.yml) ;
- un problème propre au projet → il reste dans le projet.
