## Hook pre-commit

Husky + lint-staged sur `pre-commit` ({{lintStagedTools}} sur les fichiers stagés uniquement).
**Jamais** les tests dans le hook : ça reste une responsabilité CI, pour un hook rapide. Ne jamais
contourner le hook (`--no-verify`), corriger ce qu'il signale. `.gitattributes` force LF sur
`.husky/*` (un checkout CRLF casse le hook silencieusement).
