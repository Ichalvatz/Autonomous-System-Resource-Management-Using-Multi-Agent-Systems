/**
 * Form Validators
 */

/**
 * Validate email format
 */
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength
 * At least 8 characters
 */
export const validatePassword = (password) => {
  return password && password.length >= 8;
};

/**
 * Validate required field
 */
export const validateRequired = (value) => {
  return value && value.toString().trim().length > 0;
};

/**
 * Validate phone number (Greek format)
 */
export const validatePhone = (phone) => {
  const phoneRegex = /^(\+30|0030)?[0-9]{10}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * Validate rating (1-5)
 */
export const validateRating = (rating) => {
  const num = Number(rating);
  return !isNaN(num) && num >= 1 && num <= 5;
};

/**
 * Validate coordinates
 */
export const validateCoordinates = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  
  return (
    !isNaN(latitude) && 
    !isNaN(longitude) && 
    latitude >= -90 && 
    latitude <= 90 && 
    longitude >= -180 && 
    longitude <= 180
  );
};
