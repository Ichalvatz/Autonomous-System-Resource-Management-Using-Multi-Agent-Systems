import React, { createContext, useContext } from 'react';
import useTheme from '../hooks/useTheme';

const ThemeContext = createContext(null);

/**
 * ThemeProvider - Wraps app to provide theme context
 */
export const ThemeProvider = ({ children }) => {
    const themeState = useTheme();

    return (
        <ThemeContext.Provider value={themeState}>
            {children}
        </ThemeContext.Provider>
    );
};

/**
 * useThemeContext - Hook to access theme context
 */
export const useThemeContext = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useThemeContext must be used within a ThemeProvider');
    }
    return context;
};

export default ThemeContext;
