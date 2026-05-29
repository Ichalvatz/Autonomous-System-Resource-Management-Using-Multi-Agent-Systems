/**
 * @fileoverview Preference profile form component.
 * Form for creating/editing preference profiles with category selection.
 * @module components/preferences/PreferenceForm
 */

import React from 'react';
import { Button, Icon } from '../ui';

// Available place categories for preferences
const AVAILABLE_CATEGORIES = ['MUSEUM', 'RESTAURANT', 'BEACH', 'CULTURE', 'PARK', 'NIGHTLIFE', 'SHOPPING', 'SPORTS'];

// Emoji icons for each category
const CATEGORY_ICONS = {
    'MUSEUM': '🏛️', 'RESTAURANT': '🍽️', 'BEACH': '🏖️', 'CULTURE': '🎭',
    'PARK': '🌳', 'NIGHTLIFE': '🌙', 'SHOPPING': '🛍️', 'SPORTS': '⚽',
};

/**
 * Preference form for creating/editing preference profiles
 */
const PreferenceForm = ({ t, formData, setFormData, editingProfile, onSubmit, onClose, showError }) => {
    const toggleCategory = (category) => {
        setFormData(prev => {
            const categories = prev.categories || [];
            return {
                ...prev,
                categories: categories.includes(category)
                    ? categories.filter(c => c !== category)
                    : [...categories, category]
            };
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Validate name
        if (!formData.name || !formData.name.trim()) {
            showError(t('profileNameRequired'));
            return;
        }

        // Validate categories
        if (!formData.categories || formData.categories.length === 0) {
            showError(t('categoryMinOne'));
            return;
        }

        onSubmit(e);
    };

    return (
        <div className="preference-form animate-fadeInUp">
            <div className="form-header">
                <h3>{editingProfile ? t('editProfile') : t('newPreferenceProfile')}</h3>
                <button className="close-button" onClick={onClose}>
                    <Icon name="close" size="sm" />
                </button>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label className="form-label">{t('profileName')}</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="form-input"
                        placeholder={t('profileNamePlaceholder')}
                        required
                    />
                </div>

                <div className="form-group">
                    <label className="form-label">{t('categories')}</label>
                    <div className="category-grid">
                        {AVAILABLE_CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                type="button"
                                className={`category-chip ${(formData.categories || []).includes(cat) ? 'category-chip--active' : ''}`}
                                onClick={() => toggleCategory(cat)}
                            >
                                <span className="category-icon">{CATEGORY_ICONS[cat]}</span>
                                <span className="category-name">{t(cat)}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="form-actions">
                    <Button type="submit" variant="primary">
                        {editingProfile ? t('update') : t('create')}
                    </Button>
                    <Button type="button" variant="ghost" onClick={onClose}>
                        {t('cancel')}
                    </Button>
                </div>
            </form>
        </div>
    );
};

export { PreferenceForm, CATEGORY_ICONS };
export default PreferenceForm;

