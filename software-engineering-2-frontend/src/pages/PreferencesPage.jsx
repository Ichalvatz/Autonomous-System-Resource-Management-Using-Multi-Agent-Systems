/**
 * @fileoverview Preferences Page Component for managing user preference profiles.
 * 
 * This page allows users to create, view, edit, and delete preference profiles
 * that customize their recommendation experience. Users can have multiple profiles
 * and set one as active to personalize place recommendations.
 * 
 * @module pages/PreferencesPage
 */

import React from 'react';
import { useTranslation } from '../i18n';
import { usePreferenceProfiles } from '../hooks/usePreferenceProfiles';
import { usePreferenceForm } from '../hooks/usePreferenceForm';
import Hero from '../components/Hero.jsx';
import { Button, Spinner, Icon, useToast } from '../components/ui';
import PreferenceForm from '../components/preferences/PreferenceForm';
import ProfilesGrid from '../components/preferences/ProfilesGrid';
import './PreferencesPage.css';

/**
 * PreferencesPage Component
 * 
 * Provides a complete interface for managing user preference profiles.
 * @component
 */
const PreferencesPage = () => {
    const { t } = useTranslation();
    const { error: showError } = useToast();

    // Profile data and operations
    const {
        profiles,
        activeProfileId,
        loading,
        error,
        createProfile,
        updateProfile,
        deleteProfile,
        setActive,
    } = usePreferenceProfiles(t, showError);

    // Form state management
    const {
        showCreateForm,
        editingProfile,
        formData,
        setFormData,
        startEdit,
        closeForm,
        openCreateForm,
    } = usePreferenceForm();

    /**
     * Handles profile creation
     */
    const handleCreate = async (e) => {
        e.preventDefault();
        await createProfile(formData);
        closeForm();
    };

    /**
     * Handles profile update
     */
    const handleUpdate = async (e) => {
        e.preventDefault();
        await updateProfile(editingProfile, formData);
        closeForm();
    };

    // Loading state UI
    if (loading) {
        return (
            <div className="preferences-page">
                <Hero title={t('preferenceProfiles')} subtitle={t('managePreferenceProfiles')}
                    size="small" align="center" />
                <div className="container">
                    <div className="loading-state">
                        <Spinner size="lg" />
                        <p>{t('loadingProfile')}</p>
                    </div>
                </div>
            </div>
        );
    }

    // Error state UI
    if (error) {
        return (
            <div className="preferences-page">
                <Hero title={t('preferenceProfiles')} subtitle={t('managePreferenceProfiles')}
                    size="small" align="center" />
                <div className="container">
                    <div className="error-state">
                        <Icon name="alert" size="2xl" />
                        <p>{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="preferences-page">
            <Hero title={t('preferenceProfiles')} subtitle={t('managePreferenceProfiles')}
                size="small" align="center" />

            <div className="container">
                {/* Create new profile button */}
                <div className="page-actions">
                    <Button onClick={openCreateForm} variant="primary" size="lg">
                        <Icon name="plus" size="sm" />
                        {t('newProfile')}
                    </Button>
                </div>

                {/* Create/Edit form modal */}
                {(showCreateForm || editingProfile) && (
                    <PreferenceForm
                        t={t}
                        formData={formData}
                        setFormData={setFormData}
                        editingProfile={editingProfile}
                        onSubmit={editingProfile ? handleUpdate : handleCreate}
                        onClose={closeForm}
                        showError={showError}
                    />
                )}

                {/* Profiles grid or empty state */}
                <ProfilesGrid
                    profiles={profiles}
                    activeProfileId={activeProfileId}
                    t={t}
                    onActivate={setActive}
                    onEdit={startEdit}
                    onDelete={deleteProfile}
                    onCreateClick={openCreateForm}
                />
            </div>
        </div>
    );
};

export default PreferencesPage;

