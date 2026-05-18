// ***********************************************
// Wait Helpers for myWorld Travel E2E Tests
// ***********************************************

/**
 * Wait for loading spinner to disappear
 * Uses Cypress's built-in retry-ability instead of arbitrary waits
 * @param {number} timeout - Timeout in milliseconds
 */
export const waitForLoadingToFinish = (timeout = 10000) => {
    // Wait for loading spinner to not exist
    cy.get('[data-cy="loading-spinner"], .loading, .spinner', { timeout }).should('not.exist');
};

/**
 * Wait for page to be fully loaded
 */
export const waitForPageLoad = () => {
    cy.window().its('document.readyState').should('eq', 'complete');
};

/**
 * Wait for specific element to appear
 * @param {string} selector - Element selector
 * @param {number} timeout - Timeout in milliseconds
 */
export const waitForElement = (selector, timeout = 10000) => {
    cy.get(selector, { timeout }).should('exist');
};

/**
 * Wait for specific element to be visible
 * @param {string} selector - Element selector
 * @param {number} timeout - Timeout in milliseconds
 */
export const waitForElementVisible = (selector, timeout = 10000) => {
    cy.get(selector, { timeout }).should('be.visible');
};

/**
 * Wait for navigation to complete
 * @param {string} expectedPath - Expected URL path
 * @param {number} timeout - Timeout in milliseconds
 */
export const waitForNavigation = (expectedPath, timeout = 10000) => {
    cy.url({ timeout }).should('include', expectedPath);
};
