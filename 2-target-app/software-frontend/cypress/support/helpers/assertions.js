// ***********************************************
// Assertion Helpers for myWorld Travel E2E Tests
// ***********************************************

/**
 * Assert that URL contains a specific path
 * @param {string} path - Path to check for
 */
export const expectUrlToContain = (path) => {
    cy.url().should('include', path);
};

/**
 * Assert that URL equals a specific path
 * @param {string} path - Exact path to check
 */
export const expectUrlToEqual = (path) => {
    cy.url().should('eq', Cypress.config().baseUrl + path);
};

/**
 * Assert that text is visible on the page
 * @param {string} text - Text to look for
 */
export const expectTextVisible = (text) => {
    cy.contains(text).should('be.visible');
};

/**
 * Assert that text is not visible on the page
 * @param {string} text - Text that should not be visible
 */
export const expectTextNotVisible = (text) => {
    cy.contains(text).should('not.exist');
};

/**
 * Assert that element exists
 * @param {string} selector - Element selector
 */
export const expectElementExists = (selector) => {
    cy.get(selector).should('exist');
};

/**
 * Assert that element is visible
 * @param {string} selector - Element selector
 */
export const expectElementVisible = (selector) => {
    cy.get(selector).should('be.visible');
};

/**
 * Assert that element does not exist
 * @param {string} selector - Element selector
 */
export const expectElementNotExists = (selector) => {
    cy.get(selector).should('not.exist');
};

/**
 * Assert that element has a specific text
 * @param {string} selector - Element selector
 * @param {string} text - Expected text
 */
export const expectElementText = (selector, text) => {
    cy.get(selector).should('have.text', text);
};

/**
 * Assert that element contains text
 * @param {string} selector - Element selector
 * @param {string} text - Text to contain
 */
export const expectElementContainsText = (selector, text) => {
    cy.get(selector).should('contain', text);
};

/**
 * Assert that input has specific value
 * @param {string} selector - Input selector
 * @param {string} value - Expected value
 */
export const expectInputValue = (selector, value) => {
    cy.get(selector).should('have.value', value);
};

/**
 * Assert that error message is displayed
 * @param {string} errorText - Error message text
 */
export const expectErrorMessage = (errorText) => {
    cy.get('.field-error, .error-message, [role="alert"]')
        .should('be.visible')
        .and('contain', errorText);
};

/**
 * Assert that success message is displayed
 * @param {string} successText - Success message text
 */
export const expectSuccessMessage = (successText) => {
    cy.get('.success-message, [role="status"]')
        .should('be.visible')
        .and('contain', successText);
};

/**
 * Assert that authentication error is displayed
 * @param {string|RegExp} message - Expected error message or pattern
 */
export const assertAuthError = (message) => {
    cy.get('[data-testid="auth-error"], [role="alert"], .error-message, .alert')
        .should('be.visible')
        .invoke('text')
        .should('match', typeof message === 'string' ? new RegExp(message, 'i') : message);
};

/**
 * Assert HTML5 form validation prevents submission
 * @param {string} selector - Input selector to check validity
 */
export const assertHtml5ValidationError = (selector) => {
    cy.get(selector).then(($input) => {
        expect($input[0].validity.valid).to.be.false;
    });
};

/**
 * Assert that form is still visible (not submitted)
 */
export const assertFormStillVisible = () => {
    cy.get('form').should('be.visible');
};

/**
 * Assert no route results are displayed
 */
export const assertNoRouteResults = () => {
    cy.get('.route-results-card, .route-summary').should('not.exist');
};
