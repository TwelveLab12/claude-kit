## Prettier

```bash
{{run}} format        # prettier --write .
{{run}} format:check  # prettier --check . (lancé en CI)
```

`printWidth: 100`, doubles guillemets{{#if tailwind-shadcn}}, `prettier-plugin-tailwindcss` (tri
automatique des classes Tailwind : ne pas réordonner les classes à la main){{/if}}.
