# 0010 — Statut Vercel posé par le kit, indépendant des jobs du workflow

**Statut** : Acceptée (19/11/2026, #77)

## Contexte

Avec `vercel-check`, le job `build` de `ci.yml` publiait son état comme statut de commit avec
`vercel/repository-dispatch/actions/status@v1`. Vercel lit ce statut (Deployment Check, Settings ›
Deployment Checks) pour autoriser la mise en production. À son étape `post`, l'action liste les jobs
du run et juge le premier, sans comparer son nom. Une étape sans conclusion y compte comme réussie
(vercel/repository-dispatch#15, ouvert depuis le 12/02/2026).

Avec `a11yGate=advisory`, `ci.yml` contient aussi le job `a11y`. L'API renvoie les jobs par id, et
l'id est attribué à la création, sans lien avec l'ordre du fichier. Reproduit le 19/11/2026 sur un
projet généré (kit 0.11.0, dépôt jetable) : sur 10 tentatives d'un commit dont le typecheck échoue,
5 ont posé `success` en jugeant `a11y`. Le 18/11/2026, le même défaut a laissé Vercel promouvoir un
build en échec sur BrunoSchvartzDev (BrunoSchvartzDev#163).

Deux options : A, sortir le job consultatif dans son propre workflow (contournement appliqué par
BrunoSchvartzDev#164) ; B, remplacer l'action par des étapes de statut propres au kit.

## Décision

Option B. Le job `build` pose lui-même le statut, sans action tierce :

- **Première étape** : statut `pending`, avant le checkout.
- **Dernière étape**, `if: always()` : état du job lu dans `job.status`. `success` pose `success`,
  tout autre état (`failure`, `cancelled`) pose `failure`. Le job `build` ne juge que lui-même.
- Appel : `gh api repos/$GITHUB_REPOSITORY/statuses/$GITHUB_SHA` avec `GH_TOKEN: ${{ github.token }}`.
  `gh` est préinstallé sur les runners hébergés par GitHub. Le commit visé est celui qu'utilisait
  l'action : le commit poussé sur `main`, le commit de fusion de test sur une PR.
- **Permissions** du job `build` : `contents: read` et `statuses: write`. `actions: read`, qui
  servait à l'action pour lister les jobs, est retiré.
- **Nom du contexte** : inchangé, `vercelCheckName` (`Vercel - <projet>: ci`). Il est écrit une fois
  dans le job, et Vercel s'y fie tant qu'il est identique à celui de Settings › Deployment Checks.

B plutôt que A : B ne dépend ni du nombre de jobs du workflow, ni de la correction en amont. A
tiendrait seulement tant que personne n'ajoute de job à `ci.yml`, ni le kit ni un projet. B corrige
aussi deux défauts que A garde, lus dans le code de l'action : une étape sans conclusion comptée
comme réussie, et un job annulé (délai maximum atteint) rapporté `success`, puisque seule une étape
en `failure` fait échouer le statut.

## Conséquences

- **Migration** : `ci.yml` est managed. Un projet équipé de `vercel-check` (workout-manager,
  dnd-character-manager) reçoit les nouvelles étapes au sync, sans action manuelle si son `ci.yml`
  n'a pas été modifié ; sinon le sync le signale (`drifts`) et le changement se reporte à la main.
  Le contexte ne change pas : rien à toucher dans Vercel. Ces deux projets n'ont qu'un job dans
  `ci.yml` : ils n'étaient pas touchés par le défaut.
- BrunoSchvartzDev, qui n'est pas encore équipé, garde son contournement A jusqu'à son adoption
  (BrunoSchvartzDev#166) : le `ci.yml` du kit le remplacera, et son `a11y.yml` peut rester tel
  quel, car un autre workflow n'a pas d'effet sur le statut.
- Si le job s'arrête avant sa dernière étape, ou si l'appel échoue, le statut reste `pending` :
  Vercel bloque la mise en production au lieu de la laisser passer. Après un dépassement du délai
  maximum, l'exécution de l'étape `if: always()` est supposée, pas vérifiée ; si elle ne tourne
  pas, le statut reste `pending`.
- Une étape de moins à faire monter par Dependabot. En revanche, le format du statut dépend de nous :
  `gh` doit rester présent sur le runner, et une PR venue d'un fork, dont le jeton est en lecture
  seule, ne peut pas poser de statut. C'était déjà le cas avec l'action.
- Le canary ne lance pas le `ci.yml` généré sur GitHub et ne voit donc aucun statut. Les tests
  rapides vérifient le rendu : instantané, étapes de statut et correspondance entre l'état du job
  et le statut posé. Le comportement réel a été prouvé une fois, sur un dépôt jetable (#77).
