/**
 * Preference Profiles Hook
 * 
 * Manages preference profile data fetching and CRUD operations.
 * @module hooks/usePreferenceProfiles
 */

import { useState, useEffect, useCallback } from 'react';
import { preferenceAPI, userAPI, getAuthenticatedUserId } from '../api';

/**
 * Fetches profiles and active profile ID from API
 * @private
 */
const fetchProfilesData = async (userId) => {
    const [profilesResponse, userResponse] = await Promise.all([
        preferenceAPI.getPreferenceProfiles(userId),
        userAPI.getUserProfile(userId)
    ]);

    const userActiveProfile = userResponse.data.user?.activeProfile || userResponse.data.activeProfile;
    const profiles = profilesResponse.data.profiles || [];

    return { profiles, activeProfileId: userActiveProfile };
};

/**
 * Custom hook for managing preference profiles
 * 
 * @param {Function} t - Translation function
 * @param {Function} showError - Error toast function
 * @returns {Object} Profile state and CRUD operations
 */
export const usePreferenceProfiles = (t, showError) => {
    const [profiles, setProfiles] = useState([]);
    const [activeProfileId, setActiveProfileId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    /**
     * Fetches profiles from API
     */
    const fetchProfiles = useCallback(async () => {
        setLoading(true);
        try {
            const userId = getAuthenticatedUserId();
            const { profiles, activeProfileId } = await fetchProfilesData(userId);
            
            setActiveProfileId(activeProfileId);
            setProfiles(profiles);
        } catch (err) {
            if (err.message === 'User not authenticated') {
                setError(t('notAuthenticated'));
            }
            console.error('Error fetching profiles:', err);
        } finally {
            setLoading(false);
        }
    }, [t]);

    // Fetch profiles on mount
    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);

    /**
     * Creates a new preference profile
     */
    const createProfile = async (formData) => {
        try {
            const userId = getAuthenticatedUserId();
            const payload = {
                profileName: formData.name,
                categories: formData.categories
            };
            const response = await preferenceAPI.createPreferenceProfile(userId, payload);

            // Auto-activate first profile if none is currently active
            if (!activeProfileId && response.data.profiles?.length > 0) {
                const newProfile = response.data.profiles[response.data.profiles.length - 1];
                const newProfileId = newProfile?.profileId || newProfile?.id;
                if (newProfileId) {
                    await preferenceAPI.setActiveProfile(userId, newProfileId);
                }
            }

            fetchProfiles();
        } catch (err) {
            showError(t('errorCreatingProfile'));
        }
    };

    /**
     * Updates an existing preference profile
     */
    const updateProfile = async (editingProfile, formData) => {
        try {
            const userId = getAuthenticatedUserId();
            const profileId = editingProfile.profileId || editingProfile.id;

            if (!profileId) {
                showError(t('errorProfileIdNotFound'));
                return;
            }

            const payload = { categories: formData.categories || [] };
            if (formData.name) {
                payload.profileName = formData.name;
            }

            await preferenceAPI.updatePreferenceProfile(userId, profileId, payload);
            fetchProfiles();
        } catch (err) {
            showError(t('errorUpdatingProfile'));
        }
    };

    /**
     * Deletes a preference profile
     */
    const deleteProfile = async (profileId) => {
        if (!window.confirm(t('confirmDeleteProfile'))) return;
        
        try {
            const userId = getAuthenticatedUserId();
            await preferenceAPI.deletePreferenceProfile(userId, profileId);
            fetchProfiles();
        } catch (err) {
            showError(t('errorDeletingProfile'));
        }
    };

    /**
     * Sets a profile as active
     */
    const setActive = async (profileId) => {
        const previousActive = activeProfileId;
        setActiveProfileId(profileId);
        
        try {
            const userId = getAuthenticatedUserId();
            await preferenceAPI.setActiveProfile(userId, profileId);
            fetchProfiles();
        } catch (err) {
            setActiveProfileId(previousActive);
            showError(t('errorActivatingProfile'));
        }
    };

    return {
        profiles,
        activeProfileId,
        loading,
        error,
        createProfile,
        updateProfile,
        deleteProfile,
        setActive,
    };
};
