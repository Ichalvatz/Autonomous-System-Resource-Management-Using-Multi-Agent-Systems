import React from 'react';
import PropTypes from 'prop-types';
import './PlaceCardSkeleton.css';

/**
 * PlaceCardSkeleton Component - Loading placeholder matching PlaceCard structure
 * Provides a smoother loading experience than a spinner
 * 
 * @example
 * <PlaceCardSkeleton />
 * <PlaceCardSkeleton count={3} />
 */
const PlaceCardSkeleton = ({ count = 1 }) => {
    return (
        <>
            {[...Array(count)].map((_, index) => (
                <div
                    key={index}
                    className="place-card-skeleton"
                    aria-hidden="true"
                    style={{ animationDelay: `${index * 0.1}s` }}
                >
                    {/* Header */}
                    <div className="skeleton-header">
                        <div className="skeleton-icon skeleton-shimmer" />
                        <div className="skeleton-badge skeleton-shimmer" />
                    </div>

                    {/* Body */}
                    <div className="skeleton-body">
                        <div className="skeleton-title skeleton-shimmer" />
                        <div className="skeleton-location skeleton-shimmer" />
                        <div className="skeleton-description">
                            <div className="skeleton-line skeleton-shimmer" />
                            <div className="skeleton-line skeleton-line--short skeleton-shimmer" />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="skeleton-footer">
                        <div className="skeleton-rating skeleton-shimmer" />
                        <div className="skeleton-distance skeleton-shimmer" />
                    </div>
                </div>
            ))}
        </>
    );
};

PlaceCardSkeleton.propTypes = {
    count: PropTypes.number,
};

export default PlaceCardSkeleton;
