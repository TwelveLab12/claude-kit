# 0002 — Stratégie accessibilité

**Statut** : Acceptée

## Contexte

L'accessibilité coûte peu quand elle est tenue dès le départ et cher quand on la rattrape après coup
(lien d'évitement, landmarks, focus des menus, cibles tactiles, contrastes du design system…).
Aucun outil ne couvre seul le sujet : l'analyse statique ne voit pas le rendu, axe ne voit qu'une
partie des critères sur le rendu, et ni l'un ni l'autre ne remplace le clavier et le lecteur
d'écran.

## Décision

Cible : **WCAG 2.2 AA**, avec le **RGAA 4.1.2** comme grille de lecture (critères cités dans les
issues et les PR) jusqu'à la sortie du RGAA 5, aligné sur WCAG 2.2.

Trois couches, aucune suffisante seule :

1. **Lint** : preset `strict` d'`eslint-plugin-jsx-a11y`, en erreur, bloquant dans `lint:ci`.
2. **Rendu** : axe-core dans Vitest (composants) et dans Playwright (pages de `e2e/routes.ts`,
   reflow, focus visible, structure), plus le contraste des tokens du design system. Bloquant en
   CI dès le départ : un projet neuf n'a pas de dette à résorber.
3. **Manuel** : checklist de `docs/accessibility.md` (clavier, zoom, lecteur d'écran, contraste
   des SVG), et revue de chaque diff d'interface par l'agent `a11y-reviewer` avant la PR.

**Déclaration d'accessibilité** : _à trancher pour ce projet_. Elle n'est obligatoire que pour les
organismes publics, les entreprises au-delà de 250 M€ de chiffre d'affaires et les services visés
par la directive européenne Accessibilité (2025). Hors de ces cas, ne publier aucun niveau de
conformité sans audit formel (outil Ara de la DINUM ou équivalent) : un outil au vert n'est pas une
conformité.

## Conséquences

Chaque PR d'interface passe les trois couches ; une non-conformité trouvée à la main devient une
issue (type + label `accessibility`) et un « écart ouvert » de `docs/accessibility.md`. Revoir cette
décision à la sortie du RGAA 5, ou si le projet devient soumis à l'obligation légale.
