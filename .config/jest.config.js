const path = require('path');

const { grafanaESModules, nodeModulesToTransform } = (() => {
  const nodeModulesToTransform = (moduleNames) =>
    `node_modules\/(?!.*(${moduleNames.join('|')})\/.*)`;
  const grafanaESModules = [
    '.pnpm', '@grafana/schema', 'd3', 'd3-color', 'd3-force',
    'd3-interpolate', 'd3-scale-chromatic', 'marked', 'rxjs', 'uuid',
  ];
  return { grafanaESModules, nodeModulesToTransform };
})();

module.exports = {
  moduleNameMapper: {
    '\\.(css|scss|sass)$': 'identity-obj-proxy',
    'react-inlinesvg': path.resolve(__dirname, 'jest', 'mocks', 'react-inlinesvg.tsx'),
  },
  modulePaths: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{spec,test,jest}.{js,jsx,ts,tsx}',
  ],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        sourceMaps: 'inline',
        jsc: {
          parser: { syntax: 'typescript', tsx: true, decorators: false, dynamicImport: true },
        },
      },
    ],
  },
  transformIgnorePatterns: [nodeModulesToTransform(grafanaESModules)],
  watchPathIgnorePatterns: ['<rootDir>/node_modules', '<rootDir>/dist'],
};
