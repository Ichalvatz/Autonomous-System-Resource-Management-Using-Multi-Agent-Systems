# Frontend Architecture

This document provides a detailed overview of the frontend architecture, design patterns, and project structure.

---

## 📂 Project Structure

This frontend follows React best practices with clear separation of concerns:

```
software-engineering-2-frontend/
├── public/                        # Static assets
│   └── index.html                 # HTML template
│
├── src/                           # Source code
│   ├── api/                       # API integration layer
│   │   ├── apiClient.js           # Axios instance with interceptors
│   │   └── index.js               # API endpoint functions
│   │
│   ├── components/                # Reusable UI components
│   │   ├── ErrorMessage.jsx       # Error display component
│   │   ├── Header.jsx             # Application header/navbar
│   │   ├── LanguageSwitcher.jsx   # Language selection component
│   │   ├── Loading.jsx            # Loading spinner component
│   │   ├── PlaceCard.jsx          # Place display card
│   │   └── ui/                    # Base UI components
│   │       ├── Alert.jsx          # Alert/notification component
│   │       ├── Badge.jsx          # Badge component
│   │       ├── Button.jsx         # Button component
│   │       ├── Card.jsx           # Card container component
│   │       ├── EmptyState.jsx     # Empty state component
│   │       ├── Icon.jsx           # Icon wrapper component
│   │       ├── Input.jsx          # Input field component
│   │       └── Spinner.jsx        # Spinner component
│   │
│   ├── context/                   # React Context providers
│   │   ├── AuthContext.jsx        # Authentication state management
│   │   └── index.jsx              # Context exports
│   │
│   ├── hooks/                     # Custom React hooks
│   │   ├── useApi.js              # API call hook with loading/error states
│   │   ├── useAuth.js             # Authentication hook
│   │   └── index.js               # Hook exports
│   │
│   ├── i18n/                      # Internationalization
│   │   ├── LanguageContext.jsx    # Language state management
│   │   ├── translations.js        # Translation strings (2 languages)
│   │   └── index.js               # i18n exports
│   │
│   ├── pages/                      # Page components (9 pages)
│   │   ├── HomePage.jsx            # Landing page with featured places
│   │   ├── LoginPage.jsx           # User login
│   │   ├── SignupPage.jsx          # User registration
│   │   ├── RecommendationsPage.jsx # AI-powered recommendations
│   │   ├── PlaceDetailsPage.jsx    # Detailed place information
│   │   ├── FavouritesPage.jsx      # Favorite places management
│   │   ├── PreferencesPage.jsx     # Preference profiles management
│   │   ├── NavigationPage.jsx      # Turn-by-turn navigation
│   │   └── UserProfilePage.jsx     # User profile and settings
│   │
│   ├── router/                    # Routing configuration
│   │   ├── index.jsx              # Route definitions
│   │   └── ProtectedRoute.jsx     # Authentication guard component
│   │
│   ├── styles/                    # Global styles
│   │   ├── Auth.css               # Authentication page styles
│   │   ├── components.css         # Component styles
│   │   ├── design-tokens.css      # CSS variables and theme
│   │   └── global.css             # Global styles and resets
│   │
│   ├── utils/                     # Utility functions
│   │   ├── constants.js           # Application constants
│   │   ├── formatters.js          # Data formatting utilities
│   │   ├── helpers.js             # General helper functions
│   │   ├── validationSchemas.js   # Yup validation schemas
│   │   ├── validators.js          # Custom validation functions
│   │   └── index.js               # Utility exports
│   │
│   ├── App.css                    # Root component styles
│   ├── App.js                     # Root component
│   ├── index.css                  # Global CSS imports
│   └── index.js                   # Application entry point
│
├── cypress/                         # End-to-end tests
│   ├── e2e/                         # Test specifications
│   │   ├── auth_happy_unhappy.cy.js # Authentication tests
│   │   ├── happy_paths.cy.js        # Happy path user journeys
│   │   └── unhappy_paths.cy.js      # Error handling tests
│   ├── fixtures/                    # Test data
│   ├── screenshots/                 # Test failure screenshots
│   └── support/                     # Cypress support files
│
├── .github/                   # GitHub configuration
│   └── workflows/             # CI/CD pipeline definitions
│       └── frontend-cicd.yml  # GitHub Actions workflow
│
├── cypress.config.js          # Cypress configuration
├── package.json               # Dependencies and scripts
├── .env.example               # Environment variables template
└── start.sh                   # Quick start script for Bash
```

