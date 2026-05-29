import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/** Check if user is authenticated via localStorage */
const checkAuthentication = () => {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  return Boolean(token && user && user !== 'undefined' && user !== 'null');
};

/** Build redirect state for unauthenticated users */
const buildRedirectState = (location) => ({
  from: location,
  message: 'You must be logged in to view that page.'
});

/**
 * Protected Route Component
 * Redirects to login if user is not authenticated
 */
const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const isAuthenticated = checkAuthentication();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={buildRedirectState(location)} />;
  }

  return children;
};

export default ProtectedRoute;
