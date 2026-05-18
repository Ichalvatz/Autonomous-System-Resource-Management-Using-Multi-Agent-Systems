/**
 * E2E Tests for Flow 1: Login → Recommendations → Place Details → Disliked
 * Split from happy_paths.cy.js for file size optimization
 */
import {
    visitHome, fillLoginForm, submitForm, expectUrlToContain, expectUrlToEqual,
    expectTextVisible, waitForLoadingToFinish, logMessage, verifyPlaceInList,
    verifyPlaceNotInList, clickFirstPlaceCard, getPlaceIdFromUrl, verifyPlaceDetailsVisible, verifyAuthenticationSuccess
} from '../support/helpers';

describe('Flow 1: Login → Recommendations → Place Details → Disliked', () => {
    beforeEach(() => { cy.clearLocalStorage(); cy.clearCookies(); });

    it('should complete the full user journey from login to disliked and verify filtering', () => {
        let dislikedPlaceName, dislikedPlaceId;

        // Step 1-4: Login
        visitHome();
        cy.navigateViaNav('nav-login', '/login');
        fillLoginForm('user1@example.com', 'password123');
        submitForm();
        expectUrlToEqual('/');
        verifyAuthenticationSuccess();

        // Step 5-6: Navigate to and verify recommendations
        cy.interceptAPI('recommendations');
        cy.navigateViaNav('nav-recommendations', '/recommendations');
        cy.waitForAPIAndLoading('getRecommendations');
        cy.getPlaceCards();

        cy.getPlaceData(0).then((place) => {
            dislikedPlaceName = place.name;
            logMessage(`Selected place to dislike: ${dislikedPlaceName}`);
        });

        // Step 7-8: Click place card and verify details
        clickFirstPlaceCard();
        expectUrlToContain('/places/');
        getPlaceIdFromUrl().then((id) => { dislikedPlaceId = id; });
        verifyPlaceDetailsVisible();

        // Step 9-10: Add to disliked
        cy.interceptAPI('addToDisliked', 'POST');
        cy.get('[data-cy="btn-dislike"]').should('be.visible').click();
        cy.wait('@addToDisliked').its('response.statusCode').should('be.oneOf', [200, 201]);

        // Step 11-13: Navigate to favourites and verify disliked
        cy.interceptAPI('dislikedPlaces');
        cy.navigateViaNav('nav-favourites', '/favourites');
        waitForLoadingToFinish();
        cy.clickTab('tab-disliked');
        cy.waitForAPIAndLoading('getDisliked');
        waitForLoadingToFinish();
        cy.getPlaceCards();

        cy.then(() => { if (dislikedPlaceId) verifyPlaceInList(dislikedPlaceId); });

        // Step 14-15: Verify place removed from recommendations
        cy.interceptAPI('recommendations');
        cy.navigateViaNav('nav-recommendations', '/recommendations');
        cy.waitForAPIAndLoading('getRecommendations');

        cy.then(() => {
            if (dislikedPlaceId) {
                verifyPlaceNotInList(dislikedPlaceId);
                logMessage(`✅ Flow 1 Complete: Successfully disliked place and verified filtering!`);
            }
        });
    });
});
