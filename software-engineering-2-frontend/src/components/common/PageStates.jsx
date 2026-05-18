/**
 * Page State Components
 * 
 * Reusable loading and error state components for consistent UX.
 * 
 * @module components/common/PageStates
 */

import React from 'react';
import { Spinner, Icon, Button } from '../ui';

/**
 * Loading state component
 * Displays a centered loading spinner with message
 * 
 * @param {Object} props - Component props
 * @param {Function} props.t - Translation function
 * @returns {React.ReactElement} Loading state UI
 */
export const LoadingState = ({ t }) => (
  <div className="place-details-page">
    <div className="container">
      <div className="loading-state">
        <Spinner size="lg" />
        <p>{t('loadingDetails')}</p>
      </div>
    </div>
  </div>
);

/**
 * Error state component
 * Displays an error message with a back button
 * 
 * @param {Object} props - Component props
 * @param {Function} props.t - Translation function
 * @param {string} props.error - Error message to display
 * @param {Function} props.onBack - Back button click handler
 * @returns {React.ReactElement} Error state UI
 */
export const ErrorState = ({ t, error, onBack }) => (
  <div className="place-details-page">
    <div className="container">
      <div className="error-state">
        <Icon name="alert" size="2xl" />
        <h3>{t('placeNotFound')}</h3>
        <p>{error}</p>
        <Button variant="primary" onClick={onBack}>
          {t('back')}
        </Button>
      </div>
    </div>
  </div>
);
