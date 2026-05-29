/**
 * @fileoverview Internationalization (i18n) Barrel Export Module.
 * 
 * This module serves as the centralized export point for all internationalization
 * functionality in the application. It provides access to the language context,
 * translation hook, and translation data.
 * 
 * Available exports:
 * - LanguageProvider: Context provider for wrapping components that need translation
 * - useTranslation: Hook for accessing current language and translation functions
 * - translations: Object containing all translated strings for supported languages
 * 
 * Supported languages:
 * - English (en)
 * - Greek (el)
 * 
 * @module i18n
 * @example
 * // Wrap your app with LanguageProvider
 * import { LanguageProvider } from './i18n';
 * <LanguageProvider><App /></LanguageProvider>
 * 
 * @example
 * // Use translations in a component
 * import { useTranslation } from './i18n';
 * const { t, language } = useTranslation();
 */

// Language context and hook exports
// LanguageProvider wraps the app to provide translation context
// useTranslation hook provides access to translation functions and current language
export { LanguageProvider, useTranslation } from './LanguageContext';

// Translation data exports
// Contains all translated strings organized by language code
export { translations } from './translations';

