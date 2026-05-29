/**
 * @fileoverview Preference profile card component.
 * Displays profile info with activate, edit, and delete actions.
 * @module components/preferences/ProfileCard
 */

import React from 'react';
import { Button, Icon } from '../ui';
import { CATEGORY_ICONS } from './PreferenceForm';

/**
 * Profile card component for displaying a preference profile
 */
const ProfileCard = ({ t, profile, isActive, index, onActivate, onEdit, onDelete }) => {
    const profileName = profile.name || profile.profileName || t('unnamed');

    return (
        <div
            className={`profile-card ${isActive ? 'profile-card--active' : ''} animate-fadeInUp`}
            style={{ animationDelay: `${index * 0.1}s` }}
        >
            <div className="profile-header">
                <h3>{profileName}</h3>
                {isActive && (
                    <span className="active-badge">
                        <Icon name="check" size="sm" />
                        {t('active')}
                    </span>
                )}
            </div>

            <div className="profile-content">
                <div className="profile-section">
                    <h4>{t('categories')}</h4>
                    <div className="profile-tags">
                        {(profile.categories || []).map(cat => (
                            <span key={cat} className="profile-tag">
                                {CATEGORY_ICONS[cat]} {t(cat)}
                            </span>
                        ))}
                        {(!profile.categories || profile.categories.length === 0) && (
                            <span className="no-data">{t('noCategoriesSelected')}</span>
                        )}
                    </div>
                </div>
            </div>

            <div className="profile-actions">
                {!isActive && (
                    <Button onClick={onActivate} variant="secondary" size="sm">
                        <Icon name="check" size="sm" />
                        {t('activate')}
                    </Button>
                )}
                <Button onClick={onEdit} variant="outline" size="sm">
                    <Icon name="edit" size="sm" />
                    {t('edit')}
                </Button>
                <Button onClick={onDelete} variant="danger" size="sm">
                    <Icon name="trash" size="sm" />
                    {t('delete')}
                </Button>
            </div>
        </div>
    );
};

export default ProfileCard;
