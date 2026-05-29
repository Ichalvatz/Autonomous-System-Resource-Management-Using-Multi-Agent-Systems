/**
 * @fileoverview Mobile bottom navigation component.
 * Shows on small screens with quick access to main app sections.
 * @module components/ui/BottomNavigation
 */

import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import PropTypes from 'prop-types';
import Icon from './Icon';
import './BottomNavigation.css';

/** Navigation items configuration */
const NAV_ITEMS = [
    { path: '/', icon: 'home', label: 'Home' },
    { path: '/recommendations', icon: 'star', label: 'Recs', requiresAuth: true },
    { path: '/favourites', icon: 'heart', label: 'Saved', requiresAuth: true },
    { path: '/navigation', icon: 'navigation', label: 'Navigate' },
];

/** Filter navigation items based on authentication */
const filterNavItems = (items, isAuthenticated) =>
    items.filter(item => !item.requiresAuth || isAuthenticated);

/** Get class name for nav item */
const getNavItemClassName = ({ isActive }) =>
    `bottom-nav-item ${isActive ? 'active' : ''}`;

/**
 * BottomNavigation Component
 * Mobile-friendly bottom navigation bar
 * Shows only on smaller screens via CSS
 */
const BottomNavigation = ({ isAuthenticated = false }) => {
    const location = useLocation();
    const filteredItems = filterNavItems(NAV_ITEMS, isAuthenticated);

    return (
        <nav className="bottom-navigation" aria-label="Mobile navigation">
            {filteredItems.map((item) => (
                <NavLink
                    key={item.path}
                    to={item.path}
                    className={getNavItemClassName}
                    aria-current={location.pathname === item.path ? 'page' : undefined}
                >
                    <span className="bottom-nav-icon">
                        <Icon name={item.icon} size="md" />
                    </span>
                    <span className="bottom-nav-label">{item.label}</span>
                </NavLink>
            ))}
        </nav>
    );
};

BottomNavigation.propTypes = {
    isAuthenticated: PropTypes.bool,
};

export default BottomNavigation;
