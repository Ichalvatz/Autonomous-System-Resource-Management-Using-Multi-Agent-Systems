import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from '../i18n';
import './ErrorMessage.css';

/**
 * ErrorMessage Component
 * Displays error messages with consistent styling
 */
const ErrorMessage = ({ message, onRetry }) => {
  const { t } = useTranslation();
  return (
    <div className="error-card">
      <div className="error-icon">⚠️</div>
      <p className="error-message">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-primary retry-btn">
          {t('tryAgain')}
        </button>
      )}
    </div>
  );
};

ErrorMessage.propTypes = {
  message: PropTypes.string.isRequired,
  onRetry: PropTypes.func,
};

export default ErrorMessage;
