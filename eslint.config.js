import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default [
  {
    ignores: ['dist/**/*', '.vite/**/*', 'node_modules/**/*'],
  },
  ...compat.config({
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'lit', 'wc'],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:wc/recommended',
      'plugin:lit/recommended',
      'plugin:prettier/recommended',
    ],
    env: {
      browser: true,
      es2021: true,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  }),
]
