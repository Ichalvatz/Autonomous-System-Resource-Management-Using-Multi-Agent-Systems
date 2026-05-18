// ***********************************************
// Form Helpers for myWorld Travel E2E Tests
// ***********************************************

/**
 * Fill an input field
 * @param {string} selector - CSS selector or field ID
 * @param {string} value - Value to type
 */
export const fillInput = (selector, value) => {
    cy.get(selector).clear().type(value);
};

/**
 * Submit a form by clicking submit button
 * @param {string} selector - Submit button selector (defaults to data-cy="btn-submit")
 */
export const submitForm = (selector = '[data-cy="btn-submit"]') => {
    cy.get(selector).click();
};

/**
 * Fill login form with credentials
 * @param {string} email - User email
 * @param {string} password - User password
 */
export const fillLoginForm = (email, password) => {
    cy.get('[data-cy="input-email"]').clear().type(email);
    cy.get('[data-cy="input-password"]').clear().type(password);
};

/**
 * Fill signup/registration form
 * @param {object} userData - User data
 * @param {string} userData.name - User's name
 * @param {string} userData.email - User's email
 * @param {string} userData.password - User's password
 * @param {string} userData.confirmPassword - Password confirmation
 */
export const fillSignupForm = (userData) => {
    cy.get('[data-cy="input-name"]').clear().type(userData.name);
    cy.get('[data-cy="input-email"]').clear().type(userData.email);
    cy.get('[data-cy="input-password"]').clear().type(userData.password);
    cy.get('[data-cy="input-confirmPassword"]').clear().type(userData.confirmPassword || userData.password);
};

/**
 * Select a dropdown option
 * @param {string} selector - Dropdown selector
 * @param {string} value - Value to select
 */
export const selectOption = (selector, value) => {
    cy.get(selector).select(value);
};

/**
 * Check a checkbox
 * @param {string} selector - Checkbox selector
 */
export const checkCheckbox = (selector) => {
    cy.get(selector).check();
};

/**
 * Uncheck a checkbox
 * @param {string} selector - Checkbox selector
 */
export const uncheckCheckbox = (selector) => {
    cy.get(selector).uncheck();
};

/**
 * Fill navigation form with location names
 * @param {object} locations - Location data
 * @param {string} locations.fromLocation - Starting location name (optional)
 * @param {string} locations.toLocation - Destination location name (optional)
 */
export const fillNavigationForm = (locations) => {
    if (locations.fromLocation !== undefined) {
        cy.get('input[name="fromLocation"]').should('be.visible').clear().type(locations.fromLocation || ' ');
        if (!locations.fromLocation) {
            cy.get('input[name="fromLocation"]').clear();
        }
    }
    if (locations.toLocation !== undefined) {
        cy.get('input[name="toLocation"]').should('be.visible').clear().type(locations.toLocation || ' ');
        if (!locations.toLocation) {
            cy.get('input[name="toLocation"]').clear();
        }
    }
};

/**
 * Clear navigation form fields
 */
export const clearNavigationForm = () => {
    cy.get('input[name="fromLocation"]').should('be.visible').clear();
    cy.get('input[name="toLocation"]').should('be.visible').clear();
};

/**
 * Click create/new profile button on preferences page
 */
export const clickCreateProfile = () => {
    cy.contains('button', /new profile|create|add/i).should('be.visible').click();
    cy.wait(1000); // Wait for form to appear
};

/**
 * Fill preference profile name
 * @param {string} name - Profile name
 */
export const fillProfileName = (name) => {
    cy.get('form input[type="text"]').first().clear().type(name);
};

/**
 * Select categories in preference profile form
 * @param {string[]} categories - Array of category names to select
 */
export const selectCategories = (categories) => {
    categories.forEach((category) => {
        cy.get('body').then(($body) => {
            const categoryElement = $body.find(
                `button:contains("${category}"), ` +
                `label:contains("${category}"), ` +
                `input[value="${category}"]`
            );

            if (categoryElement.length > 0) {
                cy.wrap(categoryElement).first().click({ force: true });
            }
        });
    });
};

/**
 * Submit preference profile form
 */
export const submitProfileForm = () => {
    cy.wait(500);
    cy.get('form').contains('button', /create|save|submit/i).click();
};
