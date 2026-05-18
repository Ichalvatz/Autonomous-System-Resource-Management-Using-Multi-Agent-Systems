/**
 * @fileoverview Home Page Component - Main landing page for the application.
 * 
 * This is the primary entry page for users, featuring:
 * - Hero section with search functionality
 * - Quick navigation links to key features
 * - Personalized place recommendations (for authenticated users)
 * - Features overview section
 * - Call-to-action section
 * 
 * @module pages/HomePage
 * @requires react
 * @requires react-router-dom - For navigation links
 * @requires ../api - API calls for places and recommendations
 * @requires ../i18n - Translation support
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { placeAPI, recommendationAPI, getAuthenticatedUserId } from '../api';
import PlaceCard from '../components/PlaceCard.jsx';
import PlaceCardSkeleton from '../components/PlaceCardSkeleton.jsx';
import Carousel3D from '../components/Carousel3D.jsx';
import Hero from '../components/Hero.jsx';
import { Button, EmptyState, Icon } from '../components/ui';
import FeaturesSection from '../components/home/FeaturesSection';
import CTASection from '../components/home/CTASection';
import { useTranslation } from '../i18n';
import './HomePage.css';

/**
 * HomePage Component
 * 
 * The main landing page providing search, recommendations, and navigation
 * to key application features. Displays personalized content for authenticated
 * users and a general overview for guests.
 * 
 * @component
 * @example
 * // Usage in router
 * <Route path="/" element={<HomePage />} />
 * 
 * @returns {React.ReactElement} The home page with hero, search, and recommendations
 */
const HomePage = () => {
  // Translation function for internationalized text
  const { t } = useTranslation();

  // Loading state for search operations
  const [loading, setLoading] = useState(false);

  // Current search query text
  const [searchQuery, setSearchQuery] = useState('');

  // Search results from keyword search
  const [searchResults, setSearchResults] = useState([]);

  // Personalized recommendations for authenticated users
  const [featuredPlaces, setFeaturedPlaces] = useState([]);

  // Loading state for recommendations fetch
  const [loadingFeatured, setLoadingFeatured] = useState(true);

  /**
   * Fetches personalized recommendations for authenticated users.
   * Uses default Athens coordinates as the reference point.
   * Runs on component mount.
   */
  useEffect(() => {
    const fetchFeaturedPlaces = async () => {
      try {
        const userId = getAuthenticatedUserId();
        // Only fetch if user is authenticated
        if (userId) {
          setLoadingFeatured(true);
          const response = await recommendationAPI.getRecommendations(userId, {
            // Default to Athens, Greece coordinates
            latitude: '37.9838', longitude: '23.7275', maxDistance: '100',
          });
          setFeaturedPlaces(response.data.recommendations || []);
        }
      } catch (error) { /* silent fail - recommendations are optional */ }
      finally { setLoadingFeatured(false); }
    };
    fetchFeaturedPlaces();
  }, []);

  /**
   * Handles search form submission.
   * Searches for places matching the query keywords.
   * 
   * @param {React.FormEvent} e - Form submit event
   */
  const handleSearch = async (e) => {
    e.preventDefault();
    // Clear results if query is empty
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setLoading(true);
    try {
      const response = await placeAPI.searchPlaces({ keywords: searchQuery });
      setSearchResults(response.data.results || []);
    } catch { setSearchResults([]); }
    finally { setLoading(false); }
  };

  /**
   * Clears the search query and results.
   */
  const clearSearch = () => { setSearchQuery(''); setSearchResults([]); };

  return (
    <div className="home-page">
      {/* Hero section with search form and quick links */}
      <Hero title={t('welcomeTitle')} subtitle={t('welcomeSubtitle')} size="large" align="center">
        {/* Search form */}
        <form onSubmit={handleSearch} className="search-form">
          <div className="search-container">
            <div className="search-input-wrapper">
              <input type="text" placeholder={t('searchPlaceholder')} value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className="search-input" data-cy="search-input" />
              {/* Clear button - shown when there's a query */}
              {searchQuery && (
                <button type="button" className="search-clear" onClick={clearSearch} aria-label="Clear search">
                  <Icon name="close" size="sm" />
                </button>
              )}
            </div>
            <Button type="submit" variant="accent" size="lg" className="search-button" data-cy="search-button">
              <Icon name="search" size="sm" /><span className="search-button-text">{t('searchButton')}</span>
            </Button>
          </div>
        </form>
        {/* Quick navigation links to key features */}
        <div className="hero-quick-links">
          <Link to="/recommendations" className="quick-link"><Icon name="star" size="sm" /><span>{t('personalizedRecommendations')}</span></Link>
          <Link to="/favourites" className="quick-link"><Icon name="heart" size="sm" /><span>{t('favouritesFeature')}</span></Link>
        </div>
      </Hero>

      {/* Search results section - shown when results exist */}
      {searchResults.length > 0 && (
        <section className="content-section">
          <div className="container">
            <div className="section-header">
              <div className="section-header-content">
                <h2 className="section-title">{t('searchResults')}</h2>
                <p className="section-subtitle">{searchResults.length} {searchResults.length === 1 ? 'result' : 'results'} found</p>
              </div>
              <Button onClick={clearSearch} variant="ghost" className="clear-button"><Icon name="close" size="sm" />{t('clearButton')}</Button>
            </div>
            {loading ? <div className="places-grid"><PlaceCardSkeleton count={3} /></div> : (
              <div className="places-grid">
                {searchResults.map((place, index) => (
                  <div key={place.id} className="place-card-wrapper animate-fadeInUp" style={{ animationDelay: `${index * 0.1}s` }}>
                    <PlaceCard place={place} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Empty state for no search results */}
      {searchResults.length === 0 && searchQuery && !loading && (
        <section className="content-section">
          <div className="container">
            <div className="empty-state-wrapper">
              <EmptyState icon="🔍" title={t('noResults')}
                description={`${t('noResults')} "${searchQuery}". Try different keywords or explore our recommendations.`}
                action={<Button onClick={clearSearch} variant="primary">{t('clearButton')}</Button>} />
            </div>
          </div>
        </section>
      )}

      {/* Featured/Recommended places carousel - shown when not searching */}
      {!searchQuery && featuredPlaces.length > 0 && (
        <section className="content-section content-section--featured">
          <div className="container">
            <div className="section-header">
              <div className="section-header-content">
                <span className="section-badge">✨ Just for you</span>
                <h2 className="section-title">{t('recommendedDestinations')}</h2>
                <p className="section-subtitle">Personalized picks based on your preferences</p>
              </div>
              <Link to="/recommendations"><Button variant="outline">{t('viewAll')}<Icon name="arrow" size="sm" /></Button></Link>
            </div>
            {loadingFeatured ? <div className="places-grid"><PlaceCardSkeleton count={3} /></div> : (
              <Carousel3D items={featuredPlaces} renderItem={(place) => <PlaceCard place={place} showDistance />}
                autoPlay autoPlayInterval={3000} showNavigation showDots />
            )}
          </div>
        </section>
      )}

      {/* Features overview section */}
      <FeaturesSection t={t} />

      {/* Call-to-action section */}
      <CTASection t={t} />
    </div>
  );
};

export default HomePage;

