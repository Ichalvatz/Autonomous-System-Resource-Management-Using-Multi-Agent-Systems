import React from 'react';
import PropTypes from 'prop-types';
import './Hero.css';

/** Size class mappings */
const SIZE_CLASSES = {
    small: 'hero--small',
    medium: 'hero--medium',
    large: 'hero--large',
};

/** Alignment class mappings */
const ALIGN_CLASSES = {
    left: 'hero--align-left',
    center: 'hero--align-center',
    right: 'hero--align-right',
};

/** Build hero CSS classes from props */
const buildHeroClasses = ({ size, align, overlayColor, backgroundImage, className }) => [
    'hero',
    SIZE_CLASSES[size] || SIZE_CLASSES.large,
    ALIGN_CLASSES[align] || ALIGN_CLASSES.center,
    overlayColor === 'light' ? 'hero--overlay-light' : 'hero--overlay-dark',
    backgroundImage ? 'hero--has-image' : '',
    className,
].filter(Boolean).join(' ');

/**
 * Hero Component - Reusable hero section with background image support
 * 
 * @example
 * <Hero
 *   title="Discover Your Next Adventure"
 *   subtitle="Explore amazing destinations around the world"
 *   backgroundImage="/images/hero-bg.jpg"
 *   overlayOpacity={0.5}
 *   size="large"
 * >
 *   <SearchBar />
 * </Hero>
 */
const Hero = ({
    title,
    subtitle,
    backgroundImage,
    overlayOpacity = 0.5,
    overlayColor = 'dark',
    size = 'large',
    align = 'center',
    children,
    className = '',
    ...rest
}) => {
    const heroClasses = buildHeroClasses({ size, align, overlayColor, backgroundImage, className });
    const overlayStyle = { '--hero-overlay-opacity': overlayOpacity };
    const TravelGlobe = React.useMemo(() => React.lazy(() => import('./3d/TravelGlobe')), []);

    return (
        <section className={heroClasses} style={overlayStyle} {...rest}>
            {/* Background Layer */}
            <div className="hero__background">
                {backgroundImage ? (
                    <img src={backgroundImage} alt="" className="hero__bg-image" aria-hidden="true" />
                ) : (
                    <div className="hero__bg-gradient" aria-hidden="true" />
                )}

                {/* 3D Globe Overlay */}
                <div className="hero__globe-container" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%', zIndex: 0, opacity: 0.6, pointerEvents: 'none' }}>
                    <React.Suspense fallback={null}>
                        <TravelGlobe />
                    </React.Suspense>
                </div>

                <div className="hero__overlay" aria-hidden="true" />
            </div>

            {/* Decorative Pattern */}
            <div className="hero__pattern" aria-hidden="true" />

            {/* Content Layer */}
            <div className="hero__container container">
                <div className="hero__content">
                    {title && <h1 className="hero__title animate-fadeInUp">{title}</h1>}
                    {subtitle && <p className="hero__subtitle animate-fadeInUp stagger-1">{subtitle}</p>}
                    {children && <div className="hero__actions animate-fadeInUp stagger-2">{children}</div>}
                </div>
            </div>

            {/* Bottom Wave */}
            <div className="hero__wave" aria-hidden="true">
                <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
                    <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="currentColor" />
                </svg>
            </div>
        </section>
    );
};

Hero.propTypes = {
    title: PropTypes.string,
    subtitle: PropTypes.string,
    backgroundImage: PropTypes.string,
    overlayOpacity: PropTypes.number,
    overlayColor: PropTypes.oneOf(['dark', 'light']),
    size: PropTypes.oneOf(['small', 'medium', 'large']),
    align: PropTypes.oneOf(['left', 'center', 'right']),
    children: PropTypes.node,
    className: PropTypes.string,
};

export default Hero;
