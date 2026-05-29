/**
 * E2E Tests for Unhappy Path Error Scenarios - REFACTORED
 *
 * This test suite focuses on failure and validation scenarios across features:
 * 1. Preference profile creation errors (missing/invalid fields)
 * 2. Navigation route planning errors (missing origin/destination)
 * 3. Additional edge cases and HTML5 form validation behavior
 *
 * Pages covered: PreferencesPage, NavigationPage, RecommendationsPage, FavouritesPage
 */

import {
  visitPreferences,
  expectUrlToContain,
  clickCreateProfile,
  fillProfileName,
  selectCategories,
  submitProfileForm,
  assertHtml5ValidationError,
  assertFormStillVisible,
  fillNavigationForm,
  assertNoRouteResults,
  logMessage
} from '../support/helpers';

describe('Unhappy Paths', () => {

  let testUser;

  before(() => {
    // Load test user data from fixture
    cy.fixture('test-users').then((users) => {
      testUser = users.validUser;
    });
  });

  beforeEach(() => {
    // Clear any previous auth state
    cy.clearLocalStorage();
    cy.clearCookies();

    // Login before each test using API for speed
    cy.loginViaAPI(testUser.email, testUser.password);

    // Wait for authentication to complete
    cy.window().its('localStorage.token').should('exist');
  });

  /**
   * SCENARIO 1: Preference Profile Error
   *
   * Steps:
   * 1. Navigate to PreferencesPage
   * 2. Open create profile form
   * 3. Leave "Name" empty and select categories
   * 4. Submit form and assert HTML5 validation error
   * 5. Assert form remains visible and no profile was created
   */
  describe('Scenario 1: Preference Profile Creation Error', () => {

    it('should display validation error when profile name is missing', () => {
      logMessage('🔴 Testing: Create profile without name field');

      // Intercept preferences API calls (match actual API paths)
      cy.interceptAPI('preferences');
      cy.interceptAPI('createPreference', 'POST');

      // Navigate to Preferences page
      visitPreferences();
      cy.waitForAPIAndLoading('getPreferences');
      cy.contains('h1', /preferences|preference profiles/i).should('be.visible');

      logMessage('✓ Navigated to Preferences page');

      // Click to create new preference profile
      clickCreateProfile();
      assertFormStillVisible();

      logMessage('✓ Opened preference profile form');

      // Select categories but SKIP the name field
      // Leave the name field empty (or clear it if it has default value)
      cy.get('form input[type="text"]').first().clear();

      // Select at least one category to show that only name is missing
      selectCategories(['MUSEUM', 'RESTAURANT']);

      logMessage('✓ Selected categories without filling name');

      // Try to submit the form
      cy.wait(500);
      submitProfileForm();

      logMessage('✓ Clicked save button');

      // Verify HTML5 validation prevents submission
      assertHtml5ValidationError('form input[type="text"]');

      // Verify we're still on the preferences page (form didn't submit)
      expectUrlToContain('/preferences');

      // Verify the form is still visible (wasn't submitted)
      assertFormStillVisible();

      logMessage('✅ HTML5 validation prevented submission successfully');
    });

    it('should not create profile when name is only whitespace', () => {
      logMessage('🔴 Testing: Create profile with whitespace-only name');

      cy.interceptAPI('preferences');
      cy.interceptAPI('createPreference', 'POST');

      visitPreferences();
      cy.waitForAPIAndLoading('getPreferences');

      clickCreateProfile();

      // Enter only whitespace in name field
      fillProfileName('   ');

      // Try to submit
      submitProfileForm();

      // Wait a moment
      cy.wait(1000);

      // Verify form is still visible (submission was prevented or failed)
      assertFormStillVisible();
      expectUrlToContain('/preferences');

      logMessage('✅ Whitespace-only name validation works');
    });
  });

  /**
   * SCENARIO 2: Navigation Route Planning Error
   *
   * Steps:
   * 1. Navigate to NavigationPage
   * 2. Fill only the start or only the destination fields
   * 3. Attempt to calculate route
   * 4. Assert HTML5 validation errors and that no route results are shown
   */
  describe('Scenario 2: Navigation Route Planning Error', () => {

    beforeEach(() => {
      // Intercept navigation/route API calls
      cy.interceptAPI('navigation');
      cy.interceptAPI('calculateRoute', 'POST');
    });

    it('should display validation error when destination is missing', () => {
      logMessage('🔴 Testing: Calculate route without destination');

      // Navigate to Navigation page
      cy.visit('/navigation');
      expectUrlToContain('/navigation');
      cy.contains('h1', /navigation|route|map/i).should('be.visible');

      logMessage('✓ Navigated to Navigation page');

      // Fill in start location only
      fillNavigationForm({
        fromLocation: 'Athens, Greece'
      });

      logMessage('✓ Entered start location');

      // Explicitly clear destination field to ensure it's empty
      cy.get('input[name="toLocation"]').should('be.visible').clear();

      logMessage('✓ Left destination field empty');

      // Click "Calculate Route" button
      cy.contains('button', /calculate route|calculate|plan/i).should('be.visible').click();

      logMessage('✓ Clicked Calculate Route button');

      // Verify HTML5 validation prevents submission
      assertHtml5ValidationError('input[name="toLocation"]');

      // Verify no route results are shown (form didn't submit)
      assertNoRouteResults();

      // Verify we're still on navigation page
      expectUrlToContain('/navigation');

      logMessage('✅ Navigation validation prevented submission successfully');
    });

    it('should display error when start location is missing', () => {
      logMessage('🔴 Testing: Calculate route without start location');

      cy.visit('/navigation');

      // Fill in destination only
      fillNavigationForm({
        toLocation: 'Thessaloniki, Greece'
      });

      // Leave start location empty
      cy.get('input[name="fromLocation"]').should('be.visible').clear();

      // Try to calculate route
      cy.contains('button', /calculate route|calculate|plan/i).should('be.visible').click();

      cy.wait(500);

      // Verify HTML5 validation prevents submission
      assertHtml5ValidationError('input[name="fromLocation"]');

      // Verify no route results
      assertNoRouteResults();

      logMessage('✅ Start location validation works');
    });

  });

  /**
   * Cleanup after all tests
   */
  after(() => {
    logMessage('🧹 Cleaning up test data');
    cy.clearLocalStorage();
    cy.clearCookies();
  });
});
