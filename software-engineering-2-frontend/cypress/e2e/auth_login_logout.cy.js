/**
 * @fileoverview E2E Tests for Login & Logout Flows
 * Tests authentication workflow, session persistence, and protected routes.
 * Split from auth_happy_unhappy.cy.js for file size optimization
 * @module cypress/e2e/auth_login_logout
 */

import { visitLogin, expectUrlToEqual, expectUrlToContain, fillLoginForm, submitForm, logMessage } from '../support/helpers';

/**
 * Test suite for authentication flows.
 * Covers login, logout, session persistence, and route protection.
 */
describe('Login & Logout Flows', () => {
    // Clear state before each test for isolation
    beforeEach(() => { cy.clearLocalStorage(); cy.clearCookies(); });

    /**
     * Login Page Tests
     * Verify login form renders and authentication succeeds with valid credentials.
     */
    describe('Login Page', () => {
        // Test: Page loads correctly
        it('should load the login page', () => {
            visitLogin();
            cy.contains(/login/i).should('be.visible');
        });

        // Test: Login with custom test user fixture
        it('should successfully log in with valid credentials', () => {
            cy.loginAsTestUser('validUser');
            expectUrlToEqual('/');
            cy.shouldBeAuthenticated();
            logMessage('✅ Successfully logged in with test user');
        });

        // Test: Login with hardcoded demo credentials
        it('should log in with demo user credentials', () => {
            cy.login('user1@example.com', 'password123');
            cy.url().should('not.include', '/login');
            cy.shouldBeAuthenticated();
            logMessage('✅ Successfully logged in with demo credentials');
        });
    });

    /**
     * Logout Tests
     * Verify logout clears session and redirects appropriately.
     */
    describe('Logout', () => {
        // Test: Programmatic logout
        it('should successfully log out', () => {
            cy.loginAsTestUser('validUser');
            cy.url().should('not.include', '/login');
            cy.logout();
            cy.shouldNotBeAuthenticated();
            logMessage('✅ Successfully logged out');
        });

        // Test: Logout via UI dropdown button
        it('should log out via UI logout button', () => {
            cy.loginAsTestUser('validUser');
            cy.get('[data-cy="user-dropdown-trigger"]').should('be.visible').click();
            cy.get('[data-cy="btn-logout"]').should('be.visible').click();
            cy.shouldNotBeAuthenticated();
            cy.url().should('satisfy', (url) => url.includes('/login') || url === Cypress.config().baseUrl + '/');
            logMessage('✅ Successfully logged out via UI');
        });
    });

    /**
     * Session Persistence Tests
     * Verify session survives page reloads and data is stored correctly.
     */
    describe('Session Persistence', () => {
        // Test: Session survives reload
        it('should maintain session after page reload', () => {
            cy.loginAsTestUser('validUser');
            expectUrlToEqual('/');
            cy.shouldBeAuthenticated();
            cy.reload();
            cy.shouldBeAuthenticated();
            logMessage('✅ Session persists after page reload');
        });

        // Test: User data in localStorage is correct
        it('should restore user data from localStorage', () => {
            cy.loginAsTestUser('validUser');
            cy.window().its('localStorage.user').should('exist');
            cy.window().its('localStorage.user').then((userJson) => {
                const user = JSON.parse(userJson);
                expect(user).to.have.property('email');
                expect(user.email).to.equal('user1@example.com');
            });
            logMessage('✅ User data correctly stored in localStorage');
        });
    });

    /**
     * Protected Route Tests
     * Verify authenticated users can access protected routes.
     */
    describe('Protected Routes', () => {
        // Test: Authenticated access to profile page
        it('should allow access to protected route when authenticated', () => {
            cy.loginAsTestUser('validUser');
            cy.visit('/profile');
            expectUrlToContain('/profile');
            cy.get('body').should('be.visible');
            logMessage('✅ Authenticated user can access protected routes');
        });
    });
});
