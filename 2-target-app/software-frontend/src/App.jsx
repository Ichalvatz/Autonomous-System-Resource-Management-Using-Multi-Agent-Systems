/**
 * @fileoverview Root Application Component.
 * 
 * This is the main application component that sets up the entire application
 * structure including:
 * - Context providers (Theme, Language, Toast)
 * - React Router configuration
 * - Layout structure (Header, Main, Footer, Bottom Navigation)
 * - Authentication state management
 * 
 * The component hierarchy ensures all child components have access to:
 * - Theme context for light/dark mode
 * - Language context for i18n translations
 * - Toast context for notifications
 * - Router context for navigation
 * 
 * @module App
 * @requires react
 * @requires react-router-dom
 * @requires ./i18n - Language provider
 * @requires ./context - Theme provider
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { LanguageProvider } from './i18n';
import { ThemeProvider } from './context';
import { ToastProvider, BottomNavigation } from './components/ui';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import AppRoutes from './router/index.jsx';
import './App.css';

/**
 * App Component
 * 
 * The root component that wraps the entire application with necessary
 * providers and sets up the main layout structure. Tracks authentication
 * state for conditional rendering of navigation elements.
 * 
 * Provider hierarchy (outermost to innermost):
 * 1. ThemeProvider - Dark/light mode
 * 2. LanguageProvider - Internationalization
 * 3. ToastProvider - Notification system
 * 4. Router - Navigation
 * 
 * @function App
 * @returns {React.ReactElement} The complete application structure
 */
function App() {
  // Track user authentication state for conditional UI
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  /**
   * Sets up authentication state tracking on mount.
   * Listens for login/logout events and storage changes.
   */
  useEffect(() => {
    // Check for existing token on mount
    const token = localStorage.getItem('token');
    setIsAuthenticated(!!token);

    // Event handlers for auth state changes
    const handleLogin = () => setIsAuthenticated(true);
    const handleLogout = () => setIsAuthenticated(false);

    // Listen for custom login/logout events
    window.addEventListener('user:login', handleLogin);
    window.addEventListener('user:logout', handleLogout);

    // Listen for storage changes (handles logout from other tabs)
    window.addEventListener('storage', (e) => {
      if (e.key === 'token') {
        setIsAuthenticated(!!e.newValue);
      }
    });

    // Cleanup event listeners on unmount
    return () => {
      window.removeEventListener('user:login', handleLogin);
      window.removeEventListener('user:logout', handleLogout);
    };
  }, []);

  return (
    // Theme provider for dark/light mode support
    <ThemeProvider>
      {/* Language provider for internationalization */}
      <LanguageProvider>
        {/* Toast provider for notification system */}
        <ToastProvider>
          {/* React Router for client-side navigation */}
          <Router>
            {/* Scroll restoration on route change */}
            <ScrollToTop />
            <div className="App">
              {/* Site header with navigation */}
              <Header />
              {/* Main content area with routes */}
              <main className="main-content">
                <AppRoutes />
              </main>
              {/* Site footer */}
              <Footer />
              {/* Mobile bottom navigation bar */}
              <BottomNavigation isAuthenticated={isAuthenticated} />
            </div>
          </Router>
        </ToastProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;

