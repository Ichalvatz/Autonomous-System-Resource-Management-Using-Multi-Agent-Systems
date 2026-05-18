/**
 * @fileoverview Favourites Page Component for managing user's saved places.
 * 
 * This page displays the user's favourite and disliked places in a tabbed
 * interface. Users can view, manage, and remove places from their lists.
 * The component handles loading states, error display, and empty states
 * for both tabs.
 * 
 * Features:
 * - Tabbed interface for switching between favourites and disliked lists
 * - Loading skeleton display during data fetch
 * - Error banner for API failures
 * - Empty state with call-to-action for each list type
 * - Remove functionality for both favourite and disliked items
 * 
 * @module pages/FavouritesPage
 * @requires react
 * @requires ../i18n - Translation support
 * @requires ../hooks/useFavourites - Favourites management hook
 */

import React, { useState } from 'react';
import { useTranslation } from '../i18n';
import PlaceCardSkeleton from '../components/PlaceCardSkeleton.jsx';
import Hero from '../components/Hero.jsx';
import { Button, Icon, useToast } from '../components/ui';
import FavouriteListItem from '../components/favourites/FavouriteListItem';
import { useFavourites } from '../hooks/useFavourites';
import './FavouritesPage.css';

/**
 * FavouritesPage Component
 * 
 * Displays a user's favourite and disliked places with a tabbed interface.
 * Allows users to manage their saved places by removing items from either list.
 * 
 * @component
 * @example
 * // Usage in router
 * <Route path="/favourites" element={<FavouritesPage />} />
 * 
 * @returns {React.ReactElement} The favourites page with tabbed content
 */
const FavouritesPage = () => {
  // Get translation function for internationalized text
  const { t } = useTranslation();

  // Toast notification for error display
  const { error: showError } = useToast();

  // Track which tab is currently active ('favourites' or 'disliked')
  const [activeTab, setActiveTab] = useState('favourites');

  // Fetch favourites data and handlers from custom hook
  const { favourites, disliked, loading, error, handleRemoveFavourite, handleRemoveDisliked } = useFavourites(t, showError);

  return (
    <div className="favourites-page">
      {/* Hero section with page title and subtitle */}
      <Hero title={t('myLists')} subtitle={t('manageFavourites')} size="small" align="center" />

      <div className="container">
        {/* Error banner - displays when API call fails */}
        {error && <div className="error-banner"><Icon name="alert" size="sm" /><p>{error}</p></div>}

        {/* Tab navigation for switching between lists */}
        <div className="tabs-container">
          <div className="tabs">
            {/* Favourites tab with heart icon and count badge */}
            <button className={`tab ${activeTab === 'favourites' ? 'tab--active' : ''}`}
              onClick={() => setActiveTab('favourites')} data-cy="tab-favourites">
              <span className="tab-icon">❤️</span><span className="tab-label">{t('favourites')}</span>
              <span className="tab-count">{favourites.length}</span>
            </button>
            {/* Disliked tab with thumbs down icon and count badge */}
            <button className={`tab ${activeTab === 'disliked' ? 'tab--active' : ''}`}
              onClick={() => setActiveTab('disliked')} data-cy="tab-disliked">
              <span className="tab-icon">👎</span><span className="tab-label">{t('disliked')}</span>
              <span className="tab-count">{disliked.length}</span>
            </button>
          </div>
        </div>

        {/* Tab content area - conditionally renders based on loading and active tab */}
        <div className="tab-content">
          {loading ? (
            // Loading state: show skeleton placeholders
            <div className="places-grid"><PlaceCardSkeleton count={3} /></div>
          ) : activeTab === 'favourites' ? (
            // Favourites tab content
            favourites.length > 0 ? (
              // Display favourites grid when items exist
              <div className="places-grid">
                {favourites.map((fav, i) => (
                  <FavouriteListItem key={fav.favouriteId || fav.place?.placeId} item={fav} index={i}
                    onRemove={handleRemoveFavourite} idKey="favouriteId" t={t} />
                ))}
              </div>
            ) : (
              // Empty state for no favourites
              <div className="empty-state">
                <div className="empty-icon">❤️</div><h3>{t('noFavourites')}</h3><p>{t('startExploring')}</p>
                <Button variant="primary" onClick={() => window.location.href = '/'}>Explore Places</Button>
              </div>
            )
          ) : (
            // Disliked tab content
            disliked.length > 0 ? (
              // Display disliked grid when items exist
              <div className="places-grid">
                {disliked.map((dis, i) => (
                  <FavouriteListItem key={dis.dislikedId || dis.place?.placeId} item={dis} index={i}
                    onRemove={handleRemoveDisliked} idKey="dislikedId" t={t} />
                ))}
              </div>
            ) : (
              // Empty state for no disliked places
              <div className="empty-state">
                <div className="empty-icon">👎</div><h3>{t('noDisliked')}</h3><p>{t('dislikedWillAppearHere')}</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default FavouritesPage;

