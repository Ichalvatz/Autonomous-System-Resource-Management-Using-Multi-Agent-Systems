/**
 * @fileoverview Context Providers Barrel Export Module.
 * 
 * This module serves as a centralized export point for all React context
 * providers and their associated hooks. It simplifies imports throughout
 * the application by allowing consumers to import from a single location.
 * 
 * Available contexts:
 * - AuthContext: Manages user authentication state (login, logout, user data)
 * - ThemeContext: Manages application theme (light/dark mode)
 * 
 * @module context
 * @example
 * // Import providers for wrapping the application
 * import { AuthProvider, ThemeProvider } from './context';
 * 
 * @example
 * // Import hooks for consuming context in components
 * import { useAuthContext, useThemeContext } from './context';
 */

// Authentication context exports
// Provides user authentication state and methods (login, logout, registration)
export { AuthProvider, useAuthContext } from './AuthContext.jsx';

// Theme context exports
// Provides theme state and toggle functionality for light/dark mode
export { ThemeProvider, useThemeContext } from './ThemeContext.jsx';

