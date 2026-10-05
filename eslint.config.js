import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", ".aws-sam/", "node_modules/", ".kiro/", "coverage/"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // コーディング規約: any は禁止、enum は使わない
      "@typescript-eslint/no-explicit-any": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "TSEnumDeclaration", message: "Use an `as const` object instead of enum." },
      ],
    },
  },
);
