/**
 * @fileoverview Homepage call-to-action section component.
 * Displays CTA banner with link to explore destinations.
 * @module components/home/CTASection
 */

import React from 'react';
import { Link } from 'react-router-dom';
import { Button, Icon } from '../ui';

/**
 * CTA section for HomePage
 */
const CTASection = ({ t }) => {
    return (
        <section className="cta-section">
            <div className="container">
                <div className="cta-content">
                    <h2 className="cta-title">{t('ctaTitle')}</h2>
                    <p className="cta-description">{t('ctaDescription')}</p>
                    <div className="cta-actions">
                        <Link to="/recommendations">
                            <Button variant="primary" size="lg">
                                {t('exploreDestinations')}
                                <Icon name="arrow" size="sm" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default CTASection;
