/**
 * @fileoverview Autocomplete input hook.
 * Manages debounced search, suggestions, and keyboard navigation.
 * @module hooks/useAutocomplete
 */

import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Hook for managing autocomplete state and behavior
 */
export const useAutocomplete = ({ value, searchFn, minChars = 2, maxSuggestions = 5, debounceMs = 300, onChange, onSelect, name }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [inputValue, setInputValue] = useState(value || '');
    const wrapperRef = useRef(null);
    const debounceTimerRef = useRef(null);

    useEffect(() => { setInputValue(value || ''); }, [value]);

    // Click outside handler
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setShowDropdown(false);
                setHighlightedIndex(-1);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Cleanup timer on unmount
    useEffect(() => {
        return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); };
    }, []);

    const performSearch = useCallback(async (query) => {
        if (!query || query.trim().length < minChars) {
            setSuggestions([]); setShowDropdown(false); return;
        }
        setIsLoading(true);
        try {
            const results = await searchFn(query.trim(), maxSuggestions);
            setSuggestions(results || []);
            setShowDropdown(results && results.length > 0);
            setHighlightedIndex(-1);
        } catch { setSuggestions([]); setShowDropdown(false); }
        finally { setIsLoading(false); }
    }, [searchFn, minChars, maxSuggestions]);

    const handleInputChange = (e) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        if (onChange) onChange(e);
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => performSearch(newValue), debounceMs);
    };

    const handleSelect = (suggestion) => {
        setInputValue(suggestion.displayName);
        setSuggestions([]); setShowDropdown(false); setHighlightedIndex(-1);
        if (onSelect) onSelect(suggestion);
        if (onChange) onChange({ target: { name, value: suggestion.displayName } });
    };

    const handleKeyDown = (e) => {
        if (!showDropdown || suggestions.length === 0) return;
        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); setHighlightedIndex((prev) => prev < suggestions.length - 1 ? prev + 1 : 0); break;
            case 'ArrowUp': e.preventDefault(); setHighlightedIndex((prev) => prev > 0 ? prev - 1 : suggestions.length - 1); break;
            case 'Enter': e.preventDefault(); if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) handleSelect(suggestions[highlightedIndex]); break;
            case 'Escape': setShowDropdown(false); setHighlightedIndex(-1); break;
            default: break;
        }
    };

    const handleFocus = () => { if (suggestions.length > 0) setShowDropdown(true); };

    return {
        wrapperRef, inputValue, suggestions, isLoading, showDropdown, highlightedIndex,
        handleInputChange, handleKeyDown, handleFocus, handleSelect, setHighlightedIndex
    };
};
