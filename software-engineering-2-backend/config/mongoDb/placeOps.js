/**
 * Place Operations - MongoDB
 * Place, review, report, search, favourites, and disliked operations
 */

import models from '../../models/index.js';

// Place read operations
export async function findPlaceById(placeId) {
    return await models.Place.findOne({ placeId });
}

export async function getReviewsForPlace(placeId) {
    return await models.Review.find({ placeId });
}

// Escape special regex characters to prevent injection and RegExp errors
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function searchPlaces(searchTerms) {
    // Escape and lowercase search terms for safe regex matching
    const escapedTerms = searchTerms.map(term => escapeRegex(term.toLowerCase()));
    const regex = new RegExp(escapedTerms.join('|'), 'i');
    return await models.Place.find({
        $or: [
            { name: regex },
            { description: regex },
            { category: regex }
        ]
    });
}

export async function getPlacesByCategories(categories) {
    return await models.Place.find({ category: { $in: categories } });
}

export async function getAllPlaces() {
    return await models.Place.find({});
}

// Place mutation operations
export async function updatePlace(placeId, updateData) {
    const doc = await models.Place.findOneAndUpdate(
        { placeId },
        { $set: updateData },
        { new: true }
    );
    return doc;
}

// Reviews functions
export async function addReview(review) {
    const last = await models.Review.findOne({}, {}, { sort: { reviewId: -1 } });
    const reviewId = last ? last.reviewId + 1 : 1;
    const doc = new models.Review({ ...review, reviewId });
    await doc.save();
    return doc;
}

// Reports functions
export async function addReport(report) {
    const last = await models.Report.findOne({}, {}, { sort: { reportId: -1 } });
    const reportId = last ? last.reportId + 1 : 1;
    const doc = new models.Report({ ...report, reportId, status: 'PENDING' });
    await doc.save();
    return doc;
}

export async function getReportsForPlace(placeId) {
    return await models.Report.find({ placeId });
}

// Favourites functions
export async function getFavouritePlaces(userId) {
    const favourites = await models.FavouritePlace.find({ userId });
    const result = [];
    for (const fav of favourites) {
        const place = await models.Place.findOne({ placeId: fav.placeId });
        if (place) {
            const reviews = await models.Review.find({ placeId: fav.placeId });
            result.push({ ...fav.toObject(), place: place.toObject(), reviews });
        }
    }
    return result;
}

export async function addFavouritePlace(userId, placeId) {
    const existing = await models.FavouritePlace.findOne({ userId, placeId });
    if (existing) return null;

    const last = await models.FavouritePlace.findOne({}, {}, { sort: { favouriteId: -1 } });
    const favouriteId = last ? last.favouriteId + 1 : 1;
    const doc = new models.FavouritePlace({ favouriteId, userId, placeId });
    await doc.save();
    return doc;
}

export async function removeFavouritePlace(userId, favouriteId) {
    const result = await models.FavouritePlace.deleteOne({ userId, favouriteId });
    return result.deletedCount > 0;
}

// Disliked places functions
export async function getDislikedPlaces(userId) {
    const disliked = await models.DislikedPlace.find({ userId });
    const result = [];
    for (const dis of disliked) {
        const place = await models.Place.findOne({ placeId: dis.placeId });
        if (place) {
            const reviews = await models.Review.find({ placeId: dis.placeId });
            result.push({ ...dis.toObject(), place: place.toObject(), reviews });
        }
    }
    return result;
}

export async function addDislikedPlace(userId, placeId) {
    const existing = await models.DislikedPlace.findOne({ userId, placeId });
    if (existing) return null;

    const last = await models.DislikedPlace.findOne({}, {}, { sort: { dislikedId: -1 } });
    const dislikedId = last ? last.dislikedId + 1 : 1;
    const doc = new models.DislikedPlace({ dislikedId, userId, placeId });
    await doc.save();
    return doc;
}

export async function removeDislikedPlace(userId, dislikedId) {
    const result = await models.DislikedPlace.deleteOne({ userId, dislikedId });
    return result.deletedCount > 0;
}
