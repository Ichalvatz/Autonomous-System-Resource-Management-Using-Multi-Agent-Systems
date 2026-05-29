# 🧪 Cypress E2E Testing Documentation

Comprehensive end-to-end testing suite for the myWorld Travel frontend application using Cypress.

## 📋 Overview

This testing suite validates the complete user experience across all 9 pages of the application, ensuring functionality, navigation, and error handling work correctly in real-world scenarios.

### Test Suite Summary

| Category | Test File | Tests | Description |
|----------|-----------|-------|-------------|
| **Authentication** | `auth_happy_unhappy.cy.js` | 15+ | Login, signup, logout flows with validation |
| **Happy Paths** | `happy_paths.cy.js` | 30+ | Complete successful user journeys |
| **Unhappy Paths** | `unhappy_paths.cy.js` | 20+ | Error handling and validation |

**Total Tests**: 65+ E2E tests covering all critical user flows

### Testing Approach

- ✅ **Real Browser Testing**: Tests run in actual browsers (Chrome, Firefox, Edge)
- ✅ **Full Stack Integration**: Tests against live backend API
- ✅ **Visual Validation**: Screenshots captured on failures
- ✅ **Video Recording**: Full test execution recorded for debugging
- ✅ **Retry Logic**: Automatic retries for flaky network conditions
- ✅ **Custom Commands**: Reusable test utilities for authentication and navigation

## 🎯 Test Coverage

### Pages Tested (9 Total)

#### Public Pages (No Authentication Required)

1. **HomePage** (`/`)
   - Landing page display
   - Navigation to login/signup
   - Featured places display
   - Public content accessibility

2. **LoginPage** (`/login`)
   - Valid credentials authentication
   - Invalid credentials error handling
   - Form validation
   - Redirect to homepage after login

3. **SignupPage** (`/signup`)
   - New user registration
   - Email uniqueness validation
   - Password requirements
   - Automatic login after signup

#### Protected Pages (Authentication Required)

4. **RecommendationsPage** (`/recommendations`)
   - Personalized place suggestions
   - Filter by category
   - Place card interactions
   - Empty state handling

5. **PlaceDetailsPage** (`/places/:placeId`)
   - Detailed place information
   - Reviews and ratings display
   - Add review functionality
   - Add to favorites/dislikes
   - Photo gallery
   - Map location display

6. **FavouritesPage** (`/favourites`)
   - Favorite places list
   - Disliked places list
   - Remove from favorites
   - Empty state handling

7. **PreferencesPage** (`/preferences`)
   - Create preference profile
   - Edit existing profile
   - Delete profile
   - Category selection
   - Budget settings
   - Profile switching

8. **NavigationPage** (`/navigation`)
   - Route calculation
   - Multiple transportation modes
   - Distance and duration display
   - Map integration
   - Turn-by-turn directions

9. **UserProfilePage** (`/profile`)
   - View user information
   - Edit profile details
   - Update settings
   - Language preferences
   - Accessibility options


## 🎬 Test Scenarios

### Happy Path Flow 1: Login → Recommendations → Favorites

**File**: `happy_paths.cy.js`

**User Journey**:
1. ✅ Navigate to HomePage
2. ✅ Click Login button → LoginPage
3. ✅ Enter valid credentials and submit
4. ✅ Verify successful login and redirect
5. ✅ Navigate to RecommendationsPage
6. ✅ Verify personalized recommendations displayed
7. ✅ Click on a place card → PlaceDetailsPage
8. ✅ View place details, reviews, ratings
9. ✅ Click "Add to Favourites" button
10. ✅ Verify success message
11. ✅ Navigate to FavouritesPage
12. ✅ Verify place appears in favorites list

**Duration**: ~30 seconds  
**Pages Covered**: 5 (Home, Login, Recommendations, PlaceDetails, Favourites)

---

### Happy Path Flow 2: Signup → Preferences → Navigation

**File**: `happy_paths.cy.js`

**User Journey**:
1. ✅ Navigate to HomePage
2. ✅ Click Signup button → SignupPage
3. ✅ Fill registration form with unique email
4. ✅ Verify successful registration and auto-login
5. ✅ Navigate to PreferencesPage
6. ✅ Create new preference profile with categories
7. ✅ Set budget preferences
8. ✅ Verify profile saved successfully
9. ✅ Navigate to NavigationPage
10. ✅ Enter start and destination locations
11. ✅ Select transportation mode (DRIVING)
12. ✅ Click "Calculate Route"
13. ✅ Verify route with distance and duration displayed

