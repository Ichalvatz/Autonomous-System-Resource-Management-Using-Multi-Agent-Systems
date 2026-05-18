/**
 * @fileoverview Toast notification system.
 * Provides ToastProvider, useToast hook, and Toast component.
 * @module components/ui/Toast
 */

import React, { useState, createContext, useContext, useCallback } from 'react';
import PropTypes from 'prop-types';
import Icon from './Icon';
import './Toast.css';

// Toast Context for global toast management
const ToastContext = createContext(null);

/**
 * Toast Provider - Wrap your app with this to enable toasts
 */
export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const addToast = useCallback((message, options = {}) => {
        const id = Date.now() + Math.random();
        const toast = {
            id,
            message,
            variant: options.variant || 'info',
            duration: options.duration || 4000,
            title: options.title,
        };

        setToasts(prev => [...prev, toast]);

        // Auto-dismiss
        if (toast.duration > 0) {
            setTimeout(() => {
                removeToast(id);
            }, toast.duration);
        }

        return id;
    }, [removeToast]);

    const success = useCallback((message, options = {}) =>
        addToast(message, { ...options, variant: 'success' }), [addToast]);

    const error = useCallback((message, options = {}) =>
        addToast(message, { ...options, variant: 'error' }), [addToast]);

    const warning = useCallback((message, options = {}) =>
        addToast(message, { ...options, variant: 'warning' }), [addToast]);

    const info = useCallback((message, options = {}) =>
        addToast(message, { ...options, variant: 'info' }), [addToast]);

    return (
        <ToastContext.Provider value={{ addToast, removeToast, success, error, warning, info }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </ToastContext.Provider>
    );
};

ToastProvider.propTypes = {
    children: PropTypes.node.isRequired,
};

/**
 * Hook to access toast functions
 */
export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

/**
 * Toast Container - Renders all active toasts
 */
const ToastContainer = ({ toasts, onDismiss }) => {
    if (toasts.length === 0) return null;

    return (
        <div className="toast-container" role="region" aria-label="Notifications">
            {toasts.map(toast => (
                <Toast key={toast.id} {...toast} onDismiss={() => onDismiss(toast.id)} />
            ))}
        </div>
    );
};

ToastContainer.propTypes = {
    toasts: PropTypes.array.isRequired,
    onDismiss: PropTypes.func.isRequired,
};

/**
 * Individual Toast Component
 */
const Toast = ({ message, variant, title, duration, onDismiss }) => {
    const [isExiting, setIsExiting] = useState(false);

    const handleDismiss = () => {
        setIsExiting(true);
        setTimeout(onDismiss, 200); // Wait for exit animation
    };

    const icons = {
        success: 'check',
        error: 'close',
        warning: 'warning',
        info: 'info',
    };

    return (
        <div
            className={`toast toast-${variant} ${isExiting ? 'toast-exit' : ''}`}
            role="alert"
            aria-live="polite"
        >
            <div className="toast-icon">
                <Icon name={icons[variant] || 'info'} size="sm" />
            </div>
            <div className="toast-content">
                {title && <div className="toast-title">{title}</div>}
                <div className="toast-message">{message}</div>
            </div>
            <button
                className="toast-dismiss"
                onClick={handleDismiss}
                aria-label="Dismiss notification"
            >
                <Icon name="close" size="sm" />
            </button>
            {/* Progress bar for auto-dismiss */}
            {duration > 0 && (
                <div
                    className="toast-progress"
                    style={{ animationDuration: `${duration}ms` }}
                />
            )}
        </div>
    );
};

Toast.propTypes = {
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    message: PropTypes.string.isRequired,
    variant: PropTypes.oneOf(['success', 'error', 'warning', 'info']),
    title: PropTypes.string,
    duration: PropTypes.number,
    onDismiss: PropTypes.func.isRequired,
};

Toast.defaultProps = {
    variant: 'info',
    duration: 4000,
};

export default Toast;
