/**
 * @fileoverview Place action handlers hook.
 * Manages review, report, favourite, and dislike interactions.
 * @module hooks/usePlaceActions
 */

import { placeAPI, favouriteAPI, getAuthenticatedUserId } from '../api';

/**
 * Handles action errors with authentication check
 * @private
 */
const handleActionError = (err, t, toast, authErrorKey, generalErrorKey) => {
    const { showWarning, showError } = toast;
    if (err.message === 'User not authenticated') {
        showWarning(t(authErrorKey));
    } else {
        showError(t(generalErrorKey));
    }
};

/**
 * Resets form state after submission
 * @private
 */
const resetFormState = (setShowForm, setFormData, initialData) => {
    setShowForm(false);
    setFormData(initialData);
};

/**
 * Removes a place from opposite list when toggling preference
 * @private
 */
const removeFromOppositeList = async (shouldRemove, removeAction, userId, itemId, setIsRemoved, setItemId) => {
    if (shouldRemove && itemId) {
        await removeAction(userId, itemId);
        setIsRemoved(false);
        setItemId(null);
    }
};

/**
 * Hook for managing place action handlers (review, report, favourite, dislike)
 */
export const usePlaceActions = (placeId, t, toast, placeState) => {
    const { showSuccess } = toast;
    const {
        isFavourite, setIsFavourite, isDisliked, setIsDisliked,
        favouriteId, setFavouriteId, dislikedId, setDislikedId,
        fetchReviews, fetchPlaceDetails
    } = placeState;

    /**
     * Handles review submission
     */
    const handleReviewSubmit = async (e, reviewForm, setShowReviewForm, setReviewForm) => {
        e.preventDefault();
        try {
            getAuthenticatedUserId();
            await placeAPI.submitReview(placeId, reviewForm);
            resetFormState(setShowReviewForm, setReviewForm, { rating: 5, comment: '' });
            fetchReviews();
            fetchPlaceDetails();
            showSuccess(t('reviewSubmittedSuccess'));
        } catch (err) {
            handleActionError(err, t, toast, 'mustLoginToReview', 'errorSubmittingReview');
        }
    };

    /**
     * Handles report submission
     */
    const handleReportSubmit = async (e, reportForm, setShowReportForm, setReportForm) => {
        e.preventDefault();
        try {
            const userId = getAuthenticatedUserId();
            await placeAPI.reportPlace(placeId, { userId, ...reportForm });
            resetFormState(setShowReportForm, setReportForm, { reason: '', description: '' });
            showSuccess(t('reportSubmittedSuccess'));
        } catch (err) {
            handleActionError(err, t, toast, 'mustLoginToReport', 'errorSubmittingReport');
        }
    };

    /**
     * Toggles favourite status
     */
    const toggleFavourite = async () => {
        try {
            const userId = getAuthenticatedUserId();
            
            if (isFavourite) {
                await favouriteAPI.removeFromFavourites(userId, favouriteId);
                setIsFavourite(false);
                setFavouriteId(null);
            } else {
                const res = await favouriteAPI.addToFavourites(userId, parseInt(placeId));
                setIsFavourite(true);
                setFavouriteId(res.data.favourite?.favouriteId);
                
                await removeFromOppositeList(
                    isDisliked,
                    favouriteAPI.removeFromDislikedPlaces,
                    userId,
                    dislikedId,
                    setIsDisliked,
                    setDislikedId
                );
            }
        } catch (err) {
            handleActionError(err, t, toast, 'mustLoginToFavourite', 'errorAddingToFavourites');
        }
    };

    /**
     * Toggles disliked status
     */
    const toggleDisliked = async () => {
        try {
            const userId = getAuthenticatedUserId();
            
            if (isDisliked) {
                await favouriteAPI.removeFromDislikedPlaces(userId, dislikedId);
                setIsDisliked(false);
                setDislikedId(null);
            } else {
                const res = await favouriteAPI.addToDislikedPlaces(userId, parseInt(placeId));
                setIsDisliked(true);
                setDislikedId(res.data.dislikedId);
                
                await removeFromOppositeList(
                    isFavourite,
                    favouriteAPI.removeFromFavourites,
                    userId,
                    favouriteId,
                    setIsFavourite,
                    setFavouriteId
                );
            }
        } catch (err) {
            handleActionError(err, t, toast, 'mustLoginToDislike', 'errorAddingToDisliked');
        }
    };

    return { handleReviewSubmit, handleReportSubmit, toggleFavourite, toggleDisliked };
};