**Duration**: ~35 seconds  
**Pages Covered**: 4 (Home, Signup, Preferences, Navigation)

---

### Unhappy Path Scenarios

**File**: `unhappy_paths.cy.js`

#### Authentication Errors
- ❌ Login with invalid credentials
- ❌ Login with missing password
- ❌ Signup with existing email
- ❌ Signup with weak password
- ❌ Signup with mismatched passwords

#### Form Validation
- ❌ Submit empty forms
- ❌ Invalid email format
- ❌ Missing required fields
- ❌ Exceeding character limits

#### Authorization
- ❌ Access protected pages without login
- ❌ Expired token handling
- ❌ Invalid token scenarios

#### API Errors
- ❌ Network failures
- ❌ 404 resource not found
- ❌ 500 server errors
- ❌ Timeout scenarios

---

### Authentication Test Suite

**File**: `auth_happy_unhappy.cy.js`

#### Happy Paths
- ✅ Successful login with valid credentials
- ✅ Successful signup with new account
- ✅ Logout functionality
- ✅ Remember me functionality
- ✅ Redirect after login

#### Unhappy Paths
- ❌ Login with wrong password
- ❌ Login with non-existent email
- ❌ Signup with duplicate email
- ❌ Form validation errors
- ❌ Session expiration handling

## 🚀 Running Tests

### Prerequisites

**1. Backend server must be running**:
```bash
cd ../software-engineering-2-backend
npm start
# Backend should be running on http://localhost:3001
```

**2. Frontend dev server must be running**:
```bash
cd software-engineering-2-frontend
npm start
# Frontend should be running on http://localhost:3000
```

### Test Execution

#### Interactive Mode (Cypress Test Runner)

Best for development and debugging:

```bash
# Open Cypress GUI
npm run cypress
```

Features:
- 🎯 Select specific tests to run
- 🔍 Real-time test execution with visual feedback
- 🐛 Time-travel debugging
- 📸 Automatic screenshots on assertions
- 🔄 Auto-reload on file changes

#### Headless Mode (CI/Command Line)

Run all tests without GUI:

```bash
# Run all E2E tests
npm run test:e2e

# Run with headed browser (see execution)
npm run test:e2e:headed

# Run in specific browser
npm run test:e2e:chrome    # Chrome
npm run test:e2e:firefox   # Firefox

# Run specific test file
npx cypress run --spec "cypress/e2e/auth_happy_unhappy.cy.js"

# Run tests matching pattern
npx cypress run --spec "cypress/e2e/*happy*.cy.js"
```

#### Advanced Options

```bash
# Run with specific viewport
npx cypress run --config viewportWidth=1920,viewportHeight=1080

# Disable video recording
npx cypress run --config video=false

# Run with specific browser
npx cypress run --browser firefox

# Run with environment variables
npx cypress run --env apiUrl=http://localhost:3001

# Run in parallel (requires Cypress Dashboard)
npx cypress run --parallel --record --key <record-key>
```

---

## 📁 Project Structure


```
cypress/
├── e2e/                              # Test specification files
│   ├── auth_happy_unhappy.cy.js     # Authentication test suite (15+ tests)
│   ├── happy_paths.cy.js            # Happy path user journeys (30+ tests)
│   └── unhappy_paths.cy.js          # Error handling scenarios (20+ tests)
│
├── fixtures/                         # Test data
│   └── test-users.json              # Pre-configured test user credentials
│
├── screenshots/                      # Auto-captured on test failures
│   └── [test-name]/                 # Organized by test file and spec name
│
├── support/                          # Custom commands and configuration
│   ├── commands.js                  # Custom Cypress commands (login, logout, etc.)
│   ├── helpers.js                   # Reusable helper functions
│   └── e2e.js                       # Support file loaded before tests
│
├── videos/                           # Auto-recorded test execution (in CI)
│   └── [test-name].mp4              # Full test run videos
│
└── cypress.config.js                 # Cypress configuration
```

