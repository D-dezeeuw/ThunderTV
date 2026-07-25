// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

// Shared standing-convention selector (masterplan §7): no CSS
// transitions/animations anywhere, including inline style strings built in
// TS. Declared once and reused by every block below that also sets
// `no-restricted-syntax` for a narrower file scope — flat config replaces
// (never merges) a rule's value across matching blocks, so any block that
// re-specifies this rule must include this selector again or the ban
// silently disappears for that scope.
const noTransitionSyntaxSelector = {
    selector: 'Literal[value=/transition\\s*:|animation\\s*:/]',
    message:
        'No CSS transitions/animations (standing convention — masterplan §7). Remove the transition/animation declaration.',
};

// Feature 03.7.8: dynamic <input> elements (file pickers, in practice) must
// be created inside src/core/platform/ via WebFileAdapter, not ad hoc
// elsewhere in the app.
const noInputElementSyntaxSelector = {
    selector: "CallExpression[callee.object.name='document'][callee.property.name='createElement'] > Literal[value='input']",
    message:
        'Dynamic <input> elements (file pickers) must be created inside src/core/platform/ via WebFileAdapter — see Feature 03.7.8.',
};

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

            'no-restricted-syntax': ['error', noTransitionSyntaxSelector],
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
        // Platform-API fence (Feature 03.9): nothing outside src/core/ may
        // touch fetch, indexedDB, localStorage, sessionStorage, XHR, or
        // WebSocket directly — all network/storage I/O goes through
        // getPlatform() so CORS/timeout classification and tiered storage
        // stay unavoidable. src/core/ itself is fully exempted (03.9.2):
        // that's exactly where these APIs are meant to be used.
        files: ['src/**/*.ts'],
        ignores: ['src/core/**'],
        rules: {
            'no-restricted-globals': [
                'error',
                {
                    name: 'fetch',
                    message: 'Use getPlatform().http instead of the global fetch — see src/core/http/.',
                },
                {
                    name: 'indexedDB',
                    message: 'Use getPlatform().storage instead of indexedDB directly — see src/core/storage/.',
                },
                {
                    name: 'localStorage',
                    message: 'Use getPlatform().storage instead of localStorage directly — see src/core/storage/.',
                },
                {
                    name: 'sessionStorage',
                    message:
                        'Session-scoped persistence goes through the storage layer, not sessionStorage directly — see src/core/storage/.',
                },
                {
                    name: 'XMLHttpRequest',
                    message:
                        'All network I/O goes through getPlatform().http so CORS/timeout classification is unavoidable — see src/core/http/.',
                },
                {
                    name: 'WebSocket',
                    message:
                        'No transport bypasses the http adapter\'s classification today; if a real need for WebSocket arises, add a dedicated adapter method deliberately — see src/core/http/.',
                },
            ],
            'no-restricted-properties': [
                'error',
                { object: 'window', property: 'fetch', message: 'Use getPlatform().http instead of window.fetch.' },
                {
                    object: 'globalThis',
                    property: 'fetch',
                    message: 'Use getPlatform().http instead of globalThis.fetch.',
                },
                {
                    object: 'window',
                    property: 'localStorage',
                    message: 'Use getPlatform().storage instead of window.localStorage.',
                },
                {
                    object: 'window',
                    property: 'indexedDB',
                    message: 'Use getPlatform().storage instead of window.indexedDB.',
                },
                {
                    object: 'window',
                    property: 'sessionStorage',
                    message: 'Session-scoped persistence goes through the storage layer, not window.sessionStorage.',
                },
                {
                    object: 'navigator',
                    property: 'storage',
                    message:
                        'Storage-quota/persistence checks belong behind the StorageAdapter probe, not a direct navigator.storage call.',
                },
                {
                    // Feature 03.2.6: only src/core/platform/ (excluded above
                    // via the broader src/core/** exemption) may read
                    // window.electron — every other consumer, including the
                    // rest of src/core/, branches on capabilities instead.
                    object: 'window',
                    property: 'electron',
                    message:
                        'Branch on capabilities (getPlatform().capabilities), not window.electron — see Feature 03.2.6. Only src/core/platform/ may sniff window.electron directly.',
                },
            ],
            'no-restricted-syntax': ['error', noTransitionSyntaxSelector, noInputElementSyntaxSelector],
        },
    },
    {
        // Feature 03.9.6: spec files legitimately stub `fetch` to test
        // classifiedFetch/WebHttpAdapter (or to assert a real network call
        // never happens) without touching a real network — vitest's
        // `vi.stubGlobal('fetch', ...)` and reading `globalThis.fetch` back
        // out for assertions both need the identifier/property reachable.
        // Everything else fenced above stays banned in specs too: tests
        // exercise adapters via FakePlatform/mocks, never real indexedDB/
        // localStorage/sessionStorage/XHR/WebSocket. Ignores src/core/** so
        // this doesn't re-restrict the low-level adapter specs that already
        // have full access via the block above.
        files: ['src/**/*.spec.ts'],
        ignores: ['src/core/**'],
        rules: {
            'no-restricted-globals': [
                'error',
                { name: 'indexedDB', message: 'Use FakePlatform/MemoryStorage in tests, not real indexedDB.' },
                { name: 'localStorage', message: 'Use FakePlatform/MemoryStorage in tests, not real localStorage.' },
                {
                    name: 'sessionStorage',
                    message: 'Use FakePlatform/MemoryStorage in tests, not real sessionStorage.',
                },
                {
                    name: 'XMLHttpRequest',
                    message: 'Not used by this codebase; if a spec needs one, reconsider the design.',
                },
                { name: 'WebSocket', message: 'Not used by this codebase; if a spec needs one, reconsider the design.' },
            ],
            'no-restricted-properties': [
                'error',
                { object: 'window', property: 'localStorage', message: 'Use FakePlatform/MemoryStorage in tests.' },
                { object: 'window', property: 'indexedDB', message: 'Use FakePlatform/MemoryStorage in tests.' },
                { object: 'window', property: 'sessionStorage', message: 'Use FakePlatform/MemoryStorage in tests.' },
                { object: 'navigator', property: 'storage', message: 'Use FakePlatform/MemoryStorage in tests.' },
            ],
        },
    },
    eslintConfigPrettier,
);
