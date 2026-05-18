/**
 * @fileoverview Favourites management hook.
 * Handles fetching and managing favourite/disliked places.
 * @module hooks/useFavourites
 */

import { useState, useEffect, useCallback } from 'react';
import { favouriteAPI, getAuthenticatedUserId } from '../api';

/**
 * Hook for managing favourites and disliked places data
 */
export const useFavourites = (t, showError) => {
    const [favourites, setFavourites] = useState([]);
    const [disliked, setDisliked] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchFavourites = useCallback(async (signal) => {
        setLoading(true);
        try {
            const userId = getAuthenticatedUserId();
            const response = await favouriteAPI.getFavouritePlaces(userId);
            if (!signal?.aborted) setFavourites(response.data.favourites || []);
        } catch (err) {
            if (!signal?.aborted && err.message === 'User not authenticated') setError(t('notAuthenticated'));
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [t]);

    const fetchDisliked = useCallback(async (signal) => {
        try {
            const userId = getAuthenticatedUserId();
            const response = await favouriteAPI.getDislikedPlaces(userId);
            if (!signal?.aborted) setDisliked(response.data.dislikedPlaces || []);
        } catch (err) { if (!signal?.aborted) console.error('Error fetching disliked:', err); }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        fetchFavourites(controller.signal);
        fetchDisliked(controller.signal);
        return () => controller.abort();
    }, [fetchFavourites, fetchDisliked]);

    const handleRemoveFavourite = async (favouriteId) => {
        try {
            const userId = getAuthenticatedUserId();
            await favouriteAPI.removeFromFavourites(userId, favouriteId);
            fetchFavourites();
        } catch (err) { showError(t('errorRemovingFavourite')); }
    };

    const handleRemoveDisliked = async (dislikedId) => {
        try {
            const userId = getAuthenticatedUserId();
            await favouriteAPI.removeFromDislikedPlaces(userId, dislikedId);
            fetchDisliked();
        } catch (err) { showError(t('errorRemovingDisliked')); }
    };

    return { favourites, disliked, loading, error, handleRemoveFavourite, handleRemoveDisliked };
};
