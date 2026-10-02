## Tests unitaires : Vitest

```bash
{{run}} test           # vitest run
{{run}} test:watch     # mode watch
{{run}} test:coverage  # couverture v8
```

- Vitest + Testing Library, `environment: "jsdom"`, `resolve.tsconfigPaths: true`. Globals
  désactivés : importer `describe/it/expect` depuis `vitest`, et `afterEach(cleanup)` explicite dans
  `{{src}}test/setup.ts`.
- Tests colocalisés (`foo.ts` → `foo.test.ts`), voir `include` dans `vitest.config.ts`.
- Logique métier en fonctions pures, testables sans monter de composant. Côté composants, requêter
  comme un utilisateur (`getByRole`, `getByLabelText`) plutôt que par classe ou test-id.
- Un bug corrigé = un test qui l'aurait attrapé.
