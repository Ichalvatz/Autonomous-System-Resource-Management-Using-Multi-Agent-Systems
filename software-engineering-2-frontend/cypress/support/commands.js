// ***********************************************
// Custom Commands for myWorld Travel E2E Tests
// ***********************************************

/**
 * Login command - logs in a user via the UI
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @example cy.login('user1@example.com', 'password123')
 */
Cypress.Commands.add('login', (email, password) => {
  cy.visit('/login');

  // Fill in login form using data-cy attributes
  cy.get('[data-cy="input-email"]').clear().type(email);
  cy.get('[data-cy="input-password"]').clear().type(password);

  // Submit the form
  cy.get('[data-cy="btn-submit"]').click();

  // Wait for redirect or success indication
  cy.url().should('not.include', '/login', { timeout: 10000 });

  // Verify token is stored
  cy.window().its('localStorage.token').should('exist');
});

/**
 * Login command via API - faster than UI login
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @example cy.loginViaAPI('user1@example.com', 'password123')
 */
Cypress.Commands.add('loginViaAPI', (email, password) => {
  const apiUrl = Cypress.env('apiUrl') || 'http://localhost:3001';

  cy.request({
    method: 'POST',
    url: `${apiUrl}/auth/login`,
    body: {
      email,
      password
    }
  }).then((response) => {
    expect(response.status).to.eq(200);
    expect(response.body).to.have.property('success');
    expect(response.body.success).to.be.true;

    // Handle response structure: { success, data: { token, user } }
    const token = response.body.data?.token || response.body.token;
    const user = response.body.data?.user || response.body.user;

    // Visit the home page first to set up the window context
    cy.visit('/');

    // Store token and user info in localStorage
    cy.window().then((win) => {
      win.localStorage.setItem('token', token);
      win.localStorage.setItem('user', JSON.stringify(user));

      // Dispatch login event
      win.dispatchEvent(new CustomEvent('user:login', { detail: user }));
    });
  });
});

/**
 * Logout command - logs out the current user
 * @example cy.logout()
 */
Cypress.Commands.add('logout', () => {
  // Clear authentication data
  cy.clearLocalStorage();
  cy.clearCookies();

  // Visit home or login page
  cy.visit('/');
});

/**
 * Register/Signup command - creates a new user via the UI
 * @param {object} userData - User registration data
 * @param {string} userData.name - User's name
 * @param {string} userData.email - User's email
 * @param {string} userData.password - User's password
 * @param {string} userData.confirmPassword - Password confirmation
 * @example cy.register({ name: 'Test User', email: 'test@example.com', password: 'pass123', confirmPassword: 'pass123' })
 */
Cypress.Commands.add('register', (userData) => {
  cy.visit('/signup');

  // Fill in registration form using data-cy attributes
  cy.get('[data-cy="input-name"]').clear().type(userData.name);
  cy.get('[data-cy="input-email"]').clear().type(userData.email);
  cy.get('[data-cy="input-password"]').clear().type(userData.password);
  cy.get('[data-cy="input-confirmPassword"]').clear().type(userData.confirmPassword || userData.password);

  // Submit the form
  cy.get('[data-cy="btn-submit"]').click();

  // Wait for redirect or success indication
  cy.url().should('not.include', '/signup', { timeout: 10000 });

  // Verify token is stored
  cy.window().its('localStorage.token').should('exist');
});

/**
 * Set authentication token directly in localStorage
 * @param {string} token - JWT token
 * @example cy.setAuthToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')
 */
Cypress.Commands.add('setAuthToken', (token) => {
  cy.window().then((win) => {
    win.localStorage.setItem('token', token);
  });
});

/**
 * Get authentication token from localStorage
 * @example cy.getAuthToken().then((token) => { ... })
 */
Cypress.Commands.add('getAuthToken', () => {
  return cy.window().then((win) => {
    return win.localStorage.getItem('token');
  });
});

/**
 * Clear authentication token from localStorage
 * @example cy.clearAuthToken()
 */
