/**
 * @fileoverview Reviews section component for place details.
 * Displays review list and review submission form.
 * @module components/place/ReviewsSection
 */

import React from 'react';
import { Button, Icon } from '../ui';

/**
 * Reviews section component for PlaceDetailsPage
 * Displays review list and review submission form
 */
const ReviewsSection = ({
    t,
    reviews,
    showReviewForm,
    setShowReviewForm,
    reviewForm,
    setReviewForm,
    onReviewSubmit,
}) => {
    /** Generate star display string from numeric rating */
    const getRatingStars = (rating) => {
        return '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
    };

    return (
        <div className="reviews-section animate-fadeInUp">
            <div className="reviews-header">
                <h2>
                    <span>💬</span> {t('reviews')}
                </h2>
                <Button onClick={() => setShowReviewForm(!showReviewForm)} variant="primary">
                    <Icon name="edit" size="sm" />
                    {t('writeReview')}
                </Button>
            </div>

            {/* Review submission form - toggleable */}
            {showReviewForm && (
                <form onSubmit={onReviewSubmit} className="review-form">
                    <div className="form-group">
                        <label className="form-label">{t('rating')}</label>
                        <div className="star-rating">
                            {[5, 4, 3, 2, 1].map((star) => (
                                <button
                                    key={star}
                                    type="button"
                                    className={`star-btn ${reviewForm.rating >= star ? 'star-btn--active' : ''}`}
                                    onClick={() => setReviewForm({ ...reviewForm, rating: star })}
                                >
                                    ★
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('comment')}</label>
                        <textarea
                            value={reviewForm.comment}
                            onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
                            className="form-textarea"
                            placeholder={t('comment') + '...'}
                        />
                    </div>
                    <div className="form-actions">
                        <Button type="submit" variant="primary">
                            <Icon name="check" size="sm" />
                            {t('submit')}
                        </Button>
                        <Button type="button" onClick={() => setShowReviewForm(false)} variant="ghost">
                            {t('cancel')}
                        </Button>
                    </div>
                </form>
            )}

            {/* Reviews list with empty state */}
            <div className="reviews-list">
                {reviews.length > 0 ? (
                    reviews.map((review, index) => (
                        <div
                            key={review.id}
                            className="review-card animate-fadeInUp"
                            style={{ animationDelay: `${index * 0.1}s` }}
                        >
                            <div className="review-header">
                                <div className="review-user">
                                    <div className="user-avatar">
                                        {review.userName ? review.userName[0].toUpperCase() : 'U'}
                                    </div>
                                    <span>{review.userName || `${t('user')} #${review.userId}`}</span>
                                </div>
                                <div className="review-rating">
                                    <span className="stars">{getRatingStars(review.rating)}</span>
                                    <span className="rating-number">{review.rating}/5</span>
                                </div>
                            </div>
                            {review.comment && <p className="review-comment">{review.comment}</p>}
                            <div className="review-date">
                                <Icon name="calendar" size="sm" />
                                {new Date(review.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="no-reviews">
                        <div className="no-reviews-icon">💬</div>
                        <h4>{t('noReviews')}</h4>
                        <p>{t('writeReview')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ReviewsSection;
