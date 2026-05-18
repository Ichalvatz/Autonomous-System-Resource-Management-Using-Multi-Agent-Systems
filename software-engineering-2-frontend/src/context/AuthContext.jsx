import React, { createContext, useContext, useState, useEffect } from 'react';
import { saveUser, clearUser, getUser as getUserFromStorage } from '../utils/helpers';

const AuthContext = createContext(null);

/**
 * Auth Context Provider
 * Provides authentication state and methods throughout the app
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Initialize auth state from localStorage
    const storedUser = getUserFromStorage();
    const token = localStorage.getItem('token');
    
    if (storedUser && token) {
      setUser(storedUser);
      setIsAuthenticated(true);
    }
    
    setLoading(false);

    // Listen for auth events
    const handleLogin = (e) => {
      setUser(e.detail);
      setIsAuthenticated(true);
    };

    const handleLogout = () => {
      setUser(null);
      setIsAuthenticated(false);
    };

    window.addEventListener('user:login', handleLogin);
    window.addEventListener('user:logout', handleLogout);

    return () => {
      window.removeEventListener('user:login', handleLogin);
      window.removeEventListener('user:logout', handleLogout);
    };
  }, []);

  const login = (userData, token) => {
    saveUser(userData, token);
    setUser(userData);
    setIsAuthenticated(true);
  };

  const logout = () => {
    clearUser();
    setUser(null);
    setIsAuthenticated(false);
  };

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Custom hook to use Auth Context
 */
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
};

export default AuthContext;
