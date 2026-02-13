import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config({ ignores: ["dist/", "test/", "eslint.config.mjs", "node_modules/"] }, eslint.configs.recommended, ...tseslint.configs.recommended, {
    files: ["src/**/*.ts"],
    languageOptions: {
        parserOptions: { projectService: true },
        globals: {
            Buffer: "readonly",
            console: "readonly",
            setTimeout: "readonly",
        },
    },
    rules: {
        "@typescript-eslint/no-empty-function": "off",
        "@typescript-eslint/no-empty-object-type": "off",
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-namespace": "off",
        "@typescript-eslint/no-unused-vars": "off",
        "no-empty": "warn",
        "no-redeclare": "warn",
        "prefer-const": "warn",
        "array-bracket-spacing": ["error", "never"],
    },
});