## 🛠️ Configuration

### Cypress Configuration (`cypress.config.js`)

```javascript
{
  e2e: {
    baseUrl: 'http://localhost:3000',     // Frontend URL
    supportFile: 'cypress/support/e2e.js',
    specPattern: 'cypress/e2e/**/*.cy.js',
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',
    video: true,                           // Record videos
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 8000,
    pageLoadTimeout: 60000,
    requestTimeout: 10000,
    responseTimeout: 30000,
    retries: {
      runMode: 2,                          // Retry failed tests in CI
      openMode: 0                          // No retries in dev mode
    }
  },
  env: {
    apiUrl: 'http://localhost:3001'        // Backend API URL
  }
}
```

### Environment Variables

Configure via `.env.test` or `cypress.config.js`:

- `CYPRESS_BASE_URL`: Frontend application URL
- `CYPRESS_API_URL`: Backend API URL
- `CYPRESS_VIDEO`: Enable/disable video recording
- `CYPRESS_SCREENSHOT`: Enable/disable screenshots

## 🔧 Custom Commands

Located in `cypress/support/commands.js`:

### Authentication Commands

```javascript
// Login via UI
cy.login('user1@example.com', 'password123');

// Fast API-based login (bypasses UI)
cy.loginViaAPI('user1@example.com', 'password123');

// Login with test user from fixtures
cy.loginAsTestUser('validUser');

// Register new user
cy.register({
  name: 'Test User',
  email: 'test@example.com',
  password: 'Password123!',
  confirmPassword: 'Password123!'
});

// Logout
cy.logout();
```

### Token Management

```javascript
// Set JWT token
cy.setAuthToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');

// Get current token
cy.getAuthToken().then((token) => {
  // Use token
});

// Clear authentication
cy.clearAuthToken();
```

### Assertion Commands

```javascript
// Assert user is authenticated
cy.shouldBeAuthenticated();

// Assert user is not authenticated
cy.shouldNotBeAuthenticated();
```

### Helper Functions

Located in `cypress/support/helpers.js`:

```javascript
// Generate unique email
const email = generateUniqueEmail();

// Get random test user
const user = getRandomTestUser();

// Wait for API response
cy.waitForApiResponse('/api/places');

// Check if element exists
cy.elementExists('.place-card');
```

## 📊 Test Reporting

### Console Output

After test execution, Cypress displays:
- ✅ Number of tests passed
- ❌ Number of tests failed
- ⏱️ Total execution time
- 📊 Spec file summaries

### Screenshots

Screenshots are automatically captured:
- **On Failure**: Saved to `cypress/screenshots/`
- **Manual**: Use `cy.screenshot('custom-name')`
- **Organization**: Grouped by test file and spec name

### Videos

Video recordings (enabled in CI):
- **Location**: `cypress/videos/`
- **Format**: MP4
- **Content**: Full test execution from start to finish
- **Compression**: Optimized for storage

### HTML Reports (with plugins)

Install Cypress plugins for enhanced reporting:

```bash
npm install --save-dev cypress-mochawesome-reporter
```

Configure in `cypress.config.js` for detailed HTML reports.

## 🐛 Debugging Tests

### Interactive Mode Debugging

Cypress Test Runner provides powerful debugging:

1. **Time Travel**: Click on commands to see DOM snapshots
2. **Browser DevTools**: Open DevTools for full inspection
3. **Pause Execution**: Use `.pause()` to halt test execution
   ```javascript
   cy.get('.place-card').pause().click();
   ```
4. **Debug Command**: Use `.debug()` to log to console
   ```javascript
   cy.get('.place-card').debug().click();
   ```

### Console Logging

```javascript
// Log custom messages
cy.log('Checking place details page');

// Log variables
cy.get('@placeId').then((id) => {
  cy.log('Place ID:', id);
});

// Log API responses
cy.intercept('GET', '/api/places/*').as('placeRequest');
cy.wait('@placeRequest').then((interception) => {
  cy.log('API Response:', interception.response.body);
});
```

### Common Debugging Tips

1. **Add waits for dynamic content**:
   ```javascript
   cy.get('.loading-spinner').should('not.exist');
   cy.get('.place-card').should('be.visible');
   ```

