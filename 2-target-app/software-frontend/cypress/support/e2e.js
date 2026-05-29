/*
  * Cypress E2E Support File
  * This file is automatically loaded before your test files.
  * It is used to set up global configuration and behavior that modifies Cypress.
*/

// Import custom commands
import './commands';

// Import helper utilities
import './helpers';

// Global before hook for all tests
before(() => {
  // Clear local storage before test suite
  cy.clearLocalStorage();
});

// Global beforeEach hook
beforeEach(() => {
  // Clear cookies before each test
  cy.clearCookies();
  
  // Preserve auth token if needed (remove this if you want fresh state for each test)
  // cy.clearLocalStorage({ except: ['token', 'user'] });
});

// Global after hook
after(() => {
  // Clean up after all tests
  cy.clearLocalStorage();
  cy.clearCookies();
});
