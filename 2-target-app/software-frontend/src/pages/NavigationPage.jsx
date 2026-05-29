/**
 * @fileoverview Navigation Page Component for route planning and navigation.
 * 
 * This page provides route planning functionality allowing users to calculate
 * routes between two locations. It supports multiple transportation modes and
 * displays route information including distance, estimated time, and map visualization.
 * 
 * Features:
 * - Location input with geocoding support
 * - Multiple transportation modes (driving, walking, cycling)
 * - Route visualization on an interactive map
 * - Quick route presets for popular destinations
 * - Real-time route calculations via OSRM and backend API
 * - URL parameter support for destination pre-filling
 * 
 * @module pages/NavigationPage
 * @requires react
 * @requires react-router-dom - For URL search params
 * @requires ../api - Navigation API calls
 * @requires ../i18n - Translation support
 * @requires ../utils/geocoding - Location geocoding utilities
 * @requires ../utils/routing - Route calculation utilities
 */

import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { useRoutePlanning } from '../hooks/useRoutePlanning';
import Hero from '../components/Hero.jsx';
import { Icon } from '../components/ui';
import RouteForm from '../components/navigation/RouteForm';
import RouteResults from '../components/navigation/RouteResults';
import './NavigationPage.css';

/** Predefined quick routes for popular destinations */
const QUICK_ROUTES = [
  { nameKey: 'routeAthensToThessaloniki', icon: '🏛️', from: 'Athens, Greece', to: 'Thessaloniki, Greece' },
  { nameKey: 'routeThessalonikiToAthens', icon: '🏛️', from: 'Thessaloniki, Greece', to: 'Athens, Greece' },
  { nameKey: 'routeHeraklionToAthens', icon: '🏖️', from: 'Heraklion, Crete, Greece', to: 'Athens, Greece' },
];

/**
 * NavigationPage Component
 * 
 * Provides a complete route planning interface with form inputs, map display,
 * and route results. Handles geocoding of location names to coordinates and
 * fetches route data from multiple sources.
 * 
 * @component
 * @example
 * // Basic usage in router
 * <Route path="/navigation" element={<NavigationPage />} />
 * 
 * @example
 * // With destination pre-filled via URL
 * // URL: /navigation?dest=Santorini, Greece
 * 
 * @returns {React.ReactElement} The navigation page with route planning interface
 */
const NavigationPage = () => {
  // Translation function for internationalized text
  const { t } = useTranslation();

  // URL search params for pre-filling destination from deep links
  const [searchParams] = useSearchParams();
  const destFromUrl = searchParams.get('dest');

  // Use the route planning hook
  const {
    routeData,
    loading,
    geocodingInput,
    geocodingStart,
    geocodingEnd,
    error,
    routeError,
    formData,
    startName,
    endName,
    routeGeometry,
    resultsRef,
    setFormData,
    calculateRoute,
  } = useRoutePlanning(t, 'Athens, Greece', destFromUrl || 'Thessaloniki, Greece');

  /**
   * Handles form submission for route calculation
   * @param {React.FormEvent} e - Form submit event
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    await calculateRoute();
  };

  return (
    <div className="navigation-page">
      {/* Hero section with page title */}
      <Hero title={t('navigationTitle')} subtitle={t('navigationSubtitle')} size="small" align="center" />

      <div className="container">
        {/* Main navigation layout with form and results columns */}
        <div className="navigation-layout">
          {/* Route input form component */}
          <RouteForm t={t} formData={formData} setFormData={setFormData} loading={loading}
            geocodingInput={geocodingInput} error={error} onSubmit={handleSubmit} />

          {/* Route results display with map and details */}
          <div className="results-column" ref={resultsRef}>
            <RouteResults t={t} routeData={routeData} startName={startName} endName={endName}
              geocodingStart={geocodingStart} geocodingEnd={geocodingEnd}
              routeGeometry={routeGeometry} routeError={routeError} />
          </div>
        </div>

        {/* Quick routes section for popular destination shortcuts */}
        <div className="quick-routes-section">
          <h3 className="section-title"><span>⚡</span> {t('quickRoutes')}</h3>
          <div className="quick-routes-grid">
            {QUICK_ROUTES.map((route, index) => (
              <button key={index} className="quick-route-btn"
                onClick={() => setFormData({ fromLocation: route.from, toLocation: route.to, transportMode: 'DRIVING' })}>
                <span className="route-emoji">{route.icon}</span>
                <span className="route-name">{t(route.nameKey)}</span>
                <Icon name="arrow" size="sm" className="route-arrow" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NavigationPage;
