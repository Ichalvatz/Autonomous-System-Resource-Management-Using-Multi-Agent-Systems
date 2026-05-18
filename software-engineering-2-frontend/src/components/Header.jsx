/**
 * @fileoverview Site header component.
 * Professional navigation with glassmorphism, user dropdown, and scroll effects.
 * @module components/Header
 */

import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks';
import { useTranslation } from '../i18n';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import UserDropdown from './UserDropdown';
import ScrollProgress from './ScrollProgress';
import Icon from './ui/Icon';
import './Header.css';

/**
 * Header Component - Enhanced Version
 * Professional navigation with glassmorphism, user dropdown, theme toggle, and scroll progress
 */
const Header = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, setUser } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [menuOpen]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    setMenuOpen(!menuOpen);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  const handleLogout = () => {
    setUser(null);
    setMenuOpen(false);
  };

  const isActive = (path) => location.pathname === path;

  return (
    <>
      <header className={`header ${scrolled ? 'header-scrolled' : ''}`}>
        <div className="header-container">
          <Link to="/" className="logo">
            <span className="logo-icon">
              <Icon name="globe" size="xl" />
            </span>
            <span className="logo-text">myWorld Travel</span>
          </Link>

          {/* Desktop Navigation */}
          <nav
            className={`nav ${menuOpen ? 'open' : ''}`}
            role="navigation"
            aria-label="Main navigation"
          >
            <Link
              to="/"
              className={`nav-link nav-link-item ${isActive('/') ? 'nav-link-active' : ''}`}
              data-cy="nav-home"
              onClick={closeMenu}
              style={{ '--item-index': 0 }}
            >
              <Icon name="home" size="sm" />
              {t('home')}
            </Link>

            {user ? (
              <>
                <Link
                  to="/recommendations"
                  className={`nav-link nav-link-item ${isActive('/recommendations') ? 'nav-link-active' : ''}`}
                  data-cy="nav-recommendations"
                  onClick={closeMenu}
                  style={{ '--item-index': 1 }}
                >
                  <Icon name="sparkles" size="sm" />
                  {t('recommendations')}
                </Link>
                <Link
                  to="/favourites"
                  className={`nav-link nav-link-item ${isActive('/favourites') ? 'nav-link-active' : ''}`}
                  data-cy="nav-favourites"
                  onClick={closeMenu}
                  style={{ '--item-index': 2 }}
                >
                  <Icon name="heart" size="sm" />
                  {t('favourites')}
                </Link>
                <Link
                  to="/navigation"
                  className={`nav-link nav-link-item ${isActive('/navigation') ? 'nav-link-active' : ''}`}
                  data-cy="nav-navigation"
                  onClick={closeMenu}
                  style={{ '--item-index': 3 }}
                >
                  <Icon name="navigation" size="sm" />
                  {t('navigation')}
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className={`nav-link nav-link-item ${isActive('/login') ? 'nav-link-active' : ''}`}
                  data-cy="nav-login"
                  onClick={closeMenu}
                  style={{ '--item-index': 1 }}
                >
                  {t('login')}
                </Link>
                <Link
                  to="/signup"
                  className="nav-link nav-link-item nav-link-signup"
                  data-cy="nav-signup"
                  onClick={closeMenu}
                  style={{ '--item-index': 2 }}
                >
                  {t('signup')}
                </Link>
              </>
            )}
          </nav>

          <div className="header-actions">
            <ThemeToggle />
            <LanguageSwitcher />

            {/* User Dropdown - visible on all screen sizes */}
            {user && (
              <UserDropdown onLogout={handleLogout} />
            )}

            <button
              className="menu-toggle"
              onClick={toggleMenu}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              <span className={`hamburger ${menuOpen ? 'open' : ''}`}></span>
            </button>
          </div>
        </div>

        {/* Scroll Progress Indicator */}
        <ScrollProgress />
      </header>

      {/* Mobile Menu Overlay */}
      {menuOpen && (
        <div
          className="mobile-menu-overlay"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}
    </>
  );
};

export default Header;
