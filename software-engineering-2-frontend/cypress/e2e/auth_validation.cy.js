/**
 * @fileoverview E2E Tests for Authentication Validation Errors
 * Tests form validation, error messages, and protected route access.
 * Split from auth_happy_unhappy.cy.js for file size optimization
 * @module cypress/e2e/auth_validation
 */

import { visitLogin, visitSignup, expectUrlToContain, fillLoginForm, fillSignupForm, submitForm, getRandomEmail, logMessage } from '../support/helpers';

/**
 * Test suite for authentication validation.
 * Covers signup validation, login errors, and route protection.
 */
describe('Authentication Validation Errors', () => {
    // Clear state before each test for isolation
    beforeEach(() => { cy.clearLocalStorage(); cy.clearCookies(); });

    /**
     * Signup Validation Tests
     * Tests email format, password strength, and required fields.
     */
    describe('Signup Validation Errors', () => {
        // Test: Invalid email format validation
        it('should show email validation error for invalid email format', () => {
            cy.intercept('POST', '**/auth/signup').as('signupRequest');
            visitSignup();
            fillSignupForm({ name: 'Test User', email: 'not-an-email', password: 'TestPass123', confirmPassword: 'TestPass123' });
            submitForm();
            cy.assertFieldError('email', /email/i);
            expectUrlToContain('/signup');
            cy.window().its('localStorage.token').should('not.exist');
        });

        // Test: Weak password validation
        it('should show password strength error for weak password', () => {
            visitSignup();
            fillSignupForm({ name: 'Test User', email: getRandomEmail(), password: 'weak', confirmPassword: 'weak' });
            submitForm();
            cy.assertFieldError('password', /password|character|uppercase|lowercase|number/i);
            expectUrlToContain('/signup');
        });

        // Test: Password confirmation mismatch
        it('should show error for mismatched password confirmation', () => {
            visitSignup();
            cy.get('[data-cy="input-name"]').clear().type('Test User');
            cy.get('[data-cy="input-email"]').clear().type(getRandomEmail());
            cy.get('[data-cy="input-password"]').clear().type('TestPass123');
            cy.get('[data-cy="input-confirmPassword"]').clear().type('DifferentPass123');
            submitForm();
            cy.assertFieldError('confirmPassword', /password.*not match|passwords do not match/i);
            expectUrlToContain('/signup');
        });

        // Test: Required fields validation
        it('should show required field errors for empty form submission', () => {
            visitSignup();
            submitForm();
            cy.assertFieldError('name', /required|name/i);
            cy.assertFieldError('email', /required|email/i);
            cy.assertFieldError('password', /required|password/i);
            cy.assertFieldError('confirmPassword', /required|confirm/i);
        });

        it('should show password length error for password less than 6 characters', () => {
            visitSignup();
            fillSignupForm({ name: 'Test User', email: getRandomEmail(), password: '12345', confirmPassword: '12345' });
            submitForm();
            cy.assertFieldError('password', /6|character|length/i);
        });

        it('should not allow signup with password lacking complexity', () => {
            visitSignup();
            fillSignupForm({ name: 'Test User', email: getRandomEmail(), password: 'password', confirmPassword: 'password' });
            submitForm();
            cy.assertFieldError('password', /uppercase|lowercase|number|complexity/i);
        });
    });

    /**
     * Login Authentication Error Tests
     * Tests wrong credentials, required fields, and invalid email.
     */
    describe('Login Authentication Errors', () => {
        // Test: Invalid credentials returns auth error
        it('should show auth error for incorrect credentials', () => {
            cy.intercept('POST', '**/auth/login', { statusCode: 401, body: { success: false, message: 'Invalid credentials' } }).as('login');
            visitLogin();
            fillLoginForm('wrong@email.com', 'wrongpassword');
            submitForm();
            cy.wait('@login');
            cy.assertAuthError(/invalid|incorrect|error|credentials/i);
            expectUrlToContain('/login');
        });

        it('should show required field errors for empty form submission', () => {
            visitLogin();
            submitForm();
            cy.assertFieldError('email', /required|email/i);
            cy.assertFieldError('password', /required|password/i);
        });

        it('should show email validation error for invalid email format', () => {
            visitLogin();
            cy.get('[data-cy="input-email"]').clear().type('not-an-email');
            cy.get('[data-cy="input-password"]').clear().type('somepassword');
            submitForm();
            cy.assertFieldError('email', /email/i);
        });
    });

    /**
     * Protected Route Access Control Tests
     * Verifies unauthenticated users are redirected to login.
     */
    describe('Protected Route Access Control - Unauthenticated', () => {
        // Routes requiring authentication
        const protectedRoutes = [
            { path: '/recommendations', name: 'Recommendations' },
            { path: '/profile', name: 'User Profile' },
            { path: '/favourites', name: 'Favourites' },
            { path: '/preferences', name: 'Preferences' },
            { path: '/navigation', name: 'Navigation' }
        ];

        protectedRoutes.forEach(({ path, name }) => {
            it(`should redirect to login when accessing ${name} without auth`, () => {
                cy.visit(path);
                cy.url().should('include', '/login');
            });
        });
    });
});
