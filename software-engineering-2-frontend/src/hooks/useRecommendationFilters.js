/**
 * Recommendation Filters Hook
 * 
 * Manages recommendation filter state and location geocoding.
 * @module hooks/useRecommendationFilters
 */

import { useState, useCallback } from 'react';
import { forwardGeocode } from '../utils/geocoding';

const DEFAULT_FILTERS = {
    latitude: '37.9838',
    longitude: '23.7275',
    maxDistance: '50'
};

/**
 * Custom hook for managing recommendation filters
 * 
 * @returns {Object} Filter state and handlers
 */
export const useRecommendationFilters = () => {
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [locationName, setLocationName] = useState('Athens, Greece');
    const [pendingMaxDistance, setPendingMaxDistance] = useState('50');

    /**
     * Handles location selection from autocomplete
     */
    const handleLocationSelect = useCallback((suggestion) => {
        setLocationName(suggestion.displayName);
        setFilters(prev => ({
            ...prev,
            latitude: suggestion.lat.toString(),
            longitude: suggestion.lng.toString()
        }));
    }, []);

    /**
     * Applies filter changes by geocoding location if needed
     */
    const applyFilters = useCallback(async () => {
        if (locationName && !filters.latitude.includes(locationName)) {
            try {
                const result = await forwardGeocode(locationName);
                if (result) {
                    setFilters({
                        latitude: result.lat.toString(),
                        longitude: result.lng.toString(),
                        maxDistance: pendingMaxDistance
                    });
                    return;
                }
            } catch {
                // Fall through to default update
            }
        }
        
        setFilters(prev => ({
            ...prev,
            maxDistance: pendingMaxDistance
        }));
    }, [locationName, filters.latitude, pendingMaxDistance]);

    return {
        filters,
        locationName,
        setLocationName,
        pendingMaxDistance,
        setPendingMaxDistance,
        handleLocationSelect,
        applyFilters,
    };
};
