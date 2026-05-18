/**
 * E2E Tests for Flow 2: Signup → Preferences → Recommendations
 * Split from happy_paths.cy.js for file size optimization
 */
import {
    visitHome, fillSignupForm, submitForm, expectUrlToContain,
    expectTextVisible, logMessage, getRandomEmail, capturePlaceData, verifyRecommendationsChanged, verifyAuthenticationSuccess
} from '../support/helpers';

describe('Flow 2: Signup → Preferences → Recommendations', () => {
    beforeEach(() => { cy.clearLocalStorage(); cy.clearCookies(); });

    it('should verify recommendations update after changing preferences', () => {
        const newUser = { name: 'Cypress Test User', email: getRandomEmail(), password: 'TestPassword123!', confirmPassword: 'TestPassword123!' };
        let firstRecommendationSet = [], secondRecommendationSet = [];

        // Step 1-4: Signup
        visitHome();
        cy.navigateViaNav('nav-signup', '/signup');
        cy.interceptAPI('signup', 'POST');
        fillSignupForm(newUser);
        submitForm();
        cy.wait('@signup').its('response.statusCode').should('be.oneOf', [200, 201]);
        verifyAuthenticationSuccess();
        logMessage(`✅ User registered: ${newUser.email}`);

        // Step 5-7: Create first preference profile
        cy.navigateViaNav('nav-preferences', '/preferences');
        cy.interceptAPI('createPreference', 'POST');
        cy.contains('button', /new profile|create|add/i).click();
        cy.get('form').should('be.visible');
        cy.get('form input[type="text"]').first().clear().type('Museum & Culture Preferences');
        ['MUSEUM', 'CULTURE'].forEach((cat) => cy.get('form').within(() => cy.contains('button, label', cat, { matchCase: false }).first().click()));
        cy.get('form').contains('button', /create|save|submit/i).click();
        cy.wait('@createPreference').its('response.statusCode').should('be.oneOf', [200, 201]);
        logMessage('✅ First preference profile created');

        // Step 8-9: Get first recommendations
        cy.interceptAPI('recommendations');
        cy.navigateViaNav('nav-recommendations', '/recommendations');
        cy.waitForAPIAndLoading('getRecommendations');
        cy.getPlaceCards();
        capturePlaceData().then((places) => { firstRecommendationSet = places; });

        // Step 10-12: Create second preference profile
        cy.navigateViaNav('nav-preferences', '/preferences');
        cy.interceptAPI('createPreference', 'POST');
        cy.contains('button', /new profile|create|add/i).click();
        cy.get('form input[type="text"]').first().clear().type('Beach & Dining Preferences');
        ['BEACH', 'RESTAURANT'].forEach((cat) => cy.get('form').within(() => cy.contains('button, label', cat, { matchCase: false }).first().click()));
        cy.get('form').contains('button', /create|save|submit/i).click();
        cy.wait('@createPreference');
        cy.get('body').then(($body) => {
            const btn = $body.find('button:contains("Activate")');
            if (btn.length > 0) cy.wrap(btn).first().click();
        });

        // Step 13-14: Verify recommendations changed
        cy.interceptAPI('recommendations');
        cy.navigateViaNav('nav-recommendations', '/recommendations');
        cy.waitForAPIAndLoading('getRecommendations');
        cy.getPlaceCards();
        capturePlaceData().then((places) => {
            secondRecommendationSet = places;
            verifyRecommendationsChanged(firstRecommendationSet, secondRecommendationSet);
            logMessage('✅ Flow 2 Complete: Verified recommendation updates after preference changes!');
        });
    });
});
