/**
 * @fileoverview Application router configuration.
 * Defines all routes including public and protected routes.
 * @module router/index
 */

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute.jsx';

// Page imports
import HomePage from '../pages/HomePage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import SignupPage from '../pages/SignupPage.jsx';
import RecommendationsPage from '../pages/RecommendationsPage.jsx';
import PlaceDetailsPage from '../pages/PlaceDetailsPage.jsx';
import UserProfilePage from '../pages/UserProfilePage.jsx';
import PreferencesPage from '../pages/PreferencesPage.jsx';
import FavouritesPage from '../pages/FavouritesPage.jsx';
import NavigationPage from '../pages/NavigationPage.jsx';

/**
 * Application Routes
 * Defines all routes with protected route wrappers where needed
 */
const AppRoutes = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Protected Routes - Require Authentication */}
      <Route
        path="/recommendations"
        element={
          <ProtectedRoute>
            <RecommendationsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/places/:placeId"
        element={
          <ProtectedRoute>
            <PlaceDetailsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <UserProfilePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/preferences"
        element={
          <ProtectedRoute>
            <PreferencesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/favourites"
        element={
          <ProtectedRoute>
            <FavouritesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/navigation"
        element={
          <ProtectedRoute>
            <NavigationPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default AppRoutes;
