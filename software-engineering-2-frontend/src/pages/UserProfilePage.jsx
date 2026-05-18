/**
 * @fileoverview User Profile Page Component for managing user information.
 * 
 * This page displays and allows editing of user profile information and
 * application settings. It provides forms for updating personal details
 * (name, email, etc.) and user preferences (notifications, language, etc.).
 * 
 * Features:
 * - Display user profile information
 * - Edit profile details with inline form
 * - Manage application settings
 * - Success/error message feedback
 * - Loading and error state handling
 * 
 * @module pages/UserProfilePage
 * @requires react
 * @requires ../api - User API calls
 * @requires ../i18n - Translation support
 */

import React, { useState, useEffect, useCallback } from 'react';
import { userAPI, getAuthenticatedUserId } from '../api';
import { useTranslation } from '../i18n';
import Hero from '../components/Hero.jsx';
import { Spinner, Icon } from '../components/ui';
import ProfileInfoCard from '../components/profile/ProfileInfoCard';
import SettingsCard from '../components/profile/SettingsCard';
import './UserProfilePage.css';

/**
 * UserProfilePage Component
 * 
 * Provides a complete interface for viewing and editing user profile
 * information and application settings. Uses inline edit mode for
 * seamless user experience.
 * 
 * @component
 * @example
 * // Usage in router
 * <Route path="/profile" element={<UserProfilePage />} />
 * 
 * @returns {React.ReactElement} The user profile management page
 */
const UserProfilePage = () => {
  // Translation function for internationalized text
  const { t } = useTranslation();

  // User profile data
  const [profile, setProfile] = useState(null);

  // User settings data
  const [settings, setSettings] = useState(null);

  // Loading state for initial data fetch
  const [loading, setLoading] = useState(true);

  // Error message for fetch failures
  const [error, setError] = useState(null);

  // Edit mode toggle for profile info
  const [editMode, setEditMode] = useState(false);

  // Edit mode toggle for settings
  const [editSettingsMode, setEditSettingsMode] = useState(false);

  // Temporary message display for success/error feedback
  const [message, setMessage] = useState({ text: '', type: '' });

  /**
   * Fetches user profile data from API.
   * Updates profile state on success, sets error on authentication failure.
   * 
   * @function fetchProfile
   * @async
   */
  const fetchProfile = useCallback(async () => {
    try {
      const userId = getAuthenticatedUserId();
      const response = await userAPI.getUserProfile(userId);
      // Handle different response formats
      setProfile(response.data.user || response.data);
    } catch (err) {
      // Handle authentication errors specifically
      if (err.message === 'User not authenticated') setError(t('notAuthenticated'));
      console.error('Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  }, [t]);

  /**
   * Fetches user settings from API.
   * Updates settings state on success.
   * 
   * @function fetchSettings
   * @async
   */
  const fetchSettings = useCallback(async () => {
    try {
      const userId = getAuthenticatedUserId();
      const response = await userAPI.getUserSettings(userId);
      // Handle different response formats
      setSettings(response.data.settings || response.data);
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  }, []);

  // Fetch profile and settings on component mount
  useEffect(() => { fetchProfile(); fetchSettings(); }, [fetchProfile, fetchSettings]);

  /**
   * Displays a temporary message toast to the user.
   * Message auto-dismisses after 3 seconds.
   * 
   * @function showMessage
   * @param {string} text - Message text to display
   * @param {string} [type='success'] - Message type ('success' or 'error')
   */
  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    // Auto-dismiss after 3 seconds
    setTimeout(() => setMessage({ text: '', type: '' }), 3000);
  };

  /**
   * Handles profile update form submission.
   * Sends updated profile data to API and shows feedback.
   * 
   * @function handleProfileUpdate
   * @async
   * @param {React.FormEvent} e - Form submit event
   */
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    try {
      const userId = getAuthenticatedUserId();
      const response = await userAPI.updateUserProfile(userId, profile);
      // Update local state with response data
      setProfile(response.data.user || response.data);
      setEditMode(false);
      showMessage(t('profileUpdatedSuccess'), 'success');
    } catch (err) {
      showMessage(err.response?.data?.message || t('errorUpdatingProfile'), 'error');
    }
  };

  /**
   * Handles settings update form submission.
   * Sends updated settings data to API and shows feedback.
   * 
   * @function handleSettingsUpdate
   * @async
   * @param {React.FormEvent} e - Form submit event
   */
  const handleSettingsUpdate = async (e) => {
    e.preventDefault();
    try {
      const userId = getAuthenticatedUserId();
      const response = await userAPI.updateUserSettings(userId, settings);
      // Update local state with response data
      setSettings(response.data.settings || response.data);
      setEditSettingsMode(false);
      showMessage(t('settingsUpdatedSuccess'), 'success');
    } catch (err) {
      showMessage(err.response?.data?.message || t('errorUpdatingSettings'), 'error');
    }
  };

  // Loading state UI
  if (loading) {
    return (
      <div className="user-profile-page">
        <Hero title={t('myProfile')} subtitle={t('manageYourInfo')} size="small" align="center" />
        <div className="container"><div className="loading-state"><Spinner size="lg" /><p>{t('loadingProfile')}</p></div></div>
      </div>
    );
  }

  // Error state UI
  if (error) {
    return (
      <div className="user-profile-page">
        <Hero title={t('myProfile')} subtitle={t('manageYourInfo')} size="small" align="center" />
        <div className="container"><div className="error-state"><Icon name="alert" size="2xl" /><p>{error}</p></div></div>
      </div>
    );
  }

  return (
    <div className="user-profile-page">
      {/* Page hero section */}
      <Hero title={t('myProfile')} subtitle={t('manageYourInfo')} size="small" align="center" />

      <div className="container">
        {/* Message toast for success/error feedback */}
        {message.text && (
          <div className={`message-toast ${message.type === 'success' ? 'message-toast--success' : 'message-toast--error'} animate-fadeInDown`}>
            <Icon name={message.type === 'success' ? 'check' : 'alert'} size="sm" />{message.text}
          </div>
        )}

        {/* Profile grid containing info and settings cards */}
        <div className="profile-grid">
          {/* Profile information card with edit functionality */}
          <ProfileInfoCard t={t} profile={profile} setProfile={setProfile} editMode={editMode}
            setEditMode={setEditMode} onSubmit={handleProfileUpdate} />
          {/* Settings card with edit functionality */}
          <SettingsCard t={t} settings={settings} setSettings={setSettings} editMode={editSettingsMode}
            setEditMode={setEditSettingsMode} onSubmit={handleSettingsUpdate} />
        </div>
      </div>
    </div>
  );
};

export default UserProfilePage;

