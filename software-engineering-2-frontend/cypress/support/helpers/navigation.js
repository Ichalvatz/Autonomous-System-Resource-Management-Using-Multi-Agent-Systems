// ***********************************************
// Navigation Helpers for myWorld Travel E2E Tests
// ***********************************************

/**
 * Navigate to home page
 */
export const visitHome = () => {
    cy.visit('/');
    cy.url().should('eq', Cypress.config().baseUrl + '/');
};

/**
 * Navigate to login page
 */
export const visitLogin = () => {
    cy.visit('/login');
    cy.url().should('include', '/login');
};

/**
 * Navigate to signup page
 */
export const visitSignup = () => {
    cy.visit('/signup');
    cy.url().should('include', '/signup');
};

/**
 * Navigate to dashboard/profile page
 */
export const visitProfile = () => {
    cy.visit('/profile');
    cy.url().should('include', '/profile');
};

/**
 * Navigate to recommendations page
 */
export const visitRecommendations = () => {
    cy.visit('/recommendations');
    cy.url().should('include', '/recommendations');
};

/**
 * Navigate to favourites page
 */
export const visitFavourites = () => {
    cy.visit('/favourites');
    cy.url().should('include', '/favourites');
};

/**
 * Navigate to preferences page
 */
export const visitPreferences = () => {
    cy.visit('/preferences');
    cy.url().should('include', '/preferences');
};

/**
 * Navigate to place details page
 * @param {string} placeId - The ID of the place
 */
export const visitPlaceDetails = (placeId) => {
    cy.visit(`/place/${placeId}`);
    cy.url().should('include', `/place/${placeId}`);
};

/**
 * Navigate using nav link and wait for page load
 * @param {string} dataCy - data-cy attribute of nav element
 * @param {string} expectedPath - Expected URL path
 * @param {string} expectedHeading - Expected heading text pattern
 */
export const navigateAndVerify = (dataCy, expectedPath, expectedHeading) => {
    cy.get(`[data-cy="${dataCy}"]`).click();
    cy.url().should('include', expectedPath);
    if (expectedHeading) {
        cy.contains(expectedHeading).should('be.visible');
    }
};
