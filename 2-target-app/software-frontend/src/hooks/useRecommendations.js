/**
 * Recommendations Hook
 * 
 * Manages recommendations fetching, filtering, and sorting logic.
 * Handles location-based filtering and user preference integration.
 * 
 * @module hooks/useRecommendations
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { recommendationAPI, getAuthenticatedUserId } from '../api';
import { sortRecommendations } from '../utils/recommendationUtils';
import { useRecommendationFilters } from './useRecommendationFilters';

/**
 * Fetches recommendations from API
 * @private
 */
const fetchRecommendationsData = async (userId, filters) => {
    const response = await recommendationAPI.getRecommendations(userId, filters);
    return response.data;
};

/**
 * Handles recommendation fetch errors
 * @private
 */
const handleFetchError = (err, t, setError, _) => {
    if (err.message === 'User not authenticated') {
        setError(t('notAuthenticated'));
    } else if (err.response?.data?.message) {
        setError(err.response.data.message);
    } else {
        setError(t('errorLoadingRecommendations'));
    }
};

/**
 * Custom hook for recommendations functionality
 * 
 * @param {Function} t - Translation function
 * @returns {Object} Recommendations state and actions
 */
export const useRecommendations = (t) => {
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [showFilters, setShowFilters] = useState(false);
    const [sortBy, setSortBy] = useState('distance');

    const {
        filters,
        locationName,
        setLocationName,
        pendingMaxDistance,
        setPendingMaxDistance,
        handleLocationSelect,
        applyFilters,
    } = useRecommendationFilters();

    /**
     * Memoized sorted recommendations
     */
    const sortedRecommendations = useMemo(() => {
        return sortRecommendations(recommendations, sortBy);
    }, [recommendations, sortBy]);

    /**
     * Fetches recommendations from API
     */
    const fetchRecommendations = useCallback(async () => {
        setLoading(true);
        setError(null);
        setMessage(null);
        
        try {
            const userId = getAuthenticatedUserId();
            const data = await fetchRecommendationsData(userId, filters);
            const recs = data.recommendations || [];
            
            setRecommendations(recs);
            
            if (recs.length === 0 && data.message) {
                setMessage(data.message);
            }
        } catch (err) {
            handleFetchError(err, t, setError, setMessage);
        } finally {
            setLoading(false);
        }
    }, [filters, t]);

    // Fetch when filters change
    useEffect(() => {
        fetchRecommendations();
    }, [filters]); // eslint-disable-line

    return {
        recommendations: sortedRecommendations,
        loading,
        error,
        message,
        showFilters,
        sortBy,
        locationName,
        pendingMaxDistance,
        setShowFilters,
        setSortBy,
        setLocationName,
        setPendingMaxDistance,
        handleLocationSelect,
        handleApplyFilters: applyFilters,
        fetchRecommendations,
    };
};
