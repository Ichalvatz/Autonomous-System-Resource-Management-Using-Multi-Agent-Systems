/**
 * Profiles Grid Component
 * 
 * Displays grid of preference profiles or empty state.
 * @module components/preferences/ProfilesGrid
 */

import React from 'react';
import { Button } from '../ui';
import ProfileCard from './ProfileCard';

/**
 * Renders grid of profiles or empty state
 */
const ProfilesGrid = ({ profiles, activeProfileId, t, onActivate, onEdit, onDelete, onCreateClick }) => {
    if (profiles.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-icon">⚙️</div>
                <h3>{t('noPreferenceProfiles')}</h3>
                <p>{t('createFirstProfile')}</p>
                <Button onClick={onCreateClick} variant="primary" size="lg">
                    {t('createProfile')}
                </Button>
            </div>
        );
    }

    return (
        <div className="profiles-grid">
            {profiles.map((profile, index) => {
                const isActive = profile.profileId === activeProfileId || profile.id === activeProfileId;
                return (
                    <ProfileCard
                        key={profile.id || profile.profileId}
                        t={t}
                        profile={profile}
                        isActive={isActive}
                        index={index}
                        onActivate={() => onActivate(profile.profileId || profile.id)}
                        onEdit={() => onEdit(profile)}
                        onDelete={() => onDelete(profile.profileId || profile.id)}
                    />
                );
            })}
        </div>
    );
};

export default ProfilesGrid;
