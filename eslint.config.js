// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: ['dist/**', 'node_modules/**', 'public/vendor/**'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.worker, ...globals.node },
            parserOptions: {
                // Type-aware linting (no-floating-promises, no-misused-promises, …)
                // across every src/ file without per-project tsconfig wiring. Root
                // config files and scripts/*.mjs are plain Node scripts excluded
                // from the typed program (tsconfig has allowJs: false), so they
                // fall back to a default (non-type-checked) project instead of
                // erroring.
                projectService: {
                    allowDefaultProject: ['*.js', '*.mjs', '*.cjs', 'scripts/*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',

            // Standing convention (masterplan §7): files stay ≤300 lines by
            // design; 400 is the hard ceiling that fails the build.
            'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],

            // Standing convention: no CSS transitions/animations anywhere —
            // catches the most common escape hatch (inline style strings built
            // in TS) before it reaches a stylesheet.
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'Literal[value=/transition\\s*:|animation\\s*:/]',
                    message:
                        'No CSS transitions/animations (standing convention — masterplan §7). Remove the transition/animation declaration.',
                },
            ],
        },
    },
    {
        // Ambient declaration files legitimately mirror upstream (sometimes
        // imprecisely typed) APIs verbatim — no-explicit-any doesn't apply.
        files: ['**/*.d.ts'],
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
    {
        // Root config/script files run under the allowDefaultProject fallback
        // (untyped), so type-aware rules don't apply — the recommended
        // typescript-eslint pattern for files outside tsconfig's "include".
        files: ['*.js', '*.mjs', '*.cjs', 'scripts/*.mjs'],
        extends: [tseslint.configs.disableTypeChecked],
    },
    {
        // Platform-API fence: nothing outside src/core/ may touch fetch,
        // indexedDB, or localStorage directly. Populated in Phase 03 Feature
        // 03.9 once core/platform/ exists; kept empty (no-op) here so the
        // config shape is already in place.
        files: ['src/**/*.ts'],
        ignores: ['src/core/**'],
        rules: {
            'no-restricted-globals': [
                'error',
                // TODO(Phase 03, Feature 03.9): add 'fetch', 'indexedDB', 'localStorage'
                // once src/core/platform/, src/core/storage/, and src/core/http/ exist.
            ],
        },
    },
    eslintConfigPrettier,
);
