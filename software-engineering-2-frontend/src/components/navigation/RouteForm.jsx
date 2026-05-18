/**
 * @fileoverview Route planning form component.
 * Used in NavigationPage for entering origin/destination and transport mode.
 * @module components/navigation/RouteForm
 */

import React from 'react';
import { Button, Icon, Spinner } from '../ui';
import LocationField from './LocationField';

/**
 * Route form component for NavigationPage
 * Form for entering route start/end locations and transport mode
 */
const RouteForm = ({
    t,
    formData,
    setFormData,
    loading,
    geocodingInput,
    error,
    onSubmit,
}) => {
    /** Handle input field changes and update form state */
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    /** Map transport mode to display icon */
    const getTransportIcon = (mode) => {
        const icons = { 'WALKING': '🚶', 'DRIVING': '🚗', 'PUBLIC_TRANSPORT': '🚌' };
        return icons[mode] || '🗺️';
    };

    return (
        <div className="route-form-card">
            <div className="card-title">
                <Icon name="route" size="lg" />
                <h3>{t('calculateRoute')}</h3>
            </div>

            {/* Route form with autocomplete inputs */}
            <form onSubmit={onSubmit}>
                {/* Start location section */}
                <LocationField
                    name="fromLocation"
                    label={t('startPoint')}
                    icon="📍"
                    value={formData.fromLocation}
                    onChange={handleInputChange}
                    onSelect={(suggestion) => {
                        setFormData(prev => ({ ...prev, fromLocation: suggestion.displayName }));
                    }}
                    placeholder={t('searchLocationPlaceholder') || 'e.g., Athens, Greece'}
                    t={t}
                />

                <div className="location-connector">
                    <div className="connector-line"></div>
                    <div className="connector-icon">↓</div>
                    <div className="connector-line"></div>
                </div>

                {/* Destination location section */}
                <LocationField
                    name="toLocation"
                    label={t('destination')}
                    icon="🎯"
                    value={formData.toLocation}
                    onChange={handleInputChange}
                    onSelect={(suggestion) => {
                        setFormData(prev => ({ ...prev, toLocation: suggestion.displayName }));
                    }}
                    placeholder={t('searchLocationPlaceholder') || 'e.g., Thessaloniki, Greece'}
                    t={t}
                />

                {/* Transport mode selection */}
                <div className="transport-section">
                    <label className="form-label">{t('transportMode')}</label>
                    <div className="transport-options">
                        {['WALKING', 'DRIVING', 'PUBLIC_TRANSPORT'].map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                className={`transport-option ${formData.transportMode === mode ? 'transport-option--active' : ''}`}
                                onClick={() => setFormData(prev => ({ ...prev, transportMode: mode }))}
                            >
                                <span className="transport-icon">{getTransportIcon(mode)}</span>
                                <span className="transport-label">
                                    {mode === 'WALKING' && t('walking')}
                                    {mode === 'DRIVING' && t('driving')}
                                    {mode === 'PUBLIC_TRANSPORT' && t('publicTransport')}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Submit button with loading state */}
                <Button type="submit" variant="primary" size="lg" fullWidth disabled={loading}>
                    {loading ? <Spinner size="sm" /> : <Icon name="navigation" size="sm" />}
                    {geocodingInput ? t('searchingLocations') || 'Searching locations...' : loading ? t('calculating') : t('calculateRoute')}
                </Button>

                {/* Error display */}
                {error && (
                    <div className="error-message">
                        <Icon name="alert" size="sm" />
                        {error}
                    </div>
                )}
            </form>
        </div>
    );
};

export default RouteForm;
