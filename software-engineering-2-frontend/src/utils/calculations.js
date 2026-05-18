/**
 * Calculation Utilities
 * 
 * Provides common calculation functions used across the application.
 * 
 * @module utils/calculations
 */

/**
 * Calculate average rating from reviews array
 * @param {Array<Object>} reviews - Array of review objects with rating property
 * @returns {number|null} Average rating or null if no reviews
 */
export const calculateAverageRating = (reviews) => {
  if (!reviews || reviews.length === 0) return null;
  return reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length;
};
