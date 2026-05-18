/**
 * Preference Form Hook
 * 
 * Manages form state for creating/editing preference profiles.
 * @module hooks/usePreferenceForm
 */

import { useState } from 'react';

const INITIAL_FORM_DATA = { name: '', categories: [] };

/**
 * Custom hook for managing preference profile form state
 * 
 * @returns {Object} Form state and handlers
 */
export const usePreferenceForm = () => {
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [editingProfile, setEditingProfile] = useState(null);
    const [formData, setFormData] = useState(INITIAL_FORM_DATA);

    /**
     * Opens edit mode for a profile
     */
    const startEdit = (profile) => {
        setEditingProfile(profile);
        setFormData({
            name: profile.name || profile.profileName || '',
            categories: profile.categories || []
        });
    };

    /**
     * Closes form and resets state
     */
    const closeForm = () => {
        setShowCreateForm(false);
        setEditingProfile(null);
        setFormData(INITIAL_FORM_DATA);
    };

    /**
     * Opens create form
     */
    const openCreateForm = () => {
        setShowCreateForm(true);
    };

    return {
        showCreateForm,
        editingProfile,
        formData,
        setFormData,
        startEdit,
        closeForm,
        openCreateForm,
    };
};
