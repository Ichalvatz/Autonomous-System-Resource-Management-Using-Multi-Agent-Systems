/**
 * Place Info Card Component
 * 
 * Information card displaying place address and description.
 * 
 * @module components/place/PlaceInfoCard
 */

import React from 'react';
import { Icon } from '../ui';

/**
 * PlaceInfoCard Component
 * Displays place information including address, description, and report option
 * 
 * @param {Object} props - Component props
 * @param {Object} props.place - Place object with address and description
 * @param {Function} props.onReport - Report button click handler
 * @param {Function} props.t - Translation function
 * @returns {React.ReactElement} Place info card
 */
const PlaceInfoCard = ({ place, onReport, t }) => {
  return (
    <div className="place-info-card" data-cy="place-description-card">
      <h2>
        <Icon name="info" size="sm" />
        {t('information')}
      </h2>
      
      <div className="place-address-row">
        <span className="info-icon">📍</span>
        <span className="info-value">{place.address}</span>
      </div>
      
      <div className="place-description-text">
        <p>{place.description}</p>
      </div>
      
      {/* Report button for flagging inappropriate content */}
      <button onClick={onReport} className="report-link">
        <Icon name="alert" size="xs" />
        {t('report')}
      </button>
    </div>
  );
};

export default PlaceInfoCard;
