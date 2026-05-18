/**
 * @fileoverview Homepage features section component.
 * Displays feature highlights: recommendations, reviews, favourites.
 * @module components/home/FeaturesSection
 */

import React from 'react';

/**
 * Features section for HomePage
 * Displays the main feature cards
 */
const FeaturesSection = ({ t }) => {
    return (
        <section className="features-section">
            <div className="container">
                <div className="features-header">
                    <h2 className="section-title">{t('whatWeOffer')}</h2>
                    <p className="section-subtitle">{t('whatWeOfferSubtitle')}</p>
                </div>

                <div className="features-grid">
                    <div className="feature-card animate-fadeInUp">
                        <div className="feature-icon-wrapper feature-icon--primary">
                            <span className="feature-icon">🎯</span>
                        </div>
                        <h3 className="feature-title">{t('personalizedRecommendations')}</h3>
                        <p className="feature-description">{t('personalizedRecommendationsDesc')}</p>
                    </div>

                    <div className="feature-card animate-fadeInUp stagger-1">
                        <div className="feature-icon-wrapper feature-icon--secondary">
                            <span className="feature-icon">⭐</span>
                        </div>
                        <h3 className="feature-title">{t('reviews')}</h3>
                        <p className="feature-description">{t('reviewsDesc')}</p>
                    </div>

                    <div className="feature-card animate-fadeInUp stagger-2">
                        <div className="feature-icon-wrapper feature-icon--accent">
                            <span className="feature-icon">❤️</span>
                        </div>
                        <h3 className="feature-title">{t('favouritesFeature')}</h3>
                        <p className="feature-description">{t('favouritesFeatureDesc')}</p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default FeaturesSection;
