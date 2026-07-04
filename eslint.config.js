import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist', 'public/sw.js'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
      // JSX usage isn't visible to no-unused-vars without the react plugin;
      // uppercase-start covers component imports used only in JSX.
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      // React-Compiler-oriented diagnostics: legitimate signals, but this
      // codebase's tiny stateless <td>/<th> render helpers and plain
      // fetch-then-setState effects are deliberate — keep them visible as
      // warnings without failing the lint run.
      'react-hooks/static-components': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
]
