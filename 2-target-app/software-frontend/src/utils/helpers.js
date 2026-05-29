/**
 * Helper Functions
 */

/**
 * Get token from localStorage
 */
export const getToken = () => {
  return localStorage.getItem('token');
};

/**
 * Get user from localStorage
 */
export const getUser = () => {
  try {
    const userData = localStorage.getItem('user');
    if (userData && userData !== 'undefined' && userData !== 'null') {
      return JSON.parse(userData);
    }
  } catch (error) {
    console.error('Failed to parse user data:', error);
  }
  return null;
};

/**
 * Save user to localStorage and dispatch event
 */
export const saveUser = (user, token) => {
  localStorage.setItem('user', JSON.stringify(user));
  if (token) {
    localStorage.setItem('token', token);
  }
  
  // Dispatch custom event for header and other components to listen
  window.dispatchEvent(new CustomEvent('user:login', { detail: user }));
};

/**
 * Clear user data from localStorage
 */
export const clearUser = () => {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
  
  // Dispatch logout event
  window.dispatchEvent(new Event('user:logout'));
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = () => {
  const token = getToken();
  const user = getUser();
  return !!(token && user);
};

/**
 * Handle API errors and return user-friendly message
 * @param {Error} error - The error object
 * @param {Function} t - Translation function (optional)
 */
export const handleApiError = (error, t = null) => {
  if (error.response) {
    // Server responded with error status
    return error.response.data?.message || `Error: ${error.response.status}`;
  } else if (error.request) {
    // Request was made but no response
    return t ? t('noServerConnection') : 'No connection to server';
  } else {
    // Something else happened
    return t ? (error.message || t('errorOccurred')) : (error.message || 'An error occurred');
  }
};

/**
 * Debounce function for search inputs
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in meters
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Get query parameter from URL
 */
export const getQueryParam = (param) => {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
};

/**
 * Deep clone an object
 */
export const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Group array of objects by key
 */
export const groupBy = (array, key) => {
  return array.reduce((result, item) => {
    const group = item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
};

/**
 * Sort array of objects by key
 */
export const sortBy = (array, key, order = 'asc') => {
  return [...array].sort((a, b) => {
    if (order === 'asc') {
      return a[key] > b[key] ? 1 : -1;
    } else {
      return a[key] < b[key] ? 1 : -1;
    }
  });
};
