# 0012 — Conventions de code : un fichier par contexte, taille contrôlée sur le diff

**Statut** : Acceptée (27/11/2026, #74). Les décisions ont été validées le 17/11/2026 dans le suivi
du chantier (#72).

## Contexte

Dans les deux projets qui utilisent le kit, les fichiers d'interface grossissent sans aucune règle
de découpage. Rien ne dit non plus où ranger les types ni comment réutiliser les styles. Les
constats sont détaillés dans #72. Ils ont été relevés le 17/11/2026, en lignes brutes :

- **workout-manager** : un écran fait 1232 lignes, dont environ 1050 dans un seul composant qui
  mêle 11 contextes. Il est touché par 39 % des commits de `main`, et sept autres fichiers
  dépassent 300 lignes.
- **dnd-character-manager** : 18 fichiers dépassent 300 lignes, surtout parce que plusieurs
  sous-composants sont écrits dans un même fichier.
- **Types** : ils sont placés chez leur propriétaire, mais des formes recopiées ne sont pas
  nommées. Rien ne garantit qu'un `switch` traite tous les cas, car `noImplicitReturns` est absent
  du tsconfig du kit.
- **Styles** : les primitives shadcn sont contournées par des surcharges `className` répétées. Les
  valeurs arbitraires abondent, et des classes conditionnelles sont écrites en template literal.

Le kit n'a aucune règle de structure.

- Une règle ESLint `max-lines` casserait les deux projets, parce que `lint:ci` lance
  `eslint . --max-warnings=0` sur tout le dépôt.
- Aucun contrôle de projet ne regarde le diff. Seul le kit en a un, pour lui-même :
  `check-release.mjs` (ADR 0005).
- Claude imite le code voisin : un point chaud laissé tel quel continue d'engendrer le même style.
  Une règle écrite pour Claude seul ne suffit donc pas (ADR 0006). Un plafond appliqué d'un coup à
  tout le dépôt demanderait, lui, un refactor géant.
- Une règle du kit doit tenir sur tous les projets : Base UI ou Radix (ADR 0004), avec ou sans
  React Compiler.

## Décision

### Découpage par contexte

- Un fichier correspond à un contexte, qu'on peut nommer en une phrase sans « et ».
- On extrait dans cet ordre :
  1. une règle métier devient une fonction pure ;
  2. un bloc de JSX qui a un nom devient un composant ;
  3. l'état, les effets et les handlers d'un même contexte deviennent un hook `use-<contexte>.ts`.
- Pas de hook miroir d'un écran, ni de hook pour un composant de présentation. La paire
  `foo.tsx` + `use-foo.ts` ne vaut que pour un composant qui n'a qu'un contexte.
- La règle s'applique aux fichiers créés et à ce qu'on ajoute aux fichiers existants. Un point
  chaud se découpe dans une issue dédiée, pas au passage d'une autre tâche.

### Types

- Chaque type vit chez son propriétaire : le modèle dans le domaine, le port à côté de son
  implémentation, les props au-dessus du composant, le contrat d'un hook exporté par le hook.
- On n'utilise ni `src/types/` global ni `foo.types.ts`. Un `types.ts` de feature n'existe que pour
  un type partagé qui n'a pas de propriétaire.
- Une forme d'objet écrite deux fois devient un type nommé. Pour le code, l'abstraction attend la
  troisième occurrence.
- tsconfig :
  - `noImplicitReturns` est ajouté ;
  - `erasableSyntaxOnly` est remis à plus tard ;
  - `exactOptionalPropertyTypes` et `noImplicitOverride` sont écartés.

### Styles

- Une surcharge répétée d'une primitive de `ui/` devient une variante cva de cette primitive. Les
  primitives des deux bibliothèques sont écrites en cva. Vérifié le 27/11/2026 sur `button.tsx` :
  Base UI dans workout-manager, Radix dans dnd-character-manager.
- Un petit composant n'est créé qu'à partir de 3 occurrences d'un même motif. Une constante de
  classes n'est admise que pendant une transition.
- Pas de CSS-in-JS, pas de CSS modules. `@utility` est réservé aux utilitaires. Le CSS que le kit
  ajoute à un projet passe par un bloc géré (ADR 0009).
- Ce qui dépend du projet reste dans le projet. Par exemple, la cible tactile de 44 px (WCAG 2.5.5,
  niveau AAA) est un choix de workout-manager, pas une règle du kit.

### Contrôle déterministe d'abord, règles Claude en complément

Conformément à l'ADR 0006, ce qui peut se vérifier sans IA l'est en CI. Les règles Claude ne
couvrent que le jugement.

| Ce qu'on vérifie | Comment | Ticket |
| --- | --- | --- |
| Taille des fichiers | `check:structure`, sur le diff | #75 |
| Exhaustivité d'un `switch` | `noImplicitReturns`, au `typecheck` | #76 |
| Ordre des classes | Prettier, en place depuis 0.13.0 | #73 |
| Contexte, duplication, placement des types, usage des primitives | Règles Claude | #75, #76 |

Le kit n'ajoute pas d'agent relecteur dédié : `/simplify` relit un diff à la demande.

### Contrôle de taille sur le diff

- Le contrôle compte les lignes de code d'un `.ts` ou d'un `.tsx`, hors lignes vides et lignes de
  commentaire. Les commentaires sont exclus pour ne pas pousser à les supprimer.
- Il ne regarde que les fichiers ajoutés ou modifiés depuis la base de la branche, comme
  `check-release.mjs` (ADR 0005). Pour un seuil N :
  - un fichier neuf compte au plus N lignes ;
  - un fichier qui dépassait déjà N lignes dans la base ne grossit pas ;
  - un autre fichier existant reste à N lignes au plus.
- Aucune tolérance.
- **N vaut 300 au départ.** C'est une constante du script, la même pour tous les projets.
  - Le pilote TwelveLab12/workout-manager#208 rend compte du seuil sur #75. #75 confirme ou corrige
    la valeur avant la sortie du module.
  - Changer ensuite la valeur est une version du kit, annoncée au CHANGELOG, sans nouvel ADR.
  - Changer le principe demande un nouvel ADR : tolérance, comptage des commentaires, liste des cas.
- Le script est un fichier géré par le kit (`managed/`, ADR 0002) et tourne en Node sans
  dépendance. Sa conception relève de #75 : exclusions, intégration à la CI et à la baseline.

### Alternatives écartées

| Alternative | Raison |
| --- | --- |
| `max-lines` + suppressions ESLint en masse | Un fichier hérité grossit sans limite |
| Plafond par fichier dans `eslint.config.mjs` | Liste tenue à la main ; le seed modifié revient en proposition à chaque sync |
| Seuil propre à chaque projet (variable du lock) | Un seul seuil a été validé ; à rouvrir si le pilote ou un deuxième projet le demande |
| Seuil laissé à #75, ou ADR écrit après le pilote | Un ADR sans valeur ne fixe rien, et attendre le pilote bloquerait #76 |
| Paire `foo.tsx` + `use-foo.ts` systématique | Le hook miroir déplace la complexité sans la réduire |
| `src/types/` global, `foo.types.ts` | Les types s'éloignent de leur usage, et les doublons divergent |
| CSS-in-JS, CSS modules, `@apply` pour un composant | Deuxième système à côté de Tailwind ; déconseillé par Tailwind ; styled-components en maintenance |
| Identifiants « marqués », `exactOptionalPropertyTypes` | Coût élevé (casts aux frontières, 70 à 120 erreurs mesurées le 17/11/2026) pour un gain modéré |
| `max-lines-per-function`, `complexity` | Le JSX les fait sonner |
| `no-nested-ternary` | Reste une règle Claude |
| `no-restricted-imports` sur le domaine | Utile, mais orthogonal au chantier : à rouvrir à part |

## Conséquences

- #75 livre le module `structure` et `check:structure`. #76 livre `noImplicitReturns` et les règles
  de types (`core`) et de styles (`tailwind-shadcn`). Chacun monte la version du kit.
- `check-structure.mjs` sera le premier script que le kit copie dans un projet : aucun `.mjs`
  n'existe sous un `managed/` (vérifié le 27/11/2026). Il tourne sans le kit ni Claude (ADR 0006).
- Un projet qui veut un autre seuil modifie un fichier managed. Le sync le signale alors comme écart
  à chaque passage (cas F4 de l'ADR 0008), jusqu'à ce qu'on tranche. Le projet peut aussi retirer
  le module.
- Le contrôle compare `HEAD` à la base de la branche : la CI du projet doit récupérer l'historique
  de cette base. La profondeur nécessaire est à vérifier dans #75.
- `tsconfig.json` est un seed (ADR 0008). Intact, il reçoit `noImplicitReturns` au sync (cas F3).
  Modifié par le projet, il reçoit une proposition (cas F5). Le CHANGELOG de #76 doit le dire.
- Un fichier hérité au-dessus du seuil n'est pas bloqué, mais il ne grossit plus : une nouvelle
  fonctionnalité oblige à extraire. Les points chauds se découpent dans des issues dédiées, en
  commençant par le pilote TwelveLab12/workout-manager#208. dnd-character-manager suit dans
  TwelveLab12/dnd-character-manager#197.
- Le plafond est un filet, pas un objectif : il peut pousser à un découpage artificiel. La règle de
  contexte dit où couper ; le contrôle dit seulement quand.
- Le comptage des lignes est une heuristique, documentée et testée dans #75.
- Les règles de jugement (contexte, duplication, types, styles) ne sont vérifiées que par Claude.
  Sans Claude, un projet n'a que les trois contrôles déterministes, ce que l'ADR 0006 admet.
