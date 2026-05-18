/**
 * @fileoverview Main entry point for the MyWorld React application.
 * 
 * This file is responsible for bootstrapping the React application by:
 * - Importing necessary dependencies and stylesheets
 * - Setting up the React root element
 * - Wrapping the application with required context providers
 * - Rendering the application in React Strict Mode for development checks
 * 
 * @module main
 * @requires react
 * @requires react-dom/client
 * @requires leaflet - Map library styles for navigation features
 * @requires ./App - Root application component
 * @requires ./context - Authentication context provider
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

// Third-party library styles
// Leaflet CSS is required for map components in navigation features
import 'leaflet/dist/leaflet.css';

// Application styles - imported in order of specificity
// Design tokens define CSS custom properties (colors, spacing, typography)
import './styles/design-tokens.css';
// Global styles apply base styling and resets
import './styles/global.css';
// Component styles provide reusable component-level styling
import './styles/components.css';
// Index CSS contains any additional application-wide styles
import './index.css';

// Application components
import App from './App.jsx';

// Context providers for global state management
// AuthProvider manages user authentication state throughout the app
import { AuthProvider } from './context';

/**
 * Creates the React root and renders the application.
 * 
 * The application is wrapped in:
 * 1. React.StrictMode - Enables additional development checks and warnings
 *    for detecting potential problems (double-rendering, deprecated APIs, etc.)
 * 2. AuthProvider - Provides authentication context to all child components,
 *    enabling access to user state, login/logout functions, and auth status
 * 
 * @see {@link https://react.dev/reference/react/StrictMode} React Strict Mode
 */
const root = ReactDOM.createRoot(document.getElementById('root'));

// Render the application tree
root.render(
  <React.StrictMode>
    {/* AuthProvider wraps App to provide authentication context globally */}
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);