---

## 🏗️ Architecture Patterns

### Component-Based Architecture

The application is built with reusable, maintainable React components:

```
┌─────────────────────────────────────┐
│          App Component               │
│    (Root, routing, providers)        │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          Page Components             │
│      (9 pages, route handling)       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Feature Components             │
│   (PlaceCard, Header, etc.)          │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│         UI Components                │
│  (Button, Input, Card, etc.)         │
└──────────────────────────────────────┘
```

**Benefits:**
- Reusable components across pages
- Easy to maintain and test
- Clear component hierarchy
- Consistent UI/UX

---

### Context API for State Management

Centralized state management using React Context:

- **AuthContext**: User authentication state, login/logout functions
- **LanguageContext**: Current language, translation functions

**Benefits:**
- No prop drilling
- Global state accessible anywhere
- Easy to test
- Native React solution

---

### Custom Hooks

Reusable logic extracted into custom hooks:

- **`useAuth`**: Authentication state and functions
- **`useApi`**: API calls with loading/error states
- **`useLanguage`**: Translation and language switching

**Example: `useApi` Hook**
```javascript
const { data, loading, error, execute } = useApi();

// Automatically handles loading states and errors
useEffect(() => {
  execute(() => api.getPlaces());
}, []);
```

---

### Protected Routes

Route guards prevent unauthorized access:

```javascript
<ProtectedRoute>
  <UserProfilePage />
</ProtectedRoute>
```

**Features:**
- Redirects unauthenticated users to login
- Preserves intended destination
- Automatic token verification

---

### API Abstraction Layer

Centralized API client with interceptors:

**`apiClient.js`** features:
- Automatic authentication token injection
- Request/response interceptors
- Centralized error handling
- Base URL configuration

**Example:**
```javascript
// All API calls go through the client
import api from './api';

const places = await api.getPlaces();
```

---

## 🎨 Application Pages

The application consists of **9 main pages**:

### Public Pages (No Authentication Required)

| Page | Route | Description |
|------|-------|-------------|
| **Home** | `/` | Landing page with featured places |
| **Login** | `/login` | User authentication |
| **Signup** | `/signup` | User registration |

### Protected Pages (Authentication Required)

| Page | Route | Description |
|------|-------|-------------|
| **Recommendations** | `/recommendations` | AI-powered recommendations |
| **Place Details** | `/places/:placeId` | Detailed place information |
| **Favorites** | `/favourites` | Favorite places management |
| **Preferences** | `/preferences` | Preference profiles |
| **Navigation** | `/navigation` | Turn-by-turn directions |
| **User Profile** | `/profile` | Profile and settings |

---

## 🎭 Form Handling & Validation

### Formik + Yup Integration

All forms use Formik for state management and Yup for validation:

**Benefits:**
- Declarative form handling
- Built-in error messages
- Easy validation
- Reduced boilerplate

**Example:**
```javascript
<Formik
  initialValues={{ email: '', password: '' }}
  validationSchema={loginSchema}
  onSubmit={handleLogin}
>
  <Form>
    <Field name="email" component={Input} />
    <ErrorMessage name="email" />
  </Form>
</Formik>
```

---

## 🎨 Styling Architecture

### CSS Architecture

