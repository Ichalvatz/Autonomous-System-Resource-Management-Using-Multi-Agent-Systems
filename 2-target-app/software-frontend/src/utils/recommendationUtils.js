/**
 * Recommendation Utilities
 * 
 * Provides sorting and rating calculation logic for recommendations.
 * 
 * @module utils/recommendationUtils
 */

/**
 * Calculates average rating from reviews array
 * 
 * @param {Array<Object>} reviews - Array of review objects
 * @returns {number|null} Average rating or null if no reviews
 */
const calculateAverageRating = (reviews) => {
  if (!reviews.length) return null;
  return reviews.reduce((acc, r) => acc + (r.rating || 0), 0) / reviews.length;
};

/**
 * Calculates the effective rating for a place.
 * Computes average from reviews array or uses direct rating property.
 * 
 * @param {Object} place - Place object
 * @returns {number|null} Calculated rating or null if no rating available
 */
export const getEffectiveRating = (place) => {
  // Check if place has reviews array
  if (place.reviews && Array.isArray(place.reviews)) {
    return calculateAverageRating(place.reviews);
  }
  // Fallback to direct rating property
  return typeof place.rating === 'number' ? place.rating : null;
};

/**
 * Checks if a rating value is valid
 * 
 * @param {number|null} rating - Rating value to check
 * @returns {boolean} True if rating is valid
 */
const isValidRating = (rating) => {
  return rating != null && !isNaN(rating);
};

/**
 * Compares two places by distance
 * 
 * @param {Object} a - First place
 * @param {Object} b - Second place
 * @returns {number} Comparison result
 */
const compareByDistance = (a, b) => {
  return (a.distance ?? Infinity) - (b.distance ?? Infinity);
};

/**
 * Compares two places by rating with fallback to distance
 * 
 * @param {Object} a - First place
 * @param {Object} b - Second place
 * @returns {number} Comparison result
 */
const compareByRating = (a, b) => {
  const rA = getEffectiveRating(a);
  const rB = getEffectiveRating(b);
  const hasA = isValidRating(rA);
  const hasB = isValidRating(rB);

  // Places with ratings come before those without
  if (hasA && !hasB) return -1;
  if (!hasA && hasB) return 1;

  // If neither has rating, fall back to distance
  if (!hasA && !hasB) return compareByDistance(a, b);

  // Both have ratings: highest first
  return rB - rA;
};

/**
 * Sorts recommendations by distance or rating
 * 
 * @param {Array<Object>} recommendations - Array of recommendation objects
 * @param {string} sortBy - Sort method: 'distance' or 'rating'
 * @returns {Array<Object>} Sorted recommendations array
 */
export const sortRecommendations = (recommendations, sortBy) => {
  if (!recommendations.length) return recommendations;

  const comparator = sortBy === 'distance' ? compareByDistance : compareByRating;
  return [...recommendations].sort(comparator);
};
