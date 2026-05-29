/**
 * @fileoverview Site footer component.
 * Contains branding, navigation links, and copyright.
 * @module components/Footer
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n';
import Icon from './ui/Icon';
import './Footer.css';

/**
 * Footer Component
 * Consistent footer across all pages with navigation and branding
 */
const Footer = () => {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();

    return (
        <footer className="footer">
            <div className="footer-container">
                <div className="footer-main">
                    <div className="footer-brand">
                        <Link to="/" className="footer-logo">
                            <Icon name="globe" size="lg" />
                            <span>myWorld Travel</span>
                        </Link>
                        <p className="footer-tagline">
                            {t('discoverAmazingPlaces')}
                        </p>
                    </div>

                    <nav className="footer-nav">
                        <div className="footer-nav-group">
                            <h4>{t('explore')}</h4>
                            <Link to="/">{t('home')}</Link>
                            <Link to="/recommendations">{t('recommendations')}</Link>
                            <Link to="/favourites">{t('favourites')}</Link>
                        </div>
                        <div className="footer-nav-group">
                            <h4>{t('account')}</h4>
                            <Link to="/profile">{t('profile')}</Link>
                            <Link to="/preferences">{t('preferences')}</Link>
                            <Link to="/navigation">{t('navigation')}</Link>
                        </div>
                    </nav>
                </div>

                <div className="footer-bottom">
                    <p className="footer-copyright">
                        © {currentYear} myWorld Travel. {t('allRightsReserved')}
                    </p>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
