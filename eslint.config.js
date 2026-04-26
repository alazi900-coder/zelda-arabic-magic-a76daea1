import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        destructuredArrayIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],
    },
  },
  {
    // Control chars (\x00 etc.) are intentional placeholders in codec/parser/text-processing regexes
    files: [
      "src/lib/**/*.{ts,tsx}",
      "src/hooks/useEditorBuild.ts",
      "src/hooks/useEditorCleanup.ts",
      "src/components/editor/types.tsx",
      "src/components/editor/MirrorCharsCleanPanel.tsx",
      "src/pages/XenobladeProcess.tsx",
      "src/test/mirror-chars.test.ts",
      "supabase/functions/**/*.ts",
    ],
    rules: {
      "no-control-regex": "off",
    },
  },
);
