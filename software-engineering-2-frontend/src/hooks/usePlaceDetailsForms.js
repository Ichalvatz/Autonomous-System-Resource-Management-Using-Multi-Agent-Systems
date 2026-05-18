/**
 * Place Details Forms Hook
 * 
 * Manages form state for review and report submissions.
 * @module hooks/usePlaceDetailsForms
 */

import { useState } from 'react';

const INITIAL_REVIEW_FORM = { rating: 5, comment: '' };
const INITIAL_REPORT_FORM = { reason: '', description: '' };

/**
 * Custom hook for managing place details form state
 * 
 * @returns {Object} Form state and handlers
 */
export const usePlaceDetailsForms = () => {
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [showReportForm, setShowReportForm] = useState(false);
    const [reviewForm, setReviewForm] = useState(INITIAL_REVIEW_FORM);
    const [reportForm, setReportForm] = useState(INITIAL_REPORT_FORM);

    /**
     * Resets review form to initial state
     */
    const resetReviewForm = () => {
        setReviewForm(INITIAL_REVIEW_FORM);
        setShowReviewForm(false);
    };

    /**
     * Resets report form to initial state
     */
    const resetReportForm = () => {
        setReportForm(INITIAL_REPORT_FORM);
        setShowReportForm(false);
    };

    return {
        showReviewForm,
        setShowReviewForm,
        showReportForm,
        setShowReportForm,
        reviewForm,
        setReviewForm,
        reportForm,
        setReportForm,
        resetReviewForm,
        resetReportForm,
    };
};
