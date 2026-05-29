import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.MODE === 'production' ? '/api' : 'http://localhost:3001'
);

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 seconds timeout
});

// Request interceptor for adding auth token (Basic Authentication via Bearer token)
apiClient.interceptors.request.use(
  (config) => {
    // Add Bearer token for authentication
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and response normalization
apiClient.interceptors.response.use(
  (response) => {
    // Normalize response format: if backend returns {success, data, message, error},
    // extract the nested data for backward compatibility
    if (response.data && response.data.success !== undefined && response.data.data !== undefined) {
      // New format: {success: true, data: {...}, message, error}
      // Flatten it to {success, ...data, message, error} for easier access
      const { success, data, message, error } = response.data;
      response.data = { success, ...data, message, error };
    }
    return response;
  },
  (error) => {
    // Log error conditionally to reduce noise in production
    const isDev = import.meta.env.DEV;
    if (isDev) {
      console.error('API Error:', error.response?.data || error.message);
    }

    // Handle different error scenarios
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // Dispatch logout event
      window.dispatchEvent(new CustomEvent('user:logout'));

      // Redirect to login if not already there
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    } else if (error.response?.status === 403) {
      // Forbidden - user doesn't have permission
      console.warn('Access denied');
    } else if (error.response?.status >= 500) {
      // Server error
      console.error('Server error occurred');
    } else if (error.code === 'ECONNABORTED') {
      // Timeout error
      console.error('Request timeout');
    } else if (!error.response) {
      // Network error
      console.error('Network error - please check your connection');
    }

    return Promise.reject(error);
  }
);

export default apiClient;