2. **Use explicit waits**:
   ```javascript
   cy.wait(1000);  // Wait 1 second
   cy.wait('@apiRequest');  // Wait for API request
   ```

3. **Check element visibility**:
   ```javascript
   cy.get('.element').should('be.visible');
   cy.get('.element').should('exist');
   ```

4. **Handle flaky tests**:
   ```javascript
   // Retry assertions
   cy.get('.dynamic-content', { timeout: 10000 })
     .should('be.visible');
   
   // Use .should() with callback for complex assertions
   cy.get('.list').should(($list) => {
     expect($list).to.have.length.greaterThan(0);
   });
   ```

## 📝 Best Practices

### Test Organization

```javascript
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup before each test
    cy.visit('/');
    cy.loginAsTestUser('validUser');
  });

  afterEach(() => {
    // Cleanup after each test
    cy.clearAuthToken();
  });

  context('Happy Paths', () => {
    it('should successfully complete action', () => {
      // Test implementation
    });
  });

  context('Unhappy Paths', () => {
    it('should show error when action fails', () => {
      // Test implementation
    });
  });
});
```

### Selector Best Practices

**Preferred (Most Stable)**:
```javascript
cy.get('[data-cy="login-button"]');  // data-cy attributes
cy.get('input[name="email"]');       // Semantic attributes
cy.get('#unique-id');                // Unique IDs
```

**Acceptable**:
```javascript
cy.get('.component-specific-class');  // Component classes
cy.contains('button', 'Login');       // Text content
```

**Avoid**:
```javascript
cy.get('.btn.btn-primary.mr-2');  // Generic utility classes
cy.get('div > div > button');     // Deep nesting
```

### Async Handling

Cypress commands are automatically queued and chained:

```javascript
// ✅ Good - Cypress handles promises
cy.get('.button').click();
cy.get('.result').should('contain', 'Success');

// ❌ Bad - Don't use async/await with Cypress commands
async function testLogin() {
  await cy.get('.button').click();  // Not needed!
}
```

### Test Independence

Each test should be independent:

```javascript
// ✅ Good - Test creates own data
it('should display place details', () => {
  cy.loginAsTestUser('validUser');
  cy.visit('/places/1');
  cy.get('.place-title').should('be.visible');
});

// ❌ Bad - Test depends on previous test
it('should add to favorites', () => {
  // Assumes user is logged in from previous test
  cy.get('.favorite-button').click();
});
```

## 🚦 CI/CD Integration

### Running in CI Pipeline

Cypress tests run automatically in GitHub Actions:

```yaml
- name: Run Cypress E2E Tests
  run: npm run test:e2e
  
- name: Upload Screenshots
  if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: cypress-screenshots
    path: cypress/screenshots
    
- name: Upload Videos
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: cypress-videos
    path: cypress/videos
```

### CI-Specific Configuration

In CI environments, Cypress automatically:
- Runs in headless mode
- Records videos
- Retries failed tests (configured retries: 2)
- Generates reports

## 📚 Additional Resources

