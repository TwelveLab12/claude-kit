---
name: a11y-audit
description: Audit d'accessibilité d'une page selon la grille RGAA 4.1.2 / WCAG 2.2 AA — tests automatiques, parcours clavier, arbre d'accessibilité, puis revue critère par critère, avec un rapport par thématique RGAA et, en option, une déclaration d'accessibilité. À utiliser quand l'utilisateur demande un audit, une vérification RGAA/WCAG d'une page, ou de préparer une déclaration d'accessibilité.
argument-hint: "<route ou URL> [--declaration]"
---

# /claude-kit:a11y-audit

`KIT` = le répertoire de base de ce skill, remonté de deux niveaux (`<base>/../..`).

Honnêteté d'abord : ce skill **ne délivre pas de conformité RGAA**. Un taux de conformité officiel
suppose un audit complet sur un échantillon représentatif de pages, avec des tests au lecteur
d'écran (NVDA + Firefox, VoiceOver + Safari). Le rapport doit toujours le rappeler et lister ce qui
reste à vérifier par un humain.

## 1. Préparer

- Cible : une route (`/contact`) → `http://localhost:3000/contact`, ou une URL complète. Plusieurs
  routes : répéter les étapes 2 à 4 pour chacune, puis un seul rapport.
- La page doit être servie : si rien n'écoute sur le port, lancer `pnpm dev` en arrière-plan (ou
  `pnpm build && pnpm start` pour auditer le rendu de production).
- Prérequis : module `playwright` du kit (sinon, proposer `/claude-kit:sync +playwright`).

## 2. Extraire

Depuis la racine du projet :
`node "$KIT/scripts/a11y-snapshot.mjs" <url> --out <tmp>/a11y-<slug>.json`

Le JSON contient : violations axe WCAG 2.2 AA (bureau et 320 px) **et** les résultats `incomplete`
(ce qu'axe n'a pas pu trancher : à juger toi-même), titre, langue, titres, images, liens, boutons,
champs de formulaire avec labels et descriptions, `tabindex` positifs, ordre de tabulation avec
visibilité du focus et taille des cibles, débordement à 320 px, animations actives sous
`prefers-reduced-motion`, et l'arbre d'accessibilité (ce que perçoit un lecteur d'écran).

Si le navigateur intégré de la session est disponible, l'utiliser en complément pour **voir** la
page (capture) : utile pour les critères visuels (couleur seule, texte dans une image, ordre
visuel vs ordre du DOM, focus peu contrasté).

## 3. Juger, thématique par thématique

Pour chaque thématique RGAA, statuer : **C** (conforme), **NC** (non conforme, avec preuve),
**NA** (non applicable), **À vérifier** (nécessite un humain ou un lecteur d'écran).

1. Images : chaque `alt` est-il pertinent au regard de l'image et du contexte ? Décoratives
   ignorées ?
2. Cadres : `iframe` avec `title` pertinent.
3. Couleurs : info par la couleur seule ? Contrastes (violations axe + `incomplete`), focus.
4. Multimédia : sous-titres, transcription, contrôle de la lecture.
5. Tableaux : données vs mise en forme, en-têtes, `caption`.
6. Liens : intitulés explicites hors contexte (liste `links`), liens identiques vers des cibles
   différentes.
7. Scripts : composants personnalisés utilisables au clavier et correctement restitués (arbre
   d'accessibilité), messages de statut.
8. Éléments obligatoires : `lang`, `title` pertinent, code valide.
9. Structuration : titres (liste `headings`), landmarks et listes dans l'arbre d'accessibilité.
10. Présentation : reflow 320 px, ordre de lecture, focus visible (`tabOrder`), contenus cachés.
11. Formulaires : labels, regroupements, obligatoires, erreurs, `autocomplete`.
12. Navigation : lien d'évitement, ordre de tabulation logique, pièges, cibles ≥ 24×24 px.
13. Consultation : limites de temps, animations et `prefers-reduced-motion`, contenus au survol,
    documents téléchargeables.

Ne statue « C » que sur preuve. Toute violation axe est une NC, rattachée au critère RGAA
correspondant.

## 4. Rapport

Écrire `docs/a11y/audit-<AAAA-MM-JJ>-<slug>.md` (demander avant de créer le dossier si le projet
n'a pas de `docs/`) :

- En-tête : page(s), date, référentiel (RGAA 4.1.2 / WCAG 2.2 AA), méthode (outils + revue), et
  la mention que ce n'est pas un audit de conformité complet.
- Tableau de synthèse par thématique (C / NC / NA / À vérifier).
- Non-conformités triées par gravité (bloquant, majeur, mineur) : critère RGAA + WCAG, élément
  (sélecteur ou `fichier:ligne` quand tu retrouves la source), impact utilisateur, correction.
- « À vérifier par un humain » : liste précise (ex. « annonce du toast au lecteur d'écran »).

Puis proposer : une issue par non-conformité bloquante ou majeure (label `bug`, critère RGAA dans
le titre), via `/claude-kit:start-task` si l'utilisateur veut les traiter, et l'ajout des routes
auditées à `e2e/routes.ts` si elles n'y sont pas.

## 5. Déclaration d'accessibilité (`--declaration`)

Générer `docs/a11y/declaration.md` sur le modèle RGAA : entité, site, état de conformité
(« non conforme » tant qu'aucun audit complet n'a été fait, jamais « totalement conforme » sur la
base de ce skill), résultats, contenus non accessibles, dérogations, établissement de la
déclaration (date, technologies, outils, pages), retour d'information et contact, voies de
recours. Laisser en évidence les champs que seul l'utilisateur peut remplir (entité, contact).
