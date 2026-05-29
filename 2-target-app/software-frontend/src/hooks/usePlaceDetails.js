/**
 * @fileoverview Place details hook.
 * Fetches place info, reviews, and favourite status.
 * @module hooks/usePlaceDetails
 */

import { useState, useEffect, useCallback } from 'react';
import { placeAPI, favouriteAPI, getAuthenticatedUserId } from '../api';

/**
 * Custom hook for managing place details data fetching
 * Handles place info, reviews, and favourite status
 */
export const usePlaceDetails = (placeId, t) => {
    const [place, setPlace] = useState(null);
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isFavourite, setIsFavourite] = useState(false);
    const [isDisliked, setIsDisliked] = useState(false);
    const [favouriteId, setFavouriteId] = useState(null);
    const [dislikedId, setDislikedId] = useState(null);

    const fetchPlaceDetails = useCallback(async () => {
        setLoading(true);
        try {
            const response = await placeAPI.getPlaceDetails(placeId);
            setPlace(response.data.place);
        } catch (err) {
            setError(t('errorLoadingPlace'));
            console.error('Error fetching place details:', err);
        } finally {
            setLoading(false);
        }
    }, [placeId, t]);

    const fetchReviews = useCallback(async () => {
        try {
            const response = await placeAPI.getPlaceReviews(placeId);
            setReviews(response.data.reviews || []);
        } catch (err) {
            console.error('Error fetching reviews:', err);
        }
    }, [placeId]);

    const fetchFavouriteStatus = useCallback(async () => {
        try {
            const userId = getAuthenticatedUserId();
            const [favResponse, dislikedResponse] = await Promise.all([
                favouriteAPI.getFavouritePlaces(userId),
                favouriteAPI.getDislikedPlaces(userId)
            ]);

            const favourites = favResponse.data.favourites || [];
            const disliked = dislikedResponse.data.dislikedPlaces || [];

            const fav = favourites.find(f => f.placeId === parseInt(placeId));
            const dis = disliked.find(d => d.placeId === parseInt(placeId));

            if (fav) {
                setIsFavourite(true);
                setFavouriteId(fav.favouriteId);
            }
            if (dis) {
                setIsDisliked(true);
                setDislikedId(dis.dislikedId);
            }
        } catch (err) {
            console.error('Error fetching favourite status:', err);
        }
    }, [placeId]);

    // Scroll to top when navigating to this page
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [placeId]);

    useEffect(() => {
        fetchPlaceDetails();
        fetchReviews();
        fetchFavouriteStatus();
    }, [fetchPlaceDetails, fetchReviews, fetchFavouriteStatus]);

    return {
        place,
        reviews,
        loading,
        error,
        isFavourite,
        setIsFavourite,
        isDisliked,
        setIsDisliked,
        favouriteId,
        setFavouriteId,
        dislikedId,
        setDislikedId,
        fetchReviews,
        fetchPlaceDetails,
    };
};
