/**
 * RouteMap Component
 * 
 * Interactive map displaying route with polyline using Leaflet.
 * Features:
 * - Custom colored markers (green for start, red for end)
 * - Route polyline displaying actual road path
 * - Popups with location names
 * - Auto-fit bounds to show entire route
 * - OpenStreetMap tile layer (free, no API key)
 */

import React, { useEffect, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import './RouteMap.css';

import L from 'leaflet';

/** Route line colors for different transport modes */
const ROUTE_LINE_COLORS = {
    'WALKING': '#10b981',
    'DRIVING': '#3b82f6',
    'PUBLIC_TRANSPORT': '#f59e0b',
};

/** Default map configuration */
const DEFAULT_CENTER = [39.0742, 21.8243];
const DEFAULT_ZOOM = 6;

/** Create custom marker icon */
const createMarkerIcon = (color, label) => L.divIcon({
    className: 'custom-marker',
    html: `<div class="marker-pin marker-pin--${color}"><span class="marker-label">${label}</span></div>`,
    iconSize: [30, 42],
    iconAnchor: [15, 42],
    popupAnchor: [0, -42],
});

/** Create popup content for marker */
const createPopupContent = (title, name, lat, lng) => `
  <div class="map-popup">
    <strong>${title}</strong>
    <span class="popup-name">${name || 'Loading...'}</span>
    <span class="popup-coords">${lat.toFixed(4)}, ${lng.toFixed(4)}</span>
  </div>
`;

/** Add route polyline to map */
const addRouteLine = (map, geometry, transportMode) => {
    const lineColor = ROUTE_LINE_COLORS[transportMode] || ROUTE_LINE_COLORS['DRIVING'];

    // Shadow line for visibility
    const shadowLine = L.polyline(geometry, {
        color: '#1e293b', weight: 8, opacity: 0.3, lineCap: 'round', lineJoin: 'round',
    }).addTo(map);

    // Main route line
    const routeLine = L.polyline(geometry, {
        color: lineColor, weight: 5, opacity: 0.8, lineCap: 'round', lineJoin: 'round',
    }).addTo(map);

    return { routeLine, shadowLine };
};

/** Add fallback straight line when no route geometry available */
const addStraightLine = (map, start, end) => {
    return L.polyline(
        [[start.lat, start.lng], [end.lat, end.lng]],
        { color: '#94a3b8', weight: 3, opacity: 0.6, dashArray: '10, 10' }
    ).addTo(map);
};

/** Add marker to map with popup */
const addMarker = (map, position, name, color, label, title) => {
    const marker = L.marker([position.lat, position.lng], {
        icon: createMarkerIcon(color, label),
        zIndexOffset: 1000,
    }).addTo(map);

    marker.bindPopup(createPopupContent(title, name, position.lat, position.lng));
    return marker;
};

/** Parse coordinate point object */
const parsePoint = (point) => {
    if (point?.latitude && point?.longitude) {
        return { lat: parseFloat(point.latitude), lng: parseFloat(point.longitude) };
    }
    return null;
};

/**
 * RouteMap - Displays an interactive map with route polyline and markers
 * Uses vanilla Leaflet for better compatibility
 */
const RouteMap = ({
    startPoint,
    endPoint,
    startName,
    endName,
    routeGeometry = null,
    transportMode = 'DRIVING',
    className = '',
}) => {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const markersRef = useRef([]);
    const routeLineRef = useRef(null);

    // Parse coordinates
    const start = useMemo(() => parsePoint(startPoint), [startPoint]);
    const end = useMemo(() => parsePoint(endPoint), [endPoint]);

    // Initialize map
    useEffect(() => {
        if (!L || !mapRef.current || mapInstanceRef.current) return;

        mapInstanceRef.current = L.map(mapRef.current).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(mapInstanceRef.current);

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // Update route line and markers when data changes
    useEffect(() => {
        if (!L || !mapInstanceRef.current) return;

        const map = mapInstanceRef.current;

        // Cleanup existing layers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];
        if (routeLineRef.current) {
            routeLineRef.current.remove();
            routeLineRef.current = null;
        }

        // Add route polyline
        if (routeGeometry && routeGeometry.length > 0) {
            const { routeLine, shadowLine } = addRouteLine(map, routeGeometry, transportMode);
            routeLineRef.current = routeLine;
            markersRef.current.push(shadowLine);
            map.fitBounds(routeLine.getBounds(), { padding: [50, 50], maxZoom: 14 });
        } else if (start && end) {
            const straightLine = addStraightLine(map, start, end);
            markersRef.current.push(straightLine);
            const bounds = L.latLngBounds([[start.lat, start.lng], [end.lat, end.lng]]);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
        }

        // Add markers
        if (start) {
            markersRef.current.push(addMarker(map, start, startName, 'green', 'A', 'Start Point'));
        }
        if (end) {
            markersRef.current.push(addMarker(map, end, endName, 'red', 'B', 'Destination'));
        }

        // Center on single point if only one available
        if (start && !end && !routeGeometry) {
            map.setView([start.lat, start.lng], 10);
        } else if (end && !start && !routeGeometry) {
            map.setView([end.lat, end.lng], 10);
        }
    }, [start, end, startName, endName, routeGeometry, transportMode]);

    return (
        <div className={`route-map-container ${className}`}>
            <div ref={mapRef} className="route-map" />
            {!start && !end && (
                <div className="map-empty-overlay">
                    <span className="map-empty-icon">🗺️</span>
                    <p>Calculate a route to see it on the map</p>
                </div>
            )}
        </div>
    );
};

RouteMap.propTypes = {
    startPoint: PropTypes.shape({
        latitude: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        longitude: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    }),
    endPoint: PropTypes.shape({
        latitude: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        longitude: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    }),
    startName: PropTypes.string,
    endName: PropTypes.string,
    routeGeometry: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)),
    transportMode: PropTypes.oneOf(['WALKING', 'DRIVING', 'PUBLIC_TRANSPORT']),
    className: PropTypes.string,
};

export default RouteMap;
