/**
 * @fileoverview Recommendations Page Component for personalized place discovery.
 * 
 * This page displays personalized place recommendations based on:
 * - User's active preference profile categories
 * - User's location (specified or detected)
 * - Maximum distance filter
 * - Sorting preferences (distance or rating)
 * 
 * Features:
 * - Location-based filtering with autocomplete
 * - Distance radius slider
 * - Sort by distance or rating
 * - Loading skeleton animations
 * - Error and empty state handling
 * 
 * @module pages/RecommendationsPage
 * @requires react
 * @requires ../api - Recommendation API calls
 * @requires ../i18n - Translation support
 * @requires ../utils/geocoding - Location geocoding utilities
 */

import React from 'react';
import { useTranslation } from '../i18n';
import { useRecommendations } from '../hooks/useRecommendations';
import PlaceCard from '../components/PlaceCard.jsx';
import PlaceCardSkeleton from '../components/PlaceCardSkeleton.jsx';
import Hero from '../components/Hero.jsx';
import { Button, Alert, Icon } from '../components/ui';
import RecommendationFilters from '../components/recommendations/RecommendationFilters';
import './RecommendationsPage.css';

/**
 * RecommendationsPage Component
 * 
 * Displays personalized place recommendations with filtering and sorting options.
 * Fetches recommendations based on user preferences and location.
 * 
 * @component
 * @example
 * // Usage in router
 * <Route path="/recommendations" element={<RecommendationsPage />} />
 * 
 * @returns {React.ReactElement} The recommendations page with filters and results
 */
const RecommendationsPage = () => {
  // Translation function for internationalized text
  const { t } = useTranslation();

  // Use the recommendations hook
  const {
    recommendations,
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
    handleApplyFilters,
    fetchRecommendations,
  } = useRecommendations(t);

  return (
    <div className="recommendations-page">
      {/* Page hero section */}
      <Hero title={t('recommendationsTitle')} subtitle={t('recommendationsSubtitle')} size="small" align="center" />

      <div className="container">
        {/* Filter controls component */}
        <RecommendationFilters t={t} showFilters={showFilters} setShowFilters={setShowFilters}
          locationName={locationName} onLocationChange={(e) => setLocationName(e.target.value)}
          onLocationSelect={handleLocationSelect} pendingMaxDistance={pendingMaxDistance}
          onDistanceChange={(e) => setPendingMaxDistance(e.target.value)} sortBy={sortBy}
          onSortChange={(e) => setSortBy(e.target.value)} onApplyFilters={handleApplyFilters} />

        {/* Results section with conditional rendering */}
        <div className="results-section">
          {loading ? (
            // Loading state: show skeleton cards
            <div className="recommendations-grid"><PlaceCardSkeleton count={6} /></div>
          ) : error ? (
            // Error state: show error alert with retry button
            <div className="error-state">
              <Alert variant="error" title={t('error')}>
                {error}
                <Button onClick={fetchRecommendations} variant="primary" size="sm" className="retry-button">
                  <Icon name="refresh" size="sm" />{t('tryAgain')}
                </Button>
              </Alert>
            </div>
          ) : message ? (
            // Info state: API message (e.g., no active profile)
            <div className="info-state">
              <div className="info-icon">ℹ️</div>
              <h3>{t('createProfileForRecommendations')}</h3>
              <p>{t('goToPreferences')}</p>
              <Button variant="primary" onClick={() => window.location.href = '/preferences'}>{t('preferences')}</Button>
            </div>
          ) : recommendations.length > 0 ? (
            // Success state: show recommendations grid
            <>
              <div className="results-header">
                <h2 className="results-title">{recommendations.length} {recommendations.length === 1 ? t('recommendationSingular') : t('recommendationPlural')}</h2>
              </div>
              <div className="recommendations-grid">
                {recommendations.map((rec, index) => (
                  <div key={rec.placeId || rec.id || `rec-${index}`} className="recommendation-item animate-fadeInUp"
                    style={{ animationDelay: `${index * 0.1}s` }}>
                    <PlaceCard place={rec} showDistance={true} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            // Empty state: no recommendations found
            <div className="empty-state">
              <div className="empty-icon">🔍</div>
              <h3>{t('noRecommendationsFound')}</h3>
              <p>{t('tryDifferentFilters')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecommendationsPage;

