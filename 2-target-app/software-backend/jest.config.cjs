/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',

  // Test files location
  testMatch: ['**/tests/**/*.test.[jt]s?(x)'],

  // Test setup file (for env and DB)
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Performance optimizations
  maxWorkers: '50%', // Use 50% of available CPU cores for better performance
  testTimeout: 30000, // 30 second timeout (reduced from default 5s for integration tests)
  
  // Cache to speed up subsequent runs
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',

  // Coverage settings
  collectCoverage: true,
  collectCoverageFrom: [
    // Backend source code paths
    'controllers/**/*.js',
    'services/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'routes/**/*.js',
    'utils/**/*.js',
    'config/**/*.js',
    // Exclude test files and certain config files
    '!config/seedData.js',
    '!**/*.test.js',
    '!**/tests/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80
    }
  },

  // ESM support for Node 18 with "type": "module"
  // Note: extensionsToTreatAsEsm is not needed when package.json has "type": "module"

  // No transforms needed for plain JS ESM in Node 18
  transform: {},

  // Ignore patterns
  testPathIgnorePatterns: ['/node_modules/'],
  coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],

  // Optimize output
  verbose: false,
  silent: true, 
  
  // Bail early on failures in CI (optional, comment out for local dev)
  bail: 1,
  
  // Clear mocks automatically between tests
  clearMocks: true,
  resetMocks: false,
  restoreMocks: true,

  // Detect open handles (helps identify connection leaks)
  // detectOpenHandles: true
};
