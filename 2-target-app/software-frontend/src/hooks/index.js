/**
 * @fileoverview Custom React Hooks Barrel Export Module.
 * 
 * This module serves as a centralized export point for all custom React hooks
 * used throughout the application. It simplifies imports by allowing consumers
 * to import multiple hooks from a single location.
 * 
 * Available hooks:
 * - useAuth: Authentication hook for managing user sessions
 * - useApi: API communication hook for making HTTP requests
 * - useTheme: Theme management hook for light/dark mode toggling
 * 
 * @module hooks
 * @example
 * // Import multiple hooks in a single statement
 * import { useAuth, useApi, useTheme } from './hooks';
 */

// Authentication hook
// Provides login, logout, and authentication state management
export { useAuth } from './useAuth';

// API hook
// Provides utilities for making API requests with loading and error states
export { useApi } from './useApi';

// Theme hook
// Provides theme state and toggle functionality for theming
export { default as useTheme } from './useTheme';

