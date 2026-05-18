/**
 * @fileoverview User dropdown menu component.
 * Avatar with dropdown for profile, preferences, and logout.
 * @module components/UserDropdown
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import { logout } from '../api';
import Icon from './ui/Icon';
import './UserDropdown.css';

/**
 * UserDropdown Component
 * Displays user avatar with dropdown menu for profile actions
 */
const UserDropdown = ({ onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);
    const { user } = useAuth();
    const { t } = useTranslation();

    // Get user initials for avatar
    const getInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length >= 2) {
            return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    };

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (event) => {
            if (event.key === 'Escape' && isOpen) {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen]);

    const handleLogout = async () => {
        try {
            await logout();
            if (onLogout) onLogout();
            setIsOpen(false);
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    const toggleDropdown = () => {
        setIsOpen(!isOpen);
    };

    const closeDropdown = () => {
        setIsOpen(false);
    };

    if (!user) return null;

    return (
        <div className="user-dropdown" ref={dropdownRef}>
            <button
                className="user-dropdown-trigger"
                onClick={toggleDropdown}
                aria-expanded={isOpen}
                aria-haspopup="true"
                data-cy="user-dropdown-trigger"
            >
                <span className="user-avatar">
                    {getInitials(user.name)}
                </span>
                <span className="user-dropdown-name">{user.name}</span>
                <span className={`user-dropdown-arrow ${isOpen ? 'open' : ''}`}>
                    <Icon name="chevronDown" size="xs" />
                </span>
            </button>

            {isOpen && (
                <div className="user-dropdown-menu" role="menu">
                    <div className="user-dropdown-header">
                        <span className="user-dropdown-email">{user.email}</span>
                    </div>

                    <div className="user-dropdown-divider" />

                    <Link
                        to="/profile"
                        className="user-dropdown-item"
                        onClick={closeDropdown}
                        role="menuitem"
                        data-cy="nav-profile"
                    >
                        <Icon name="user" size="sm" />
                        {t('profile')}
                    </Link>

                    <Link
                        to="/preferences"
                        className="user-dropdown-item"
                        onClick={closeDropdown}
                        role="menuitem"
                        data-cy="nav-preferences"
                    >
                        <Icon name="settings" size="sm" />
                        {t('preferences')}
                    </Link>

                    <div className="user-dropdown-divider" />

                    <button
                        className="user-dropdown-item user-dropdown-logout"
                        onClick={handleLogout}
                        role="menuitem"
                        data-cy="btn-logout"
                    >
                        <Icon name="logout" size="sm" />
                        {t('logout')}
                    </button>
                </div>
            )}
        </div>
    );
};

export default UserDropdown;
