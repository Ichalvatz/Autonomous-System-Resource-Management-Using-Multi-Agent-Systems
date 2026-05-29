// ***********************************************
// Utility Helpers for myWorld Travel E2E Tests
// ***********************************************

/**
 * Get random email for testing
 * @returns {string} Random email address
 */
export const getRandomEmail = () => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `test${timestamp}${random}@example.com`;
};

/**
 * Get random string
 * @param {number} length - Length of random string
 * @returns {string} Random string
 */
export const getRandomString = (length = 10) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

/**
 * Take screenshot with custom name
 * @param {string} name - Screenshot name
 */
export const takeScreenshot = (name) => {
    cy.screenshot(name);
};

/**
 * Log message to Cypress command log
 * @param {string} message - Message to log
 */
export const logMessage = (message) => {
    cy.log(message);
};

/**
 * Reload page
 */
export const reloadPage = () => {
    cy.reload();
};

/**
 * Go back in browser history
 */
export const goBack = () => {
    cy.go('back');
};

/**
 * Go forward in browser history
 */
export const goForward = () => {
    cy.go('forward');
};

/**
 * Scroll to element
 * @param {string} selector - Element selector
 */
export const scrollToElement = (selector) => {
    cy.get(selector).scrollIntoView();
};

/**
 * Scroll to top of page
 */
export const scrollToTop = () => {
    cy.scrollTo('top');
};

/**
 * Scroll to bottom of page
 */
export const scrollToBottom = () => {
    cy.scrollTo('bottom');
};
