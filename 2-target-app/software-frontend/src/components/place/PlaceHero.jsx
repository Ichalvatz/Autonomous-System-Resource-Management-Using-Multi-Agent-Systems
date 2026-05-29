/**
 * Place Hero Component
 * 
 * Hero section for place details page displaying place name, category, location, and rating.
 * 
 * @module components/place/PlaceHero
 */

import React from 'react';
import { Icon, Badge } from '../ui';

/**
 * PlaceHero Component
 * Displays the hero section of a place details page
 * 
 * @param {Object} props - Component props
 * @param {Object} props.place - Place object
 * @param {number|null} props.averageRating - Average rating value
 * @param {number} props.reviewsCount - Number of reviews
 * @param {Function} props.onBack - Back button handler
 * @param {Function} props.t - Translation function
 * @returns {React.ReactElement} Place hero section
 */
const PlaceHero = ({ place, averageRating, reviewsCount, onBack, t }) => {
  return (
    <div className="place-hero">
      <div className="place-hero-overlay"></div>
      <div className="container">
        <div className="place-hero-content animate-fadeInUp">
          {/* Back navigation button */}
          <button type="button" className="back-link" onClick={onBack}>
            <Icon name="arrow" size="md" style={{ transform: 'rotate(180deg)' }} />
            {t('back')}
          </button>
          
          {/* Category badge display */}
          <div className="place-category-badge">
            <Badge variant="accent" size="lg">
              {t(place.category) || place.category}
            </Badge>
          </div>
          
          {/* Place title */}
          <h1 className="place-title" data-cy="place-title">
            {place.name}
          </h1>
          
          {/* Meta information: location and rating */}
          <div className="place-meta">
            <span className="meta-item">
              <span className="meta-icon">📍</span>
              {place.city}, {place.country}
            </span>
            <span className="meta-item meta-item--rating">
              <span className="meta-icon">⭐</span>
              <span className="rating-value">
                {averageRating ? averageRating.toFixed(1) : 'N/A'}
              </span>
              <span className="rating-count">
                ({reviewsCount} {t('reviews')})
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PlaceHero;
