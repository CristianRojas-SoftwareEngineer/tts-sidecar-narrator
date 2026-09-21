// Configuración de ESLint (flat config). Cubre el código fuente TypeScript de
// src/ y tests/; el chequeo de tipos lo hace tsc (npm run typecheck), así que
// aquí se usa la config recomendada sin type-checking. eslint-config-prettier va
// al final para desactivar reglas de formato (Prettier es la autoridad de estilo).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "tests/.build/", "*.mjs"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
