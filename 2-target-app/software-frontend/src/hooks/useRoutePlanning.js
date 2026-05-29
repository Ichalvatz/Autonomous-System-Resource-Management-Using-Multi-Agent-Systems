/**
 * Route Planning Hook
 * 
 * Manages route calculation state and logic for navigation functionality.
 * Handles geocoding of locations and fetching route data from backend and OSRM.
 * 
 * @module hooks/useRoutePlanning
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { navigationAPI } from '../api';
import { reverseGeocode, forwardGeocode, formatCoordinates } from '../utils/geocoding';
import { fetchRoute } from '../utils/routing';

/**
 * Geocodes a single point and updates its display name
 * @private
 */
const geocodeSinglePoint = async (point, setName, setLoadingState) => {
    if (!point?.latitude || !point?.longitude) return;
    
    setLoadingState(true);
    try {
        const result = await reverseGeocode(point.latitude, point.longitude);
        setName(result.name);
    } catch {
        setName(formatCoordinates(point.latitude, point.longitude));
    } finally {
        setLoadingState(false);
    }
};

/**
 * Geocodes input location strings to coordinates
 * @private
 */
const geocodeInputLocations = async (fromLocation, toLocation, t) => {
    const [fromResult, toResult] = await Promise.all([
        forwardGeocode(fromLocation),
        forwardGeocode(toLocation)
    ]);
    
    if (!fromResult) {
        throw new Error(t('locationNotFound', { location: fromLocation }) || `Could not find: ${fromLocation}`);
    }
    if (!toResult) {
        throw new Error(t('locationNotFound', { location: toLocation }) || `Could not find: ${toLocation}`);
    }
    
    return { fromResult, toResult };
};

/**
 * Fetches route geometry from OSRM
 * @private
 */
const fetchOsrmRoute = async (fromResult, toResult, transportMode) => {
    return await fetchRoute({
        startLat: fromResult.lat,
        startLng: fromResult.lng,
        endLat: toResult.lat,
        endLng: toResult.lng,
        transportMode,
    });
};

/**
 * Fetches route information from backend API
 * @private
 */
const fetchBackendRoute = async (fromResult, toResult, transportMode) => {
    return await navigationAPI.getRoute({
        userLatitude: fromResult.lat,
        userLongitude: fromResult.lng,
        placeLatitude: toResult.lat,
        placeLongitude: toResult.lng,
        transportationMode: transportMode,
    });
};

/**
 * Merges OSRM geometry data with backend route information
 * @private
 */
const mergeRouteData = (routeInfo, osrmResult) => {
    if (osrmResult.success && osrmResult.distance && osrmResult.duration) {
        routeInfo.distance = osrmResult.distance;
        routeInfo.estimatedTime = osrmResult.duration;
    }
    return routeInfo;
};

/**
 * Processes OSRM result and updates route state
 * @private
 */
const processOsrmResult = (osrmResult, setRouteGeometry, setRouteError) => {
    if (!osrmResult.success) {
        setRouteError(osrmResult.message);
        return;
    }
    
    setRouteGeometry(osrmResult.geometry);
    
    if (osrmResult.requiresFerry && osrmResult.ferryWarning) {
        setRouteError(osrmResult.ferryWarning);
    }
};

/**
 * Resets display states when loading begins
 * @private
 */
const resetRouteDisplayStates = (setStartName, setEndName, setRouteGeometry, setRouteError) => {
    setStartName(null);
    setEndName(null);
    setRouteGeometry(null);
    setRouteError(null);
};

/**
 * Custom hook for route planning functionality
 * 
 * @param {Function} t - Translation function
 * @param {string} initialFrom - Initial start location
 * @param {string} initialTo - Initial destination location
 * @returns {Object} Route planning state and actions
 */
export const useRoutePlanning = (t, initialFrom = 'Athens, Greece', initialTo = 'Thessaloniki, Greece') => {
    // Route data from backend
    const [routeData, setRouteData] = useState(null);
    
    // Loading states
    const [loading, setLoading] = useState(false);
    const [geocodingInput, setGeocodingInput] = useState(false);
    const [geocodingStart, setGeocodingStart] = useState(false);
    const [geocodingEnd, setGeocodingEnd] = useState(false);
    
    // Error states
    const [error, setError] = useState(null);
    const [routeError, setRouteError] = useState(null);
    
    // Form state
    const [formData, setFormData] = useState({
        fromLocation: initialFrom,
        toLocation: initialTo,
        transportMode: 'DRIVING',
    });
    
    // Display names
    const [startName, setStartName] = useState(null);
    const [endName, setEndName] = useState(null);
    
    // Route visualization
    const [routeGeometry, setRouteGeometry] = useState(null);
    
    // Ref for results scrolling
    const resultsRef = useRef(null);

    /**
     * Performs reverse geocoding on route start and end points
     */
    const geocodeLocations = useCallback(async () => {
        if (!routeData) return;
        
        geocodeSinglePoint(routeData.startPoint, setStartName, setGeocodingStart);
        geocodeSinglePoint(routeData.endPoint, setEndName, setGeocodingEnd);
    }, [routeData]);

    // Trigger geocoding when route data changes
    useEffect(() => {
        geocodeLocations();
    }, [geocodeLocations]);

    // Reset display states when loading begins
    useEffect(() => {
        if (loading) {
            resetRouteDisplayStates(setStartName, setEndName, setRouteGeometry, setRouteError);
        }
    }, [loading]);

    /**
     * Scrolls to results section
     */
    const scrollToResults = useCallback(() => {
        setTimeout(() => {
            if (resultsRef.current) {
                resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 100);
    }, []);

    /**
     * Calculate route based on current form data
     */
    const calculateRoute = useCallback(async () => {
        setLoading(true);
        setGeocodingInput(true);
        setError(null);
        setRouteError(null);
        setRouteGeometry(null);

        try {
            // Step 1: Forward geocode both locations
            const { fromResult, toResult } = await geocodeInputLocations(
                formData.fromLocation,
                formData.toLocation,
                t
            );
            setGeocodingInput(false);

            // Step 2: Fetch route geometry from OSRM
            const osrmResult = await fetchOsrmRoute(fromResult, toResult, formData.transportMode);
            processOsrmResult(osrmResult, setRouteGeometry, setRouteError);

            // Step 3: Fetch route info from backend API
            const response = await fetchBackendRoute(fromResult, toResult, formData.transportMode);

            // Step 4: Merge and set route data
            setRouteData(mergeRouteData(response.data.route, osrmResult));
            scrollToResults();
        } catch (err) {
            setError(err.message || t('errorCalculatingRoute'));
        } finally {
            setLoading(false);
            setGeocodingInput(false);
        }
    }, [formData, t, scrollToResults]);

    return {
        // State
        routeData,
        loading,
        geocodingInput,
        geocodingStart,
        geocodingEnd,
        error,
        routeError,
        formData,
        startName,
        endName,
        routeGeometry,
        resultsRef,
        
        // Actions
        setFormData,
        calculateRoute,
    };
};
