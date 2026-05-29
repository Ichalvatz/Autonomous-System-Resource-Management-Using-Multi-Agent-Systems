/**
 * @fileoverview Photo gallery component with lightbox modal.
 * Category-based gallery using Unsplash images.
 * @module components/ui/PhotoGallery
 */

import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Icon from './Icon';
import './PhotoGallery.css';

/**
 * PhotoGallery Component
 * Category-based photo gallery for places with lightbox modal
 */

// Category-based gallery images (using Unsplash)
const GALLERY_IMAGES = {
    MUSEUM: [
        'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1564399579883-451a5d44ec08?w=800&h=600&fit=crop&q=80',
    ],
    RESTAURANT: [
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&h=600&fit=crop&q=80',
    ],
    BEACH: [
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1473116763249-2faaef81ccda?w=800&h=600&fit=crop&q=80',
    ],
    NIGHTLIFE: [
        'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1545128485-c400e7702796?w=800&h=600&fit=crop&q=80',
    ],
    PARK: [
        'https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=800&h=600&fit=crop&q=80',
    ],
    CULTURE: [
        'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=800&h=600&fit=crop&q=80',
    ],
    MONUMENT: [
        'https://images.unsplash.com/photo-1555993539-1732b0258235?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1568684333877-a9b97a24f32f?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1564507592333-c60657eea523?w=800&h=600&fit=crop&q=80',
    ],
    DEFAULT: [
        'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&h=600&fit=crop&q=80',
        'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop&q=80',
    ],
};

/**
 * PhotoGallery Component
 * Displays category-based images with clickable lightbox modal.
 */
const PhotoGallery = ({ category = 'DEFAULT', placeName = 'Place' }) => {
    // Lightbox state management
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    // Get images for this category or fallback to default
    const images = GALLERY_IMAGES[category] || GALLERY_IMAGES.DEFAULT;

    /** Open lightbox at specific image index */
    const openLightbox = (index) => {
        setCurrentIndex(index);
        setLightboxOpen(true);
        document.body.style.overflow = 'hidden'; // Prevent background scroll
    };

    /** Close lightbox and restore scroll */
    const closeLightbox = () => {
        setLightboxOpen(false);
        document.body.style.overflow = '';
    };

    /** Navigate to next image (circular) */
    const goNext = () => {
        setCurrentIndex((prev) => (prev + 1) % images.length);
    };

    /** Navigate to previous image (circular) */
    const goPrev = () => {
        setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    };

    /** Keyboard navigation handler for lightbox */
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowRight') goNext();
        if (e.key === 'ArrowLeft') goPrev();
    };

    return (
        <>
            {/* Gallery grid with thumbnails */}
            <div className="photo-gallery">
                <div className="gallery-grid">
                    {images.map((src, index) => (
                        <button
                            key={index}
                            className="gallery-item"
                            onClick={() => openLightbox(index)}
                            aria-label={`View photo ${index + 1} of ${images.length}`}
                        >
                            <img
                                src={src}
                                alt={`${placeName} - view ${index + 1}`}
                                loading="lazy"
                            />
                            <div className="gallery-overlay">
                                <Icon name="eye" size="lg" />
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Lightbox Modal */}
            {lightboxOpen && (
                <div
                    className="lightbox"
                    onClick={closeLightbox}
                    onKeyDown={handleKeyDown}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Photo lightbox"
                    tabIndex={-1}
                >
                    <button className="lightbox-close" onClick={closeLightbox} aria-label="Close">
                        <Icon name="close" size="lg" />
                    </button>

                    <button className="lightbox-nav lightbox-prev" onClick={(e) => { e.stopPropagation(); goPrev(); }} aria-label="Previous">
                        <Icon name="chevronLeft" size="xl" />
                    </button>

                    <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={images[currentIndex]}
                            alt={`${placeName} - view ${currentIndex + 1}`}
                        />
                        <div className="lightbox-counter">
                            {currentIndex + 1} / {images.length}
                        </div>
                    </div>

                    <button className="lightbox-nav lightbox-next" onClick={(e) => { e.stopPropagation(); goNext(); }} aria-label="Next">
                        <Icon name="chevronRight" size="xl" />
                    </button>
                </div>
            )}
        </>
    );
};

PhotoGallery.propTypes = {
    category: PropTypes.string,
    placeName: PropTypes.string,
};

export default PhotoGallery;
