import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import Badge from './ui/Badge';
import Icon from './ui/Icon';
import './PlaceCard.css';

import useCardTilt from '../hooks/useCardTilt';

/**
 * Category-based image URLs from Unsplash
 * Using static URLs for consistent, high-quality travel imagery
 */
const CATEGORY_IMAGES = {
  MUSEUM: 'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=400&h=250&fit=crop&q=80',
  RESTAURANT: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=250&fit=crop&q=80',
  BEACH: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400&h=250&fit=crop&q=80',
  MONUMENT: 'https://images.unsplash.com/photo-1555993539-1732b0258235?w=400&h=250&fit=crop&q=80',
  PARK: 'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=400&h=250&fit=crop&q=80',
  CAFE: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=400&h=250&fit=crop&q=80',
  BAR: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=400&h=250&fit=crop&q=80',
  HOTEL: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=250&fit=crop&q=80',
  SHOPPING: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=250&fit=crop&q=80',
  ENTERTAINMENT: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=250&fit=crop&q=80',
  CULTURE: 'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=400&h=250&fit=crop&q=80',
  NIGHTLIFE: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&h=250&fit=crop&q=80',
  CLUB: 'https://images.unsplash.com/photo-1571204829887-3b8d69e4094d?w=400&h=250&fit=crop&q=80',
  NATURE: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400&h=250&fit=crop&q=80',
  HISTORICAL: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=400&h=250&fit=crop&q=80',
  DEFAULT: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=400&h=250&fit=crop&q=80',
};

/**
 * PlaceCard Component - Enhanced Version
 * Displays place information in a beautiful, interactive card with images
 */
const PlaceCard = ({ place, showDistance = false }) => {
  const {
    placeId,
    id,
    name,
    category,
    city,
    country,
    description,
    rating,
    distance,
    reviews,
  } = place || {};

  const { ref, style } = useCardTilt();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Get category-based image URL
  const getCategoryImage = (cat) => {
    return CATEGORY_IMAGES[cat] || CATEGORY_IMAGES.DEFAULT;
  };

  // Calculate average rating from reviews if available
  const calculateAverageRating = () => {
    // If reviews array exists (even if empty), use it as the source of truth
    if (reviews && Array.isArray(reviews)) {
      if (reviews.length > 0) {
        const sum = reviews.reduce((acc, review) => acc + (review.rating || 0), 0);
        return sum / reviews.length;
      }
      // Empty reviews array means no reviews = no rating
      return null;
    }
    // No reviews array at all - fall back to static rating (legacy/unsupported)
    return rating;
  };

  const displayRating = calculateAverageRating();

  // Sanitize text content
  const safeText = (text) =>
    (text || '').toString().replace(/[<>]/g, c => (c === '<' ? '\u003C' : '\u003E'));

  const displayName = safeText(name);
  const displayCity = safeText(city);
  const displayCountry = safeText(country);
  const displayDescription = safeText(description);
  const resolvedId = placeId || id;

  // Validate ID
  if (!resolvedId) {
    console.warn('PlaceCard received place without valid ID:', place);
    return null;
  }

  // Category icon mapping
  const getCategoryIcon = (cat) => {
    const iconMap = {
      'MUSEUM': 'museum',
      'RESTAURANT': 'restaurant',
      'BEACH': 'beach',
      'MONUMENT': 'monument',
      'PARK': 'park',
      'CAFE': 'cafe',
      'BAR': 'bar',
      'HOTEL': 'hotel',
      'SHOPPING': 'shopping',
      'ENTERTAINMENT': 'entertainment',
    };
    return iconMap[cat] || 'location';
  };

  // Format rating
  const formatRating = (rating) => {
    if (typeof rating !== 'number' || isNaN(rating)) {
      return <span className="rating-value-na">N/A</span>;
    }
    return <span className="rating-value">{rating.toFixed(1)}</span>;
  };

  return (
    <Link
      to={`/places/${resolvedId}`}
      className="place-card"
      aria-label={`View details for ${displayName}`}
      data-cy="place-card"
      data-place-id={resolvedId}
      ref={ref}
      style={style}
    >
      {/* Card Image */}
      <div className="place-card-image-container">
        {!imageError ? (
          <>
            {!imageLoaded && (
              <div className="place-image-skeleton">
                <Icon name={getCategoryIcon(category)} size="2xl" />
              </div>
            )}
            <img
              src={getCategoryImage(category)}
              alt={displayName}
              className={`place-card-image ${imageLoaded ? 'loaded' : ''}`}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </>
        ) : (
          <div className="place-image-fallback">
            <Icon name={getCategoryIcon(category)} size="2xl" />
          </div>
        )}
        {/* Popular/Trending Badge */}
        {displayRating && displayRating >= 4.5 && (
          <div className="place-popular-badge">
            🔥 Popular
          </div>
        )}
        <div className="place-card-badge">
          <Badge variant="primary" size="base" data-cy="place-category">
            {category || 'Place'}
          </Badge>
        </div>
      </div>

      {/* Card Body */}
      <div className="place-card-body">
        <h3 className="place-name" data-cy="place-name">{displayName || 'Unnamed Place'}</h3>

        <div className="place-location">
          <Icon name="location" size="sm" className="place-location-icon" />
          <span>{displayCity}, {displayCountry}</span>
        </div>

        {displayDescription && (
          <p className="place-description">{displayDescription}</p>
        )}
      </div>

      {/* Card Footer */}
      <div className="place-card-footer">
        <div className="place-rating">
          <Icon name="star" size="lg" className="rating-stars" />
          {formatRating(displayRating)}
        </div>

        {showDistance && distance && (
          <div className="place-distance">
            <Icon name="navigation" size="sm" className="place-distance-icon" />
            <span>{distance.toFixed(1)} km</span>
          </div>
        )}
      </div>
    </Link>
  );
};

PlaceCard.propTypes = {
  place: PropTypes.shape({
    placeId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string,
    category: PropTypes.string,
    city: PropTypes.string,
    country: PropTypes.string,
    description: PropTypes.string,
    rating: PropTypes.number,
    distance: PropTypes.number,
    reviews: PropTypes.array,
  }).isRequired,
  showDistance: PropTypes.bool,
};

export default PlaceCard;
