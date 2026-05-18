/**
 * @fileoverview Place Details Page Component for displaying place information.
 * 
 * This page provides a comprehensive view of a specific place including:
 * - Hero section with place name, category, and rating
 * - Address and description information
 * - Photo gallery
 * - User reviews section with submission form
 * - Place actions (favourite, dislike, navigation)
 * - Report functionality for inappropriate content
 * 
 * @module pages/PlaceDetailsPage
 */

import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { usePlaceDetails } from '../hooks/usePlaceDetails';
import { usePlaceActions } from '../hooks/usePlaceActions';
import { usePlaceDetailsForms } from '../hooks/usePlaceDetailsForms';
import { useToast, PhotoGallery } from '../components/ui';
import ReviewsSection from '../components/place/ReviewsSection';
import ReportModal from '../components/place/ReportModal';
import PlaceActionsBar from '../components/place/PlaceActionsBar';
import PlaceHero from '../components/place/PlaceHero';
import PlaceInfoCard from '../components/place/PlaceInfoCard';
import { LoadingState, ErrorState } from '../components/common/PageStates';
import { calculateAverageRating } from '../utils/calculations';
import './PlaceDetailsPage.css';

/**
 * PlaceDetailsPage Component
 * 
 * Displays detailed information about a specific place.
 * @component
 */
const PlaceDetailsPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const toast = useToast();
    const { placeId } = useParams();

    // Place data hook
    const placeState = usePlaceDetails(placeId, t);
    const { place, reviews, loading, error, isFavourite, isDisliked } = placeState;

    // Form state hook
    const {
        showReviewForm,
        setShowReviewForm,
        showReportForm,
        setShowReportForm,
        reviewForm,
        setReviewForm,
        reportForm,
        setReportForm,
    } = usePlaceDetailsForms();

    // Action handlers hook
    const { handleReviewSubmit, handleReportSubmit, toggleFavourite, toggleDisliked } = usePlaceActions(
        placeId, t, toast, placeState
    );

    const averageRating = calculateAverageRating(reviews);
    const handleBack = () => navigate(-1);

    // Wrapper handlers with form reset
    const onReviewSubmit = async (e) => {
        await handleReviewSubmit(e, reviewForm, setShowReviewForm, setReviewForm);
    };

    const onReportSubmit = async (e) => {
        await handleReportSubmit(e, reportForm, setShowReportForm, setReportForm);
    };

    if (loading) return <LoadingState t={t} />;
    if (error || !place) return <ErrorState t={t} error={error} onBack={handleBack} />;

    return (
        <div className="place-details-page">
            <PlaceHero 
                place={place}
                averageRating={averageRating}
                reviewsCount={reviews.length}
                onBack={handleBack}
                t={t}
            />

            <div className="container">
                <PlaceActionsBar t={t} place={place} isFavourite={isFavourite} isDisliked={isDisliked}
                    toggleFavourite={toggleFavourite} toggleDisliked={toggleDisliked} />

                <div className="place-info-section animate-fadeInUp">
                    <PlaceInfoCard place={place} onReport={() => setShowReportForm(true)} t={t} />
                </div>

                <div className="place-gallery-section animate-fadeInUp">
                    <PhotoGallery category={place.category} placeName={place.name} />
                </div>

                <ReviewsSection t={t} reviews={reviews} showReviewForm={showReviewForm} 
                    setShowReviewForm={setShowReviewForm} reviewForm={reviewForm} 
                    setReviewForm={setReviewForm} onReviewSubmit={onReviewSubmit} />

                <ReportModal t={t} showReportForm={showReportForm} setShowReportForm={setShowReportForm}
                    reportForm={reportForm} setReportForm={setReportForm} onReportSubmit={onReportSubmit} />
            </div>
        </div>
    );
};

export default PlaceDetailsPage;
