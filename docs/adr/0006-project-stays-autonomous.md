# 0006 — Le projet reste autonome : le kit outille et alerte

**Statut** : Acceptée (14/10/2026, #25)

## Contexte

Le kit installe l'outillage d'un projet et le fait évoluer par sync. Rien ne disait ce qui doit
continuer à marcher sans le kit ni sans Claude. Deux constats du 14/10/2026 :

- Dependabot monte les actions de `ci.yml`, et le sync les ramène à la version du kit
  (`upload-artifact` v6 → v5 sur workout-manager). Retirer les actions de Dependabot rendrait le
  projet dépendant du sync pour sa propre CI.
- Les alertes Dependabot et les correctifs de sécurité automatiques étaient désactivés sur
  workout-manager et claude-kit : `dependabot.yml` ne règle que les mises à jour de version.

## Décision

- Un projet généré fonctionne comme un projet classique, sans le kit ni Claude : scripts de
  `package.json`, CI, hooks Git, Dependabot. Le kit est un confort pour la mise en place, la
  maintenance et les alertes.
- Une alerte importante (défaut que le développeur peut introduire, dépendance vulnérable, réglage
  manquant) existe sous une forme qui tourne sans IA : CI, hook pre-commit, test, rapport d'un
  script. Les règles Claude la complètent sans la remplacer.
- La mécanique du kit reste dans des scripts Node sans dépendance, lançables sans Claude. Les
  skills dialoguent et décident.
- Les versions appartiennent au projet après la création. Le kit écrit les versions courantes (npm
  en `@latest`, actions à leur dernière majeure), puis Dependabot les maintient. Un sync ne fait
  jamais redescendre une version, y compris celle d'une action dans un fichier managed.
- Dependabot est gardé pour npm et pour les actions. Les alertes et les correctifs de sécurité
  automatiques sont attendus sur chaque dépôt.
- Sans dogmatisme : une revue que seule l'IA fait bien (sens de l'accessibilité, tri des retours)
  reste un confort, pas un contrôle obligatoire.

## Conséquences

- #16 tranche la comparaison d'un fichier managed dont les versions ont bougé, et #17 la teste.
- #18 ajoute les réglages de sécurité Dependabot aux attentes du module `dependabot`.
- Ce qui n'existe aujourd'hui que pour Claude est à revoir sous cet angle : le signal d'une version
  plus récente du kit (hook de démarrage), les règles sans contrôle en CI (#9).
- Complète l'ADR 0003 : les versions des actions suivent la même règle que celles de npm.
- La vitesse des mises à jour dépend du rythme de merge des PR Dependabot : le kit peut le
  signaler, pas le remplacer.
