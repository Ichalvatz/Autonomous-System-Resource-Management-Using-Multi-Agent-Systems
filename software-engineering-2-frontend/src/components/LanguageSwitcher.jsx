/**
 * @fileoverview Language Switcher Component for internationalization support.
 * 
 * Provides a button that allows users to toggle between English and Greek
 * languages in the application. Uses the translation context to manage
 * the current language state.
 * 
 * @module components/LanguageSwitcher
 * @requires react
 * @requires ../i18n - Translation context and hooks
 */

import React from 'react';
import { useTranslation } from '../i18n';
import './LanguageSwitcher.css';

/**
 * LanguageSwitcher Component
 * 
 * A button component that toggles the application language between
 * English (EN) and Greek (EL). The button displays the opposite language
 * code from the currently active language, indicating what language
 * the user will switch to upon clicking.
 * 
 * @component
 * @example
 * // Basic usage in a navigation bar
 * <LanguageSwitcher />
 * 
 * @returns {React.ReactElement} A styled button for language toggling
 * 
 * @see {@link module:i18n/LanguageContext} for language context implementation
 */
const LanguageSwitcher = () => {
  // Get current language and toggle function from translation context
  const { language, toggleLanguage } = useTranslation();

  return (
    <button
      className="language-switcher"
      onClick={toggleLanguage}
      aria-label="Change language"
    >
      {/* Globe emoji followed by the target language code */}
      {/* Shows 'EL' when current language is English, 'EN' when Greek */}
      🌐 {language === 'en' ? 'EL' : 'EN'}
    </button>
  );
};

export default LanguageSwitcher;

