/**
 * Recommendation Service
 * Handles business logic for generating place recommendations
 */

import db from '../config/db.js';
import buildHateoasLinks from '../utils/hateoasBuilder.js';
import { calculateDistance } from '../utils/geoUtils.js';

// --- Helper Functions (Private) ---

/** Determine the active profile for the user */
const resolveActiveProfile = (profiles, userObj) => {
    if (!profiles || profiles.length === 0) return null;
    // Use active profile, or fallback to the most recent one
    return profiles.find(p => p.profileId === userObj.activeProfile) || profiles[profiles.length - 1];
};

/** Filter places based on categories and remove disliked ones */
const filterPlaces = (allPlaces, dislikedIds) => {
    return allPlaces.filter(place => {
        const placeObj = place.toObject ? place.toObject() : place;
        return !dislikedIds.includes(placeObj.placeId);
    });
};

// --- Sorting Helpers ---

/**
 * Partition places into those with and without valid location data
 */
const partitionByLocation = (places, userLat, userLon) => {
    const withLoc = [];
    const withoutLoc = [];

    places.forEach(place => {
        if (place.location?.latitude && place.location?.longitude) {
            withLoc.push({
                ...place,
                distance: calculateDistance(
                    { latitude: userLat, longitude: userLon },
                    { latitude: place.location.latitude, longitude: place.location.longitude }
                )
            });
        } else {
            withoutLoc.push(place);
        }
    });

    return { withLoc, withoutLoc };
};

/** Sort places by rating (descending) */
const sortByRating = (places) => [...places].sort((a, b) => (b.rating || 0) - (a.rating || 0));

/** Sort places by distance (ascending) */
const sortByDistance = (places) => [...places].sort((a, b) => a.distance - b.distance);

/** Sort places by distance (if coords provided) or rating */
const sortPlaces = (places, { latitude, longitude, maxDistance }) => {
    const placeList = places.map(p => p.toObject ? p.toObject() : p);

    if (!latitude || !longitude) {
        return sortByRating(placeList);
    }

    const userLat = parseFloat(latitude);
    const userLon = parseFloat(longitude);
    const maxDist = maxDistance ? parseFloat(maxDistance) : null;

    // Calculate distances and separate places with/without location
    const { withLoc, withoutLoc } = partitionByLocation(placeList, userLat, userLon);

    // Sort by distance, filter by maxDist, then append places without location (sorted by rating)
    const sortedWithLoc = sortByDistance(withLoc);
    const filteredWithLoc = maxDist ? sortedWithLoc.filter(p => p.distance <= maxDist) : sortedWithLoc;
    const sortedWithoutLoc = sortByRating(withoutLoc);

    return [...filteredWithLoc, ...sortedWithoutLoc];
};

/** Fetch reviews and build links for the final list */
const hydrateRecommendations = async (places) => {
    return Promise.all(places.map(async (place) => {
        const reviews = await db.getReviewsForPlace(place.placeId);
        return {
            ...place,
            reviews,
            links: buildHateoasLinks.selectLink(place.placeId)
        };
    }));
};

// --- Main Service Methods ---

/**
 * Clean up the profile object
 */
const getProfileData = (profile) => {
    return profile.toObject ? profile.toObject() : profile;
};

/**
 * Core logic to generate recommendations
 */
const generateRecommendations = async (userId, user, queryParams) => {
    const userObj = user.toObject ? user.toObject() : user;
    const profiles = await db.getPreferenceProfiles(userId);
    const activeProfile = resolveActiveProfile(profiles, userObj);

    if (!activeProfile) {
        return {
            recommendations: [],
            activeProfile: null,
            message: 'Create a preference profile to see recommendations'
        };
    }

    // 1. Gather Data
    const profileObj = getProfileData(activeProfile);
    const dislikedPlaces = await db.getDislikedPlaces(userId);
    const categories = profileObj.categories || profileObj.selectedPreferences || [];

    // 2. Fetch & Filter
    const rawPlaces = await db.getPlacesByCategories(categories);
    const filteredPlaces = filterPlaces(rawPlaces, dislikedPlaces.map(d => d.placeId));

    // 3. Sort & Limit
    const sortedPlaces = sortPlaces(filteredPlaces, queryParams);
    const topPlaces = sortedPlaces.slice(0, 10);

    // 4. Hydrate (Reviews/Links)
    const finalRecommendations = await hydrateRecommendations(topPlaces);

    return {
        recommendations: finalRecommendations,
        activeProfile: profileObj.name || profileObj.profileName,
        message: 'Recommendations generated successfully'
    };
};

export default {
    generateRecommendations
};