- **Cypress Documentation**: [docs.cypress.io](https://docs.cypress.io/)
- **Best Practices**: [docs.cypress.io/guides/references/best-practices](https://docs.cypress.io/guides/references/best-practices)
- **Example Tests**: See `cypress/e2e/` for implementation examples
- **API Documentation**: [Backend API Docs](../../software-engineering-2-backend/README.md)

---

## 💡 Writing New Tests

### Test Template

```javascript
describe('New Feature', () => {
  beforeEach(() => {
    cy.visit('/');
    // Setup
  });

  it('should perform expected action', () => {
    // Arrange
    cy.loginAsTestUser('validUser');
    
    // Act
    cy.get('[data-cy="action-button"]').click();
    
    // Assert
    cy.get('.result').should('contain', 'Success');
  });
});
```

### Checklist for New Tests

- [ ] Test has clear, descriptive name
- [ ] Test is independent (doesn't rely on other tests)
- [ ] Uses stable selectors (data-cy attributes preferred)
- [ ] Includes proper assertions
- [ ] Handles loading states
- [ ] Tests both success and error cases
- [ ] Cleans up after execution
- [ ] Runs reliably (not flaky)

---

**Happy Testing! 🧪✨**

For questions or issues with E2E tests, please contact the development team or open an issue on GitHub.
```javascript
cy.shouldNotBeAuthenticated();
```

### API Commands

#### `cy.stubAPI(method, url, fixture, alias)`
Stub an API endpoint:
```javascript
cy.stubAPI('GET', '/api/places', 'places', 'getPlaces');
```

#### `cy.waitForAPI(alias)`
Wait for an API request:
```javascript
cy.waitForAPI('@getPlaces');
```

## 🔨 Helper Functions

### Navigation Helpers

```javascript
import { visitHome, visitLogin, visitProfile } from '../support/helpers';

visitHome();           // Navigate to home page
visitLogin();          // Navigate to login page
visitProfile();        // Navigate to profile page
visitRecommendations(); // Navigate to recommendations
visitFavourites();     // Navigate to favourites
visitPreferences();    // Navigate to preferences
visitPlaceDetails('123'); // Navigate to place details
```

### Form Helpers

```javascript
import { fillInput, submitForm, fillLoginForm } from '../support/helpers';

fillInput('#email', 'user@example.com');
fillLoginForm('user@example.com', 'password123');
submitForm();  // Clicks the submit button
```

### Assertion Helpers

```javascript
import { 
  expectUrlToContain, 
  expectTextVisible, 
  expectElementVisible 
} from '../support/helpers';

expectUrlToContain('/dashboard');
expectTextVisible('Welcome');
expectElementVisible('.user-profile');
```

### Wait Helpers

```javascript
import { 
  waitForLoadingToFinish, 
  waitForElement,
  waitForNavigation 
} from '../support/helpers';

waitForLoadingToFinish();
waitForElement('.place-card');
waitForNavigation('/dashboard');
```

## 📝 Test Fixtures

Test user data is available in `cypress/fixtures/test-users.json`:

- **validUser**: Standard user with valid credentials
- **adminUser**: Admin user with elevated permissions
- **invalidUser**: User with incorrect credentials
- **newUser**: Template for new user registration

### Using Fixtures in Tests

```javascript
describe('Login Tests', () => {
  it('should login with valid user', () => {
    cy.fixture('test-users').then((users) => {
      const user = users.validUser;
      cy.login(user.email, user.password);
    });
  });
});

// Or use the custom command
cy.loginAsTestUser('validUser');
```

## ✍️ Writing Tests

### Basic Test Structure

```javascript
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup: runs before each test
    cy.clearLocalStorage();
    cy.visit('/');
  });

  it('should perform specific action', () => {
    // Arrange
    cy.loginAsTestUser('validUser');
    
    // Act
    cy.get('.some-button').click();
    
    // Assert
    cy.url().should('include', '/expected-page');
  });

  afterEach(() => {
    // Cleanup: runs after each test
  });
});
```

---

### Example: Testing a User Flow

```javascript
describe('Place Recommendations', () => {
  beforeEach(() => {
    cy.loginAsTestUser('validUser');
  });

  it('should display recommendations for logged-in user', () => {
    // Navigate to recommendations
    cy.visit('/recommendations');
    
    // Wait for data to load
    cy.waitForLoadingToFinish();
    
    // Assert recommendations are visible
    cy.get('.place-card').should('have.length.at.least', 1);
    
    // Click on first recommendation
    cy.get('.place-card').first().click();
    
    // Should navigate to place details
    cy.url().should('include', '/place/');
  });
});
```

## 🔄 CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  cypress-run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Install dependencies
        run: npm ci
      
      - name: Start backend server
        run: npm run start:backend &
      
      - name: Start frontend server
        run: npm start &
      
      - name: Wait for servers
        run: npx wait-on http://localhost:3000 http://localhost:3001
      
      - name: Run Cypress tests
        run: npm run test:e2e
      
      - name: Upload test artifacts
        if: failure()
        uses: actions/upload-artifact@v2
        with:
          name: cypress-screenshots-videos
          path: |
            cypress/screenshots
            cypress/videos
```

## 📚 Additional Resources

- [Cypress Documentation](https://docs.cypress.io/)
- [Cypress Best Practices](https://docs.cypress.io/guides/references/best-practices)
- [Cypress Examples](https://example.cypress.io/)
- [Cypress API Reference](https://docs.cypress.io/api/table-of-contents)

