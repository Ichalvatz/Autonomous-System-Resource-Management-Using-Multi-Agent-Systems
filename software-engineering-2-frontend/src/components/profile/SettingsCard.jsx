/**
 * @fileoverview User settings card component.
 * Displays and allows editing of notification settings.
 * @module components/profile/SettingsCard
 */

import React from 'react';
import { Button, Icon } from '../ui';

/**
 * Settings card for editing/displaying user settings
 */
const SettingsCard = ({ t, settings, setSettings, editMode, setEditMode, onSubmit }) => {
    // Render settings card with edit/display modes
    return (
        <div className="settings-card animate-fadeInUp stagger-1">
            <div className="card-header">
                <div className="card-title">
                    <span className="card-icon">⚙️</span>
                    <h2>{t('settings')}</h2>
                </div>
                {!editMode && (
                    <Button onClick={() => setEditMode(true)} variant="ghost" size="sm">
                        <Icon name="edit" size="sm" />
                        {t('edit')}
                    </Button>
                )}
            </div>

            {/* Edit mode: form with toggle switches */}
            {editMode ? (
                <form onSubmit={onSubmit} className="edit-form">
                    {/* Email notifications toggle */}
                    <div className="toggle-group">
                        <label className="toggle-label">
                            <div className="toggle-info">
                                <span className="toggle-icon">📧</span>
                                <div className="toggle-text">
                                    <span className="toggle-name">{t('emailNotifications')}</span>
                                    <span className="toggle-description">Receive updates via email</span>
                                </div>
                            </div>
                            <div className={`toggle ${settings?.emailNotifications ? 'toggle--active' : ''}`}>
                                <input type="checkbox" checked={settings?.emailNotifications || false}
                                    onChange={(e) => setSettings({ ...settings, emailNotifications: e.target.checked })} />
                                <span className="toggle-slider"></span>
                            </div>
                        </label>
                    </div>

                    {/* Push notifications toggle */}
                    <div className="toggle-group">
                        <label className="toggle-label">
                            <div className="toggle-info">
                                <span className="toggle-icon">🔔</span>
                                <div className="toggle-text">
                                    <span className="toggle-name">{t('pushNotifications')}</span>
                                    <span className="toggle-description">Get push notifications</span>
                                </div>
                            </div>
                            <div className={`toggle ${settings?.pushNotifications ? 'toggle--active' : ''}`}>
                                <input type="checkbox" checked={settings?.pushNotifications || false}
                                    onChange={(e) => setSettings({ ...settings, pushNotifications: e.target.checked })} />
                                <span className="toggle-slider"></span>
                            </div>
                        </label>
                    </div>

                    <div className="form-actions">
                        <Button type="submit" variant="primary"><Icon name="check" size="sm" />{t('save')}</Button>
                        <Button type="button" onClick={() => setEditMode(false)} variant="ghost">{t('cancel')}</Button>
                    </div>
                </form>
            ) : (
                /* Display mode: read-only settings list */
                <div className="settings-list">
                    <div className="setting-item">
                        <div className="setting-icon">📧</div>
                        <div className="setting-content">
                            <span className="setting-label">{t('emailNotifications')}</span>
                            <span className={`setting-status ${settings?.emailNotifications ? 'setting-status--on' : 'setting-status--off'}`}>
                                {settings?.emailNotifications ? t('enabled') : t('disabled')}
                            </span>
                        </div>
                    </div>
                    <div className="setting-item">
                        <div className="setting-icon">🔔</div>
                        <div className="setting-content">
                            <span className="setting-label">{t('pushNotifications')}</span>
                            <span className={`setting-status ${settings?.pushNotifications ? 'setting-status--on' : 'setting-status--off'}`}>
                                {settings?.pushNotifications ? t('enabled') : t('disabled')}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SettingsCard;