- **Design Tokens** (`design-tokens.css`): CSS variables for consistent theming
- **Global Styles** (`global.css`): Resets and base styles
- **Component Styles**: Co-located with components
- **Page Styles**: Page-specific styles

### Design Tokens

```css
:root {
  /* Colors */
  --primary: #1976d2;
  --secondary: #dc004e;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  
  /* Typography */
  --font-body: 'Roboto', sans-serif;
}
```

### Responsive Design

Mobile-first approach with CSS Grid and Flexbox:
- Breakpoints defined in design tokens
- Fluid typography
- Flexible layouts

---

## 🌐 Internationalization (i18n)

### Language Support

The application supports **2 languages**:
- 🇬🇧 English (en)
- 🇬🇷 Greek (el)

### Translation Architecture

**`translations.js`** structure:
```javascript
{
  en: {
    common: { ... },
    pages: { ... },
    components: { ... }
  },
  el: { ... }
}
```

**Usage:**
```javascript
const { t } = useLanguage();
<h1>{t('pages.home.title')}</h1>
```

---

## 🔐 Authentication Flow

### JWT Token Management

1. **Login/Signup**: Receive JWT token from backend
2. **Storage**: Store token in localStorage
3. **Auto-injection**: `apiClient` adds token to all requests
4. **Verification**: Protected routes check token validity
5. **Logout**: Clear token and redirect

### Authentication Context

```javascript
const { user, login, logout, isAuthenticated } = useAuth();
```

**Features:**
- Automatic token refresh
- Persistent sessions
- Secure logout

---

## 🧪 Testing Architecture

### End-to-End Testing with Cypress

Comprehensive E2E testing covering all user journeys:

```
cypress/
├── e2e/
│   ├── auth_happy_unhappy.cy.js    # 15+ auth tests
│   ├── happy_paths.cy.js           # 30+ user journey tests
│   └── unhappy_paths.cy.js         # 20+ error handling tests
├── fixtures/                        # Test data
├── screenshots/                     # Failure screenshots
└── support/                         # Helper functions
```

**Test Coverage:**
- Authentication flows
- All 9 pages
- Form validation
- Error handling
- Navigation
- API integration

📖 **For detailed testing documentation, see:** [../cypress/README.md](../cypress/README.md)

---

## 🛠️ Technology Stack

### Core Technologies
- **React** 18.2 - Modern UI library with hooks
- **React Router** 6.20 - Client-side routing
- **Axios** 1.6.2 - HTTP client

### Form Management & Validation
- **Formik** 2.4.5 - Form state management
- **Yup** 1.3.3 - Schema validation

### Styling
- **CSS3** - Modern CSS with Grid and Flexbox
- **Design Tokens** - CSS variables for theming
- **Responsive Design** - Mobile-first approach

### Testing
- **Cypress** 15.7.0 - E2E testing framework

### Build Tools
- **React Scripts** 5.0.1 - Zero-config build system
- **Babel** - JavaScript transpilation
- **ESLint** - Code quality enforcement

### Development Tools
- **PropTypes** - Runtime type checking
- **Hot Module Replacement** - Instant feedback

---

## 📁 Code Organization

### Feature-Based Structure

Components organized by feature rather than type:

**Benefits:**
- Easy to find related code
- Clear feature boundaries
- Scalable structure

### Naming Conventions

- **Components**: PascalCase (e.g., `PlaceCard.jsx`)
- **Hooks**: camelCase with `use` prefix (e.g., `useAuth.js`)
- **Utilities**: camelCase (e.g., `formatDate.js`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `API_BASE_URL`)

---

## 📚 Related Documentation

- [Getting Started Guide](./getting-started.md) - Setup and installation
- [Cypress E2E Testing](../cypress/README.md) - Testing documentation
- [CI/CD Pipeline](../.github/workflows/README.md) - Deployment automation
- [Backend API](https://github.com/fraidakis/software-engineering-2-backend) - API documentation
