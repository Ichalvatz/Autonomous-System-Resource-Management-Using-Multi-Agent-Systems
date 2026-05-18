import { useState, useEffect } from 'react';

/**
 * Custom hook to manage authentication state
 * Handles user data from localStorage and listens for login events
 */
export const useAuth = () => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if user is logged in
    const userData = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (userData && userData !== 'undefined' && userData !== 'null' && token) {
      try {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Failed to parse user data from localStorage:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        setUser(null);
        setIsAuthenticated(false);
      }
    }

    // Listen for login events to update state without page reload
    const handleLoginEvent = (e) => {
      setUser(e.detail);
      setIsAuthenticated(true);
    };

    // Listen for logout events
    const handleLogoutEvent = () => {
      setUser(null);
      setIsAuthenticated(false);
    };

    window.addEventListener('user:login', handleLoginEvent);
    window.addEventListener('user:logout', handleLogoutEvent);
    
    return () => {
      window.removeEventListener('user:login', handleLoginEvent);
      window.removeEventListener('user:logout', handleLogoutEvent);
    };
  }, []);

  return { user, isAuthenticated, setUser };
};
