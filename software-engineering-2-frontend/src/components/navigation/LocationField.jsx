/**
 * Location Field Component
 * 
 * Reusable location input field with autocomplete functionality.
 * 
 * @module components/navigation/LocationField
 */

import React from 'react';
import { AutocompleteInput } from '../ui';
import { searchLocations } from '../../utils/geocoding';

/**
 * LocationField Component
 * Generic location input field with section header and autocomplete
 * 
 * @param {Object} props - Component props
 * @param {string} props.label - Section header label
 * @param {string} props.icon - Icon emoji for section header
 * @param {string} props.value - Current input value
 * @param {Function} props.onChange - Input change handler
 * @param {Function} props.onSelect - Autocomplete selection handler
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message
 * @param {string} props.placeholder - Input placeholder text
 * @param {Function} props.t - Translation function
 * @returns {React.ReactElement} Location input field
 */
const LocationField = ({
  label,
  icon,
  value,
  onChange,
  onSelect,
  loading: _ = false,
  error = null,
  placeholder,
  name,
  t
}) => {
  return (
    <div className="location-section">
      <div className="section-header">
        <span className="section-icon">{icon}</span>
        <h4>{label}</h4>
      </div>
      <div className="form-group">
        <label className="form-label">{t('enterLocation')}</label>
        <AutocompleteInput
          name={name}
          value={value}
          onChange={onChange}
          onSelect={onSelect}
          searchFn={searchLocations}
          placeholder={placeholder || t('searchLocationPlaceholder') || 'e.g., Athens, Greece'}
          icon={null}
          required
        />
        {error && (
          <div className="field-error">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default LocationField;
