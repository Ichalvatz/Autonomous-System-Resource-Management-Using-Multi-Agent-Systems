/**
 * @fileoverview Place Operations - In-Memory Database
 * @description Database operations for places, reviews, reports, search, favourites, and disliked places.
 * Provides CRUD operations for the in-memory database implementation.
 * 
 * @module config/inMemoryDb/placeOps
 * @requires ../seedData
 */

import data from '../seedData.js';

/**
 * Finds a place by its ID.
 * @param {number} placeId - The place ID to search for
 * @returns {Promise<Object|null>} Place object or null if not found
 */
// Place read operations
export async function findPlaceById(placeId) {
    return data.places.find(p => p.placeId === placeId) || null;
}

export async function getReviewsForPlace(placeId) {
    return data.reviews.filter(r => r.placeId === placeId);
}

export async function searchPlaces(searchTerms) {
    const lowerSearchTerms = searchTerms.map(term => term.toLowerCase());
    return data.places.filter(place => {
        const nameMatch = lowerSearchTerms.some(term => place.name.toLowerCase().includes(term));
        const descMatch = place.description ? lowerSearchTerms.some(term => place.description.toLowerCase().includes(term)) : false;
        const categoryMatch = place.category ? lowerSearchTerms.some(term => place.category.toLowerCase().includes(term)) : false;
        return nameMatch || descMatch || categoryMatch;
    });
}

export async function getPlacesByCategories(categories) {
    return data.places.filter(place => categories.includes(place.category));
}

export async function getAllPlaces() {
    return data.places;
}

// Place mutation operations
export async function createPlace(placeData) {
    const newPlace = {
        ...placeData,
        placeId: data.counters.placeId++,
        rating: placeData.rating || 0,
        createdAt: new Date().toISOString()
    };
    data.places.push(newPlace);
    return newPlace;
}

export async function updatePlace(placeId, updateData) {
    const idx = data.places.findIndex(p => p.placeId === placeId);
    if (idx === -1) return null;
    data.places[idx] = { ...data.places[idx], ...updateData };
    return data.places[idx];
}

export async function deletePlace(placeId) {
    const idx = data.places.findIndex(p => p.placeId === placeId);
    if (idx === -1) return false;
    data.places.splice(idx, 1);
    return true;
}

// Reviews functions
export async function addReview(review) {
    const newReview = {
        ...review,
        reviewId: data.counters.reviewId++,
        createdAt: new Date().toISOString()
    };
    data.reviews.push(newReview);
    return newReview;
}

// Reports functions
export async function addReport(report) {
    const newReport = {
        ...report,
        reportId: data.counters.reportId++,
        status: 'PENDING',
        createdAt: new Date().toISOString()
    };
    data.reports.push(newReport);
    return newReport;
}

export async function getReportsForPlace(placeId) {
    return data.reports.filter(r => r.placeId === placeId);
}

// Favourites functions
export async function getFavouritePlaces(userId) {
    const favourites = data.favouritePlaces.filter(f => f.userId === userId);
    return favourites.map(fav => {
        const place = data.places.find(p => p.placeId === fav.placeId);
        if (!place) return null;
        const reviews = data.reviews.filter(r => r.placeId === place.placeId);
        return { ...fav, place, reviews };
    }).filter(Boolean);
}

export async function addFavouritePlace(userId, placeId) {
    const existing = data.favouritePlaces.find(f => f.userId === userId && f.placeId === placeId);
    if (existing) return null;

    const newFavourite = {
        favouriteId: data.counters.favouriteId++,
        userId,
        placeId
    };
    data.favouritePlaces.push(newFavourite);
    return newFavourite;
}

export async function removeFavouritePlace(userId, favouriteId) {
    const idx = data.favouritePlaces.findIndex(f => f.favouriteId === favouriteId && f.userId === userId);
    if (idx === -1) return false;
    data.favouritePlaces.splice(idx, 1);
    return true;
}

// Disliked places functions
export async function getDislikedPlaces(userId) {
    const disliked = data.dislikedPlaces.filter(d => d.userId === userId);
    return disliked.map(dis => {
        const place = data.places.find(p => p.placeId === dis.placeId);
        return { ...dis, place: place || null };
    });
}

export async function addDislikedPlace(userId, placeId) {
    const existing = data.dislikedPlaces.find(d => d.userId === userId && d.placeId === placeId);
    if (existing) return null;

    const newDisliked = {
        dislikedId: data.counters.dislikedId++,
        userId,
        placeId
    };
    data.dislikedPlaces.push(newDisliked);
    return newDisliked;
}

export async function removeDislikedPlace(userId, dislikedId) {
    const idx = data.dislikedPlaces.findIndex(d => d.dislikedId === dislikedId && d.userId === userId);
    if (idx === -1) return false;
    data.dislikedPlaces.splice(idx, 1);
    return true;
}
