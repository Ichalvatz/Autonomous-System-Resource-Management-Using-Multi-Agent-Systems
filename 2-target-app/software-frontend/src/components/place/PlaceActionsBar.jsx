/**
 * @fileoverview Place action buttons bar component.
 * Favourite, dislike, and navigate actions for place details.
 * @module components/place/PlaceActionsBar
 */

import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Action buttons bar for place details page (favourite, dislike, navigate)
 */
const PlaceActionsBar = ({
    t, place, isFavourite, isDisliked, toggleFavourite, toggleDisliked
}) => (
    <div className="place-actions-bar animate-fadeInUp" data-cy="place-actions">
        <button data-cy="btn-favourite" onClick={toggleFavourite}
            className={`action-btn action-btn-favourite ${isFavourite ? 'active' : ''}`}
            title={isFavourite ? t('removeFromFavourites') : t('addToFavourites')}>
            <span className="action-icon">{isFavourite ? '💔' : '❤️'}</span>
            <span className="action-label">{isFavourite ? t('removeFromFavourites') : t('addToFavourites')}</span>
        </button>
        <button data-cy="btn-dislike" onClick={toggleDisliked}
            className={`action-btn action-btn-dislike ${isDisliked ? 'active' : ''}`}
            title={isDisliked ? t('removeFromDisliked') : t('addToDisliked')}>
            <span className="action-icon">{isDisliked ? '👍' : '👎'}</span>
            <span className="action-label">{isDisliked ? t('removeFromDisliked') : t('addToDisliked')}</span>
        </button>
        <Link to={`/navigation?lat=${place.latitude}&lng=${place.longitude}&dest=${encodeURIComponent(place.name)}`}
            className="action-btn action-btn-navigate">
            <span className="action-icon">🧭</span><span className="action-label">{t('getRoute')}</span>
        </Link>
    </div>
);

export default PlaceActionsBar;