Cypress.Commands.add('clearAuthToken', () => {
  cy.window().then((win) => {
    win.localStorage.removeItem('token');
    win.localStorage.removeItem('user');
  });
});

/**
 * Login as a test user from fixtures
 * @param {string} role - User role (validUser, adminUser, etc.)
 * @example cy.loginAsTestUser('validUser')
 */
Cypress.Commands.add('loginAsTestUser', (role = 'validUser') => {
  cy.fixture('test-users').then((users) => {
    const user = users[role];

    if (!user) {
      throw new Error(`User role "${role}" not found in test-users fixture`);
    }

    // Use API login for speed
    cy.loginViaAPI(user.email, user.password);
  });
});

/**
 * Wait for API requests to complete
 * @param {string} alias - Alias of the intercepted request
 * @param {number} timeout - Timeout in milliseconds
 * @example cy.waitForAPI('@getPlaces')
 */
Cypress.Commands.add('waitForAPI', (alias, timeout = 10000) => {
  cy.wait(alias, { timeout });
});

/**
 * Intercept and stub API endpoints
 * @param {string} method - HTTP method
 * @param {string} url - API endpoint URL pattern
 * @param {object} fixture - Fixture file or response data
 * @param {string} alias - Alias for the intercept
 * @example cy.stubAPI('GET', '/api/places', 'places', 'getPlaces')
 */
Cypress.Commands.add('stubAPI', (method, url, fixture, alias) => {
  cy.intercept(method, url, { fixture }).as(alias);
});

/**
 * Check if user is authenticated
 * @example cy.shouldBeAuthenticated()
 */
Cypress.Commands.add('shouldBeAuthenticated', () => {
  cy.window().its('localStorage.token').should('exist');
  cy.window().its('localStorage.user').should('exist');
});

/**
 * Check if user is not authenticated
 * @example cy.shouldNotBeAuthenticated()
 */
Cypress.Commands.add('shouldNotBeAuthenticated', () => {
  cy.window().its('localStorage.token').should('not.exist');
});

/**
 * Intercept common API endpoints with aliases
 * @param {string} endpoint - API endpoint name (e.g., 'recommendations', 'login', 'preferences')
 * @param {string} method - HTTP method (default: 'GET')
 * @example cy.interceptAPI('recommendations') // intercepts GET and creates @getRecommendations alias
 * @example cy.interceptAPI('login', 'POST') // intercepts POST and creates @login alias
 */
Cypress.Commands.add('interceptAPI', (endpoint, method = 'GET') => {
  const aliasMap = {
    recommendations: { pattern: '**/users/*/recommendations*', alias: 'getRecommendations' },
    login: { pattern: '**/auth/login*', alias: 'login' },
    signup: { pattern: '**/auth/signup*', alias: 'signup' },
    preferences: { pattern: '**/users/*/preference-profiles*', alias: 'getPreferences' },
    createPreference: { pattern: '**/users/*/preference-profiles*', alias: 'createPreference' },
    dislikedPlaces: { pattern: '**/users/*/disliked-places*', alias: 'getDisliked' },
    addToDisliked: { pattern: '**/users/*/disliked-places*', alias: 'addToDisliked' },
    navigation: { pattern: '**/navigation*', alias: 'getNavigation' },
    calculateRoute: { pattern: '**/routes*', alias: 'calculateRoute' }
  };

  const config = aliasMap[endpoint];
  if (!config) {
    throw new Error(`Unknown API endpoint: ${endpoint}. Available: ${Object.keys(aliasMap).join(', ')}`);
  }

  cy.intercept(method, config.pattern).as(config.alias);
});

/**
 * Wait for intercepted API and optionally verify loading disappears
 * @param {string} alias - Alias name (with or without '@')
 * @param {object} options - Options object
 * @param {boolean} options.waitForLoading - Wait for loading spinner to disappear (default: true)
 * @param {number} options.timeout - Timeout in milliseconds (default: 10000)
 * @example cy.waitForAPIAndLoading('@getRecommendations')
 * @example cy.waitForAPIAndLoading('getRecommendations', { waitForLoading: false })
 */
