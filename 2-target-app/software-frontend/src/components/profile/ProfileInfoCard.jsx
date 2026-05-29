/**
 * @fileoverview User profile information card component.
 * Displays and allows editing of personal information.
 * @module components/profile/ProfileInfoCard
 */

import React from 'react';
import { Button, Icon } from '../ui';

/**
 * Profile info card for editing/displaying user personal information
 */
const ProfileInfoCard = ({ t, profile, setProfile, editMode, setEditMode, onSubmit }) => {
    return (
        <div className="profile-card animate-fadeInUp">
            <div className="card-header">
                <div className="card-title">
                    <span className="card-icon">👤</span>
                    <h2>{t('personalInfo')}</h2>
                </div>
                {!editMode && (
                    <Button onClick={() => setEditMode(true)} variant="ghost" size="sm">
                        <Icon name="edit" size="sm" />
                        {t('edit')}
                    </Button>
                )}
            </div>

            {editMode ? (
                <form onSubmit={onSubmit} className="edit-form">
                    <div className="form-group">
                        <label className="form-label">{t('name')}</label>
                        <input type="text" value={profile?.name || ''} className="form-input" required
                            onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('email')}</label>
                        <input type="email" value={profile?.email || ''} className="form-input" required
                            onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('phone')}</label>
                        <input type="tel" value={profile?.phone || ''} className="form-input" placeholder="+30 xxx xxx xxxx"
                            onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">{t('dateOfBirth')}</label>
                        <input type="date" value={profile?.dateOfBirth || ''} className="form-input"
                            onChange={(e) => setProfile({ ...profile, dateOfBirth: e.target.value })} />
                    </div>
                    <div className="form-actions">
                        <Button type="submit" variant="primary"><Icon name="check" size="sm" />{t('save')}</Button>
                        <Button type="button" onClick={() => setEditMode(false)} variant="ghost">{t('cancel')}</Button>
                    </div>
                </form>
            ) : (
                <div className="info-grid">
                    <div className="info-item">
                        <div className="info-icon">👤</div>
                        <div className="info-content">
                            <span className="info-label">{t('name')}</span>
                            <span className="info-value">{profile?.name || '—'}</span>
                        </div>
                    </div>
                    <div className="info-item">
                        <div className="info-icon">📧</div>
                        <div className="info-content">
                            <span className="info-label">{t('email')}</span>
                            <span className="info-value">{profile?.email || '—'}</span>
                        </div>
                    </div>
                    <div className="info-item">
                        <div className="info-icon">📱</div>
                        <div className="info-content">
                            <span className="info-label">{t('phone')}</span>
                            <span className="info-value">{profile?.phone || t('notSet')}</span>
                        </div>
                    </div>
                    <div className="info-item">
                        <div className="info-icon">🎂</div>
                        <div className="info-content">
                            <span className="info-label">{t('dateOfBirth')}</span>
                            <span className="info-value">{profile?.dateOfBirth || t('notSet')}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileInfoCard;
