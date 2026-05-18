/**
 * @fileoverview Recommendation filters component.
 * Location, distance, and sort controls for recommendations page.
 * @module components/recommendations/RecommendationFilters
 */

import React from 'react';
import { Button, Icon, AutocompleteInput } from '../ui';
import { searchLocations } from '../../utils/geocoding';

/**
 * Filters component for recommendations page
 */
const RecommendationFilters = ({
    t,
    showFilters,
    setShowFilters,
    locationName,
    onLocationChange,
    onLocationSelect,
    pendingMaxDistance,
    onDistanceChange,
    sortBy,
    onSortChange,
    onApplyFilters,
}) => {
    return (
        <div className="filters-section">
            <button className="filters-toggle" onClick={() => setShowFilters(!showFilters)}>
                <span>{t('filtersTitle')}</span>
                <Icon name={showFilters ? 'chevronUp' : 'chevronDown'} size="sm" />
            </button>

            <div className={`filters-bar ${showFilters ? 'filters-bar--open' : ''}`}>
                <div className="filters-inline">
                    <div className="filter-group filter-group--location">
                        <label className="filter-label">{t('location')}</label>
                        <AutocompleteInput
                            name="location"
                            value={locationName}
                            onChange={onLocationChange}
                            onSelect={onLocationSelect}
                            searchFn={searchLocations}
                            placeholder={t('searchLocationPlaceholder') || 'e.g., Athens, Greece'}
                            icon={null}
                        />
                    </div>
                    <div className="filter-group filter-group--distance">
                        <label className="filter-label">{t('maxDistance')} (km)</label>
                        <input
                            type="number"
                            name="maxDistance"
                            value={pendingMaxDistance}
                            onChange={onDistanceChange}
                            className="filter-input"
                            min="1"
                            max="500"
                        />
                    </div>
                    <div className="filter-group filter-group--sort">
                        <label className="filter-label">{t('sortBy')}</label>
                        <select value={sortBy} onChange={onSortChange} className="filter-select">
                            <option value="distance">{t('sortByDistance')}</option>
                            <option value="rating">{t('sortByRating')}</option>
                        </select>
                    </div>
                    <div className="filter-group filter-group--action">
                        <Button onClick={onApplyFilters} className="apply-filters-btn">
                            {t('applyFilters')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RecommendationFilters;