Cypress.Commands.add('waitForAPIAndLoading', (alias, options = {}) => {
  const { waitForLoading = true, timeout = 10000 } = options;
  const cleanAlias = alias.startsWith('@') ? alias : `@${alias}`;

  cy.wait(cleanAlias, { timeout });

  if (waitForLoading) {
    cy.get('[data-cy="loading-spinner"], .loading, .spinner', { timeout }).should('not.exist');
  }
});

/**
 * Navigate to a page using navigation link and verify URL
 * Handles items inside user dropdown by opening it first
 * @param {string} dataCy - data-cy attribute value for the navigation link
 * @param {string} expectedPath - Expected path in URL after navigation
 * @example cy.navigateViaNav('nav-recommendations', '/recommendations')
 */
Cypress.Commands.add('navigateViaNav', (dataCy, expectedPath) => {
  // Items that are inside the user dropdown
  const dropdownItems = ['nav-preferences', 'nav-profile'];

  if (dropdownItems.includes(dataCy)) {
    // First open the user dropdown
    cy.get('[data-cy="user-dropdown-trigger"]').should('be.visible').click();
    // Wait for dropdown menu to appear, then click the item
    cy.get(`[data-cy="${dataCy}"]`).should('be.visible').click();
  } else {
    // Regular nav item - just click it
    cy.get(`[data-cy="${dataCy}"]`).click();
  }
  cy.url().should('include', expectedPath);
});

/**
 * Get place cards and verify they exist
 * @param {number} minCount - Minimum number of cards expected (default: 1)
 * @returns Cypress chainable for place cards
 * @example cy.getPlaceCards().first().click()
 * @example cy.getPlaceCards(3).should('have.length', 3)
 */
Cypress.Commands.add('getPlaceCards', (minCount = 1) => {
  return cy.get('[data-cy="place-card"]')
    .should('have.length.at.least', minCount)
    .first()
    .should('be.visible')
    .then(() => cy.get('[data-cy="place-card"]'));
});

/**
 * Extract place data from a place card element
 * @param {number} index - Index of the place card (default: 0 for first card)
 * @returns Promise with place data object { id, name, category }
 * @example cy.getPlaceData(0).then((place) => { ... })
 */
Cypress.Commands.add('getPlaceData', (index = 0) => {
  return cy.get('[data-cy="place-card"]').eq(index).then(($card) => {
    const placeName = $card.find('[data-cy="place-name"]').text().trim();
    const placeCategory = $card.find('[data-cy="place-category"]').text().trim();
    const placeId = $card.attr('data-place-id');
    return { id: placeId, name: placeName, category: placeCategory };
  });
});

/**
 * Assert that field validation error is visible
 * @param {string} fieldName - Field name (e.g., 'email', 'password', 'name')
 * @param {string|RegExp} expectedMessage - Expected error message or pattern to match
 * @example cy.assertFieldError('email', /required|email/i)
 */
Cypress.Commands.add('assertFieldError', (fieldName, expectedMessage) => {
  cy.get(`[data-testid="${fieldName}-error"]`)
    .should('be.visible')
    .invoke('text')
    .should('match', typeof expectedMessage === 'string' ? new RegExp(expectedMessage, 'i') : expectedMessage);
});

/**
 * Assert that authentication error is displayed
 * @param {string|RegExp} expectedMessage - Expected error message or pattern
 * @example cy.assertAuthError(/invalid|credentials/i)
 */
Cypress.Commands.add('assertAuthError', (expectedMessage) => {
  cy.get('[data-testid="auth-error"], [role="alert"], .error-message, .alert')
    .should('be.visible')
    .invoke('text')
    .should('match', typeof expectedMessage === 'string' ? new RegExp(expectedMessage, 'i') : expectedMessage);
});

/**
 * Click tab/button and wait for it to be active
 * @param {string} dataCy - data-cy attribute value for the tab
 * @example cy.clickTab('tab-disliked')
 */
Cypress.Commands.add('clickTab', (dataCy) => {
  cy.get(`[data-cy="${dataCy}"]`).should('be.visible').click();
});
