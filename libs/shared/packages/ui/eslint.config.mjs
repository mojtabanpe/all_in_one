import nx from '@nx/eslint-plugin';
import baseConfig from '../../../../eslint.config.mjs';

export default [
  ...nx.configs['flat/angular'],
  ...nx.configs['flat/angular-template'],
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'aio',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'aio',
          style: 'kebab-case',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    // Override or add rules here
    rules: {},
  },
  {
    // This library wraps/owns spartan, so it may import it (CLAUDE.md directive 4).
    files: ['**/*.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    // Composed components keep native hosts (buttons, links, headings and dl groups).
    files: [
      'src/lib/components/{async-button,card-heading,catalog-card,empty-state,metric,navigation-card,section-heading,skeleton-lines,skeleton-rows}.ts',
    ],
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        { type: 'attribute', prefix: 'aio', style: 'camelCase' },
      ],
    },
  },
];
