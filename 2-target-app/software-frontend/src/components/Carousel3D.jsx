/**
 * @fileoverview 3D Coverflow-style carousel component.
 * Features smooth animations, drag support, and keyboard navigation.
 * @module components/Carousel3D
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import Icon from './ui/Icon';
import { useCarouselDrag, getCardStyles } from '../hooks/useCarouselDrag';
import './Carousel3D.css';

/**
 * Carousel3D Component - A 3D coverflow-style carousel with smooth animations
 */
const Carousel3D = ({
    items = [], renderItem, autoPlay = false, autoPlayInterval = 5000,
    showNavigation = true, showDots = true,
}) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const carouselRef = useRef(null);
    const itemCount = items.length;

    const goToNext = useCallback(() => {
        if (itemCount === 0) return;
        setActiveIndex((prev) => (prev + 1) % itemCount);
    }, [itemCount]);

    const goToPrev = useCallback(() => {
        if (itemCount === 0) return;
        setActiveIndex((prev) => (prev - 1 + itemCount) % itemCount);
    }, [itemCount]);

    const goToSlide = useCallback((index) => {
        if (index >= 0 && index < itemCount) setActiveIndex(index);
    }, [itemCount]);

    const { isDragging, dragOffset, handleDragStart, handleDragMove, handleDragEnd } =
        useCarouselDrag(itemCount, autoPlay, autoPlayInterval, goToNext);

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!carouselRef.current?.contains(document.activeElement)) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); goToPrev(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); goToNext(); }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToNext, goToPrev]);

    if (itemCount === 0) return null;

    return (
        <div className="carousel-3d" ref={carouselRef} role="region"
            aria-label="Featured destinations carousel" aria-roledescription="carousel">
            <div className="carousel-3d__stage" onMouseDown={handleDragStart} onMouseMove={handleDragMove}
                onMouseUp={() => handleDragEnd(goToPrev, goToNext)} onMouseLeave={() => handleDragEnd(goToPrev, goToNext)}
                onTouchStart={handleDragStart} onTouchMove={handleDragMove} onTouchEnd={() => handleDragEnd(goToPrev, goToNext)}>
                <div className="carousel-3d__track">
                    {items.map((item, index) => (
                        <div key={item.id || item.placeId || index}
                            className={`carousel-3d__item ${index === activeIndex ? 'carousel-3d__item--active' : ''}`}
                            style={getCardStyles(index, activeIndex, isDragging, dragOffset)}
                            onClick={() => goToSlide(index)} role="group" aria-roledescription="slide"
                            aria-label={`Slide ${index + 1} of ${itemCount}`} aria-hidden={index !== activeIndex}
                            tabIndex={index === activeIndex ? 0 : -1}>
                            {renderItem(item, index, index === activeIndex)}
                        </div>
                    ))}
                </div>
            </div>

            {showNavigation && itemCount > 1 && (
                <>
                    <button className="carousel-3d__nav carousel-3d__nav--prev" onClick={goToPrev}
                        aria-label="Previous slide" type="button"><Icon name="arrow" size="lg" /></button>
                    <button className="carousel-3d__nav carousel-3d__nav--next" onClick={goToNext}
                        aria-label="Next slide" type="button"><Icon name="arrow" size="lg" /></button>
                </>
            )}

            {showDots && itemCount > 1 && (
                <div className="carousel-3d__dots" role="tablist" aria-label="Carousel navigation">
                    {items.map((_, index) => (
                        <button key={index} className={`carousel-3d__dot ${index === activeIndex ? 'carousel-3d__dot--active' : ''}`}
                            onClick={() => goToSlide(index)} role="tab" aria-selected={index === activeIndex}
                            aria-label={`Go to slide ${index + 1}`} type="button" />
                    ))}
                </div>
            )}

            {autoPlay && itemCount > 1 && (
                <div className="carousel-3d__progress">
                    <div className="carousel-3d__progress-bar" key={activeIndex}
                        style={{ animationDuration: `${autoPlayInterval}ms`, animationPlayState: isDragging ? 'paused' : 'running' }} />
                </div>
            )}
        </div>
    );
};

Carousel3D.propTypes = {
    items: PropTypes.array.isRequired, renderItem: PropTypes.func.isRequired,
    autoPlay: PropTypes.bool, autoPlayInterval: PropTypes.number,
    showNavigation: PropTypes.bool, showDots: PropTypes.bool,
};

export default Carousel3D;
