/*
  * Cypress Configuration File
  * This file sets up the Cypress testing environment for end-to-end (E2E) tests.
  * It includes settings for base URL, timeouts, retries, video/screenshot capture,
  * environment variables, and node event handlers for logging and custom tasks.
*/

const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    // Base URL where the frontend app runs (can be overridden via env)
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',

    // Folder where E2E spec files live
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',

    // Support file (custom commands, helpers)
    supportFile: 'cypress/support/e2e.js',

    // Viewport settings
    viewportWidth: 1280,
    viewportHeight: 720,

    // Video and screenshot configuration
    screenshotsFolder: 'cypress/screenshots',
    screenshotOnRunFailure: true,
    video: true,
    videosFolder: 'cypress/videos',
    videoCompression: 32,

    // Timeout and retries
    defaultCommandTimeout: 8000,
    pageLoadTimeout: 60000,
    requestTimeout: 10000,
    responseTimeout: 30000,
    execTimeout: 60000,
    taskTimeout: 60000,

    retries: {
      // Retry failed tests in CI/headless mode
      runMode: 1,
      // Don't retry in interactive mode
      openMode: 0
    },

    // Test isolation
    testIsolation: true,

    // Experiment features
    experimentalRunAllSpecs: true,

    // Security and stability
    chromeWebSecurity: true,
    modifyObstructiveCode: false,

    // Reporter configuration (for CI/CD)
    reporter: 'spec',
    reporterOptions: {
      toConsole: true
    },

    // Environment variables
    env: {
      // API base URL for backend requests
      apiUrl: 'http://localhost:3001',

      // Test timeout multiplier for slower environments
      slowTestThreshold: 10000,

      // Coverage collection
      coverage: false,

      // Code coverage directory
      codeCoverage: {
        url: 'http://localhost:3001/__coverage__',
        exclude: ['cypress/**/*.*']
      }
    },

    // Setup node events for plugins (extensibility)
    setupNodeEvents(on, config) {
      // Log test start
      on('before:spec', (spec) => {
        console.log(`📝 Running: ${spec.relative}`);
      });

      // Log test results
      on('after:spec', (spec, results) => {
        console.log(`✅ Finished: ${spec.relative}`);
        console.log(`   Tests: ${results.stats.tests}`);
        console.log(`   Passes: ${results.stats.passes}`);
        console.log(`   Failures: ${results.stats.failures}`);
        console.log(`   Duration: ${results.stats.duration}ms`);
      });

      // Configure browser launch options
      on('before:browser:launch', (browser = {}, launchOptions) => {
        if (browser.family === 'chromium' || browser.name === 'chrome' || browser.name === 'electron') {
          // Fix for "Automatic fallback to software WebGL has been deprecated" in CI
          // These flags suppress WebGL warnings in headless/CI environments
          launchOptions.args.push('--enable-unsafe-swiftshader');
          launchOptions.args.push('--disable-gpu');
          launchOptions.args.push('--disable-software-rasterizer');
          launchOptions.args.push('--disable-dev-shm-usage');

          // Only log in CI to avoid noise in local development
          if (process.env.CI) {
            console.log(`Injecting Chrome flags for ${browser.name}:`, launchOptions.args.filter(arg =>
              arg.includes('gpu') || arg.includes('swiftshader') || arg.includes('rasterizer')
            ));
          }
        }
        return launchOptions;
      });

      // Task for custom logging
      on('task', {
        log(message) {
          console.log(message);
          return null;
        },
        table(message) {
          console.table(message);
          return null;
        }
      });

      return config;
    }
  },

  // Component testing configuration (future extensibility)
  component: {
    devServer: {
      framework: 'react',
      bundler: 'vite'
    },
    specPattern: 'src/**/*.cy.{js,jsx,ts,tsx}'
  }
});
