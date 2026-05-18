// ***********************************************
// API Helpers for myWorld Travel E2E Tests
// ***********************************************

/**
 * Intercept API request
 * @param {string} method - HTTP method
 * @param {string} url - API endpoint URL pattern
 * @param {string} alias - Alias for the intercept
 */
export const interceptAPI = (method, url, alias) => {
    cy.intercept(method, url).as(alias);
};

/**
 * Intercept and mock API response
 * @param {string} method - HTTP method
 * @param {string} url - API endpoint URL pattern
 * @param {object} response - Mock response
 * @param {string} alias - Alias for the intercept
 */
export const mockAPIResponse = (method, url, response, alias) => {
    cy.intercept(method, url, response).as(alias);
};

/**
 * Wait for API request to complete
 * @param {string} alias - Alias of intercepted request
 * @param {number} timeout - Timeout in milliseconds
 */
export const waitForAPIRequest = (alias, timeout = 10000) => {
    cy.wait(`@${alias}`, { timeout });
};
