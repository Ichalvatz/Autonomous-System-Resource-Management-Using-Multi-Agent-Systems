import apiClient from './apiClient';

// Helper function to get authenticated user ID
export const getAuthenticatedUserId = () => {
  const userStr = localStorage.getItem('user');
  if (!userStr) {
    throw new Error('User not authenticated');
  }
  const user = JSON.parse(userStr);
  
  // Backend consistently returns `user.userId`; enforce this for robustness
  const userId = user.userId;
  if (!userId) {
    console.error('User object in localStorage missing userId:', user);
    throw new Error('User ID not found in user object');
  }
  
  return userId;
};

// Authentication API
export const login = async (email, password) => {
  const response = await apiClient.post('/auth/login', { email, password });
  return response.data;
};

export const signup = async (userData) => {
  const response = await apiClient.post('/auth/signup', userData);
  return response.data;
};

export const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
};

// User Management API
export const userAPI = {
  // Get user profile
  getUserProfile: (userId) => {
    return apiClient.get(`/users/${userId}/profile`);
  },

  // Update user profile
  updateUserProfile: (userId, profileData) => {
    return apiClient.put(`/users/${userId}/profile`, profileData);
  },

  // Get user settings
  getUserSettings: (userId) => {
    return apiClient.get(`/users/${userId}/settings`);
  },

  // Update user settings
  updateUserSettings: (userId, settingsData) => {
    return apiClient.put(`/users/${userId}/settings`, settingsData);
  },
};

// Preference Profiles API
export const preferenceAPI = {
  // Get all preference profiles for a user
  getPreferenceProfiles: (userId) => {
    return apiClient.get(`/users/${userId}/preference-profiles`);
  },

  // Create a new preference profile
  createPreferenceProfile: (userId, profileData) => {
    return apiClient.post(`/users/${userId}/preference-profiles`, profileData);
  },

  // Update a preference profile
  updatePreferenceProfile: (userId, profileId, profileData) => {
    return apiClient.put(`/users/${userId}/preference-profiles/${profileId}`, profileData);
  },

  // Delete a preference profile
  deletePreferenceProfile: (userId, profileId) => {
    return apiClient.delete(`/users/${userId}/preference-profiles/${profileId}`);
  },

  // Set active preference profile
  setActiveProfile: (userId, profileId) => {
    return apiClient.post(`/users/${userId}/preference-profiles/${profileId}/activate`);
  },
};

// Recommendations API
export const recommendationAPI = {
  // Get personalized recommendations
  getRecommendations: (userId, params = {}) => {
    return apiClient.get(`/users/${userId}/recommendations`, { params });
  },
};

// Places API
export const placeAPI = {
  // Get place details
  getPlaceDetails: (placeId) => {
    return apiClient.get(`/places/${placeId}`);
  },

  // Get place reviews
  getPlaceReviews: (placeId) => {
    return apiClient.get(`/places/${placeId}/reviews`);
  },

  // Submit a review
  submitReview: (placeId, reviewData) => {
    return apiClient.post(`/places/${placeId}/reviews`, reviewData);
  },

  // Report a place
  reportPlace: (placeId, reportData) => {
    return apiClient.post(`/places/${placeId}/reports`, reportData);
  },

  // Search places
  searchPlaces: (params) => {
    return apiClient.get('/places/search', { params });
  },
};

// Favourites & Disliked Places API
export const favouriteAPI = {
  // Get favourite places
  getFavouritePlaces: (userId) => {
    return apiClient.get(`/users/${userId}/favourite-places`);
  },

  // Add to favourites
  addToFavourites: (userId, placeId) => {
    return apiClient.post(`/users/${userId}/favourite-places`, { placeId });
  },

  // Remove from favourites
  removeFromFavourites: (userId, favouriteId) => {
    return apiClient.delete(`/users/${userId}/favourite-places/${favouriteId}`);
  },

  // Get disliked places
  getDislikedPlaces: (userId) => {
    return apiClient.get(`/users/${userId}/disliked-places`);
  },

  // Add to disliked places
  addToDislikedPlaces: (userId, placeId) => {
    return apiClient.post(`/users/${userId}/disliked-places`, { placeId });
  },

  // Remove from disliked places
  removeFromDislikedPlaces: (userId, dislikedId) => {
    // Backend currently lacks this route; placeholder for future implementation
    return apiClient.delete(`/users/${userId}/disliked-places/${dislikedId}`);
  },
};

// Navigation API
export const navigationAPI = {
  // Get navigation route
  getRoute: (params) => {
    return apiClient.get('/navigation', { params });
  },
};

// Admin API
export const adminAPI = {
  // Get place reports
  getPlaceReports: (adminId, placeId) => {
    return apiClient.get(`/admin/${adminId}/places/${placeId}/reports`);
  },

  // Update place
  updatePlace: (adminId, placeId, placeData) => {
    return apiClient.put(`/admin/${adminId}/places/${placeId}`, placeData);
  },

  // Generate admin token (for testing)
  generateAdminToken: (credentials) => {
    return apiClient.post('/admin/auth/generate-token', credentials);
  },
};
