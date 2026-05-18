/**
 * @fileoverview Route results display component.
 * Shows route stats, waypoints, warnings, and interactive map.
 * @module components/navigation/RouteResults
 */

import React from 'react';
import { Icon } from '../ui';
import RouteMap from '../RouteMap';
import { formatCoordinates } from '../../utils/geocoding';

/**
 * Route results component for NavigationPage
 * Displays route stats, points, warnings, and interactive map
 */
const RouteResults = ({
    t,
    routeData,
    startName,
    endName,
    geocodingStart,
    geocodingEnd,
    routeGeometry,
    routeError,
}) => {
    /** Map transport mode to display icon */
    const getTransportIcon = (mode) => {
        const icons = { 'WALKING': '🚶', 'DRIVING': '🚗', 'PUBLIC_TRANSPORT': '🚌' };
        return icons[mode] || '🗺️';
    };

    /** Format duration in hours and minutes */
    const formatDuration = (minutes) => {
        if (minutes < 60) return `${Math.round(minutes)} ${t('minutes')}`;
        const hours = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return `${hours}h ${mins}m`;
    };

    /** Render location name with loading state and coordinates */
    const renderLocationName = (name, isLoading, lat, lng) => {
        if (isLoading) {
            return (
                <div className="point-info">
                    <div className="point-name point-name--loading">
                        <span className="loading-skeleton"></span>
                    </div>
                </div>
            );
        }
        return (
            <div className="point-info">
                <div className="point-name">{name || t('resolvingLocation')}</div>
                {lat && lng && (
                    <div className="point-coords" title={`${lat}, ${lng}`}>
                        {formatCoordinates(lat, lng)}
                    </div>
                )}
            </div>
        );
    };

    // Empty state when no route calculated yet
    if (!routeData) {
        return (
            <div className="empty-results">
                <div className="empty-icon">🗺️</div>
                <h3>{t('planYourJourney') || 'Plan Your Journey'}</h3>
                <p>{t('enterLocationsToStart') || 'Enter locations or select a quick route to get started'}</p>
            </div>
        );
    }

    return (
        <div className="route-results-card animate-fadeInUp">
            <div className="card-title">
                <Icon name="map" size="lg" />
                <h3>{t('routeResults')}</h3>
            </div>

            {/* Route statistics cards */}
            <div className="route-stats">
                <div className="stat-card stat-card--distance">
                    <div className="stat-icon">📏</div>
                    <div className="stat-content">
                        <div className="stat-label">{t('distance')}</div>
                        <div className="stat-value">{routeData.distance?.toFixed(1)} km</div>
                    </div>
                </div>

                <div className="stat-card stat-card--time">
                    <div className="stat-icon">⏱️</div>
                    <div className="stat-content">
                        <div className="stat-label">{t('duration')}</div>
                        <div className="stat-value">{formatDuration(routeData.estimatedTime)}</div>
                    </div>
                </div>

                <div className="stat-card stat-card--mode">
                    <div className="stat-icon">{getTransportIcon(routeData.transportationMode)}</div>
                    <div className="stat-content">
                        <div className="stat-label">{t('transport')}</div>
                        <div className="stat-value">
                            {routeData.transportationMode === 'WALKING' && t('walking')}
                            {routeData.transportationMode === 'DRIVING' && t('driving')}
                            {routeData.transportationMode === 'PUBLIC_TRANSPORT' && t('publicTransport')}
                        </div>
                    </div>
                </div>
            </div>

            {/* Start and end point markers */}
            <div className="route-points">
                <div className="route-point">
                    <span className="point-marker point-marker--start">A</span>
                    {renderLocationName(startName, geocodingStart, routeData.startPoint?.latitude, routeData.startPoint?.longitude)}
                </div>
                <div className="route-point">
                    <span className="point-marker point-marker--end">B</span>
                    {renderLocationName(endName, geocodingEnd, routeData.endPoint?.latitude, routeData.endPoint?.longitude)}
                </div>
            </div>

            {/* Route warnings (ferry required, route not possible) */}
            {routeError && (
                <div className={`route-error-warning ${routeError.includes('⛴️') ? 'route-error-warning--ferry' : ''}`}>
                    <div className="route-error-icon">{routeError.includes('⛴️') ? '⛴️' : '⚠️'}</div>
                    <div className="route-error-content">
                        <strong>
                            {routeError.includes('⛴️')
                                ? (t('ferryRequired') || 'Ferry Required')
                                : (t('routeNotPossible') || 'Route Not Possible')}
                        </strong>
                        <p>{routeError.replace('⛴️ ', '').replace('🚫 ', '')}</p>
                    </div>
                </div>
            )}

            {/* Interactive map with route polyline */}
            <RouteMap
                startPoint={routeData.startPoint}
                endPoint={routeData.endPoint}
                startName={startName}
                endName={endName}
                routeGeometry={routeGeometry}
                transportMode={routeData.transportationMode}
            />
        </div>
    );
};

export default RouteResults;
