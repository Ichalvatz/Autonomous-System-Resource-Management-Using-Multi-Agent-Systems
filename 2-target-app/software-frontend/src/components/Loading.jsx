import React from 'react';
import PropTypes from 'prop-types';
import { useTranslation } from '../i18n';
import './Loading.css';

/**
 * Loading Component
 * Displays a loading spinner with optional message
 */
const LoadingSpinner3D = React.lazy(() => import('./ui/LoadingSpinner3D'));

/**
 * Loading Component
 * Displays a loading spinner with optional message
 */
const Loading = ({ message }) => {
  const { t } = useTranslation();
  const displayMessage = message || t('loading');

  return (
    <div className="loading">
      <div className="loading-spinner-container" style={{ width: '100px', height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <React.Suspense fallback={<div className="loading-spinner"></div>}>
          <LoadingSpinner3D />
        </React.Suspense>
      </div>
      <p>{displayMessage}</p>
    </div>
  );
};

Loading.propTypes = {
  message: PropTypes.string,
};

export default Loading;
