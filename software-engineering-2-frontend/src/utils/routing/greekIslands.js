/**
 * Greek Islands Detection
 * 
 * Utilities for detecting if coordinates are on Greek islands
 * and if routes require ferry crossings.
 */

// Greek islands bounding boxes (approximate)
// Used to detect if destination is on an island (requiring ferry from mainland)
export const GREEK_ISLANDS = [
    { name: 'Crete', minLat: 34.8, maxLat: 35.7, minLng: 23.5, maxLng: 26.4 },
    { name: 'Rhodes', minLat: 35.85, maxLat: 36.5, minLng: 27.6, maxLng: 28.3 },
    { name: 'Corfu', minLat: 39.4, maxLat: 39.85, minLng: 19.6, maxLng: 20.15 },
    { name: 'Lesbos', minLat: 38.95, maxLat: 39.45, minLng: 25.7, maxLng: 26.7 },
    { name: 'Kos', minLat: 36.7, maxLat: 36.95, minLng: 26.85, maxLng: 27.35 },
    { name: 'Chios', minLat: 38.15, maxLat: 38.65, minLng: 25.75, maxLng: 26.25 },
    { name: 'Samos', minLat: 37.6, maxLat: 37.85, minLng: 26.5, maxLng: 27.1 },
    { name: 'Zakynthos', minLat: 37.6, maxLat: 37.95, minLng: 20.65, maxLng: 21.0 },
    { name: 'Kefalonia', minLat: 38.0, maxLat: 38.5, minLng: 20.2, maxLng: 20.85 },
    { name: 'Mykonos', minLat: 37.4, maxLat: 37.5, minLng: 25.25, maxLng: 25.5 },
    { name: 'Santorini', minLat: 36.3, maxLat: 36.5, minLng: 25.3, maxLng: 25.55 },
    { name: 'Paros', minLat: 36.95, maxLat: 37.2, minLng: 25.05, maxLng: 25.35 },
    { name: 'Naxos', minLat: 36.9, maxLat: 37.2, minLng: 25.3, maxLng: 25.65 },
    { name: 'Cyclades', minLat: 36.3, maxLat: 37.7, minLng: 24.2, maxLng: 26.0 }, // Cyclades group
    { name: 'Dodecanese', minLat: 35.4, maxLat: 37.5, minLng: 26.5, maxLng: 28.5 }, // Dodecanese group
    { name: 'Sporades', minLat: 39.0, maxLat: 39.5, minLng: 23.3, maxLng: 24.3 }, // Sporades group
];

// Greek mainland approximate bounding box
export const GREEK_MAINLAND = {
    minLat: 36.0,
    maxLat: 41.8,
    minLng: 19.3,
    maxLng: 26.6,
};

/** Check if a point is within a bounding box */
const isPointInBoundingBox = (lat, lng, box) =>
    lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;

/** Create no-ferry result */
const createNoFerryResult = () => ({ requiresFerry: false, message: null, islandName: null });

/** Create mainland-to-island ferry result */
const createMainlandToIslandResult = (islandName) => ({
    requiresFerry: true,
    message: `⛴️ This route requires a ferry to reach ${islandName}. The displayed route shows the ferry crossing.`,
    islandName
});

/** Create island-to-mainland ferry result */
const createIslandToMainlandResult = (islandName) => ({
    requiresFerry: true,
    message: `⛴️ This route requires a ferry from ${islandName} to reach the mainland. The displayed route shows the ferry crossing.`,
    islandName
});

/** Create island-to-island ferry result */
const createIslandToIslandResult = (startIsland, endIsland) => ({
    requiresFerry: true,
    message: `⛴️ This route requires ferry crossings between ${startIsland} and ${endIsland}.`,
    islandName: endIsland
});

/**
 * Check if a point is on a Greek island
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {{isIsland: boolean, islandName: string|null}}
 */
export const checkIfOnGreekIsland = (lat, lng) => {
    const island = GREEK_ISLANDS.find(isl => isPointInBoundingBox(lat, lng, isl));
    return island
        ? { isIsland: true, islandName: island.name }
        : { isIsland: false, islandName: null };
};

/**
 * Check if a point is on mainland Greece
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean}
 */
export const isOnMainlandGreece = (lat, lng) => {
    const inGreece = isPointInBoundingBox(lat, lng, GREEK_MAINLAND);
    if (!inGreece) return false;
    return !checkIfOnGreekIsland(lat, lng).isIsland;
};

/** Check if route is from mainland to island */
const isMainlandToIsland = (startOnMainland, endIslandInfo) =>
    startOnMainland && endIslandInfo.isIsland;

/** Check if route is from island to mainland */
const isIslandToMainland = (startIslandInfo, endOnMainland) =>
    startIslandInfo.isIsland && endOnMainland;

/** Check if route is between different islands */
const isIslandToIsland = (startIslandInfo, endIslandInfo) =>
    startIslandInfo.isIsland && endIslandInfo.isIsland &&
    startIslandInfo.islandName !== endIslandInfo.islandName;

/**
 * Detect if route requires a sea crossing (ferry)
 * @param {number} startLat 
 * @param {number} startLng 
 * @param {number} endLat 
 * @param {number} endLng 
 * @returns {{requiresFerry: boolean, message: string|null, islandName: string|null}}
 */
export const detectSeaCrossing = (startLat, startLng, endLat, endLng) => {
    const startIslandInfo = checkIfOnGreekIsland(startLat, startLng);
    const endIslandInfo = checkIfOnGreekIsland(endLat, endLng);
    const startOnMainland = isOnMainlandGreece(startLat, startLng);
    const endOnMainland = isOnMainlandGreece(endLat, endLng);

    if (isMainlandToIsland(startOnMainland, endIslandInfo)) {
        return createMainlandToIslandResult(endIslandInfo.islandName);
    }
    if (isIslandToMainland(startIslandInfo, endOnMainland)) {
        return createIslandToMainlandResult(startIslandInfo.islandName);
    }
    if (isIslandToIsland(startIslandInfo, endIslandInfo)) {
        return createIslandToIslandResult(startIslandInfo.islandName, endIslandInfo.islandName);
    }

    return createNoFerryResult();
};
