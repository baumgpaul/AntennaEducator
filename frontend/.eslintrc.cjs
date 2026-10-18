module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    // Conditional hooks crash at runtime ("Rendered more hooks than during the
    // previous render") — always an error.
    'react-hooks/rules-of-hooks': 'error',
    // Deep icon imports resolve to MUI's CommonJS files under Vite 8 (Rolldown):
    // the default import is then { default: Icon } and rendering it crashes
    // (React error #130). Import icons by name from the package root instead.
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@mui/icons-material/*'],
            message: "Use `import { Name } from '@mui/icons-material'` (deep imports crash under Vite 8).",
          },
        ],
      },
    ],
    'no-empty': 'warn',
    '@typescript-eslint/no-require-imports': 'warn',
    // eslint-plugin-react-hooks 7 added React Compiler readiness rules to its
    // recommended set. They flag code the compiler cannot optimise, not
    // runtime bugs — warnings until the app adopts the React Compiler.
    'react-hooks/set-state-in-effect': 'warn',
    'react-hooks/refs': 'warn',
    'react-hooks/purity': 'warn',
    'react-hooks/immutability': 'warn',
    'react-hooks/static-components': 'warn',
    'react-hooks/preserve-manual-memoization': 'warn',
    'react-hooks/use-memo': 'warn',
  },
}
