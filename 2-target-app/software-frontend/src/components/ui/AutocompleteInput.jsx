/**
 * @fileoverview Autocomplete input component.
 * Input with debounced search and dropdown suggestions.
 * @module components/ui/AutocompleteInput
 */

import React from 'react';
import PropTypes from 'prop-types';
import Icon from './Icon';
import Spinner from './Spinner';
import { useAutocomplete } from '../../hooks/useAutocomplete';
import './AutocompleteInput.css';

/**
 * AutocompleteInput Component - Input with autocomplete suggestions
 */
const AutocompleteInput = ({
    value, onChange, onSelect, searchFn, placeholder = '', icon = 'search',
    debounceMs = 300, minChars = 2, maxSuggestions = 5, className = '',
    disabled = false, required = false, name = '', ...rest
}) => {
    const {
        wrapperRef, inputValue, suggestions, isLoading, showDropdown, highlightedIndex,
        handleInputChange, handleKeyDown, handleFocus, handleSelect, setHighlightedIndex
    } = useAutocomplete({ value, searchFn, minChars, maxSuggestions, debounceMs, onChange, onSelect, name });

    return (
        <div ref={wrapperRef} className={`autocomplete-wrapper ${className}`}>
            <div className="autocomplete-input-container">
                {icon && <Icon name={icon} size="sm" className="autocomplete-icon" />}
                <input type="text" name={name} value={inputValue} onChange={handleInputChange}
                    onKeyDown={handleKeyDown} onFocus={handleFocus} placeholder={placeholder}
                    className="form-input autocomplete-input" disabled={disabled} required={required}
                    autoComplete="off" aria-autocomplete="list" aria-haspopup="listbox" {...rest} />
                {isLoading && <div className="autocomplete-loading"><Spinner size="xs" /></div>}
            </div>

            {showDropdown && suggestions.length > 0 && (
                <ul className="autocomplete-dropdown" role="listbox" aria-label="Location suggestions">
                    {suggestions.map((suggestion, index) => (
                        <li key={`${suggestion.lat}-${suggestion.lng}-${index}`} role="option"
                            aria-selected={highlightedIndex === index}
                            className={`autocomplete-item ${highlightedIndex === index ? 'autocomplete-item--highlighted' : ''}`}
                            onClick={() => handleSelect(suggestion)} onMouseEnter={() => setHighlightedIndex(index)}>
                            <Icon name="location" size="sm" className="autocomplete-item-icon" />
                            <div className="autocomplete-item-content">
                                <span className="autocomplete-item-text">{suggestion.displayName}</span>
                                {suggestion.type && <span className="autocomplete-item-type">{suggestion.type}</span>}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

AutocompleteInput.propTypes = {
    value: PropTypes.string, onChange: PropTypes.func, onSelect: PropTypes.func,
    searchFn: PropTypes.func.isRequired, placeholder: PropTypes.string, icon: PropTypes.string,
    debounceMs: PropTypes.number, minChars: PropTypes.number, maxSuggestions: PropTypes.number,
    className: PropTypes.string, disabled: PropTypes.bool, required: PropTypes.bool, name: PropTypes.string,
};

export default AutocompleteInput;
