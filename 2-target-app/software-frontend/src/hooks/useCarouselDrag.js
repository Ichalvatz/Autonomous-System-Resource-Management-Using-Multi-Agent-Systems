import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Hook for managing carousel drag interactions and navigation
 */
export const useCarouselDrag = (itemCount, autoPlay, autoPlayInterval, goToNext) => {
    const [isDragging, setIsDragging] = useState(false);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragOffset, setDragOffset] = useState(0);
    const autoPlayRef = useRef(null);

    // Auto-play functionality
    useEffect(() => {
        if (autoPlay && !isDragging && itemCount > 1) {
            autoPlayRef.current = setInterval(goToNext, autoPlayInterval);
        }
        return () => { if (autoPlayRef.current) clearInterval(autoPlayRef.current); };
    }, [autoPlay, autoPlayInterval, isDragging, goToNext, itemCount]);

    const handleDragStart = (e) => {
        setIsDragging(true);
        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        setDragStartX(clientX);
        setDragOffset(0);
    };

    const handleDragMove = (e) => {
        if (!isDragging) return;
        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        setDragOffset(clientX - dragStartX);
    };

    const handleDragEnd = useCallback((goToPrev, goToNextFn) => {
        if (!isDragging) return;
        setIsDragging(false);
        const threshold = 50;
        if (dragOffset > threshold) goToPrev();
        else if (dragOffset < -threshold) goToNextFn();
        setDragOffset(0);
    }, [isDragging, dragOffset]);

    return { isDragging, dragOffset, handleDragStart, handleDragMove, handleDragEnd };
};

/**
 * Calculate card position and styles for 3D carousel
 */
export const getCardStyles = (index, activeIndex, isDragging, dragOffset) => {
    const diff = index - activeIndex;
    const absDiff = Math.abs(diff);

    let translateX = diff * 280;
    let translateZ = -absDiff * 150;
    let rotateY = diff * -35;
    let scale = 1 - absDiff * 0.15;
    let opacity = 1 - absDiff * 0.25;
    let zIndex = 100 - absDiff;

    if (absDiff > 2) {
        translateZ = -300; scale = 0.6; opacity = 0.3;
        rotateY = diff > 0 ? -70 : 70;
    }

    if (isDragging) translateX += dragOffset * 0.5;

    return {
        transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
        opacity: Math.max(0, opacity),
        zIndex,
        transition: isDragging ? 'none' : undefined,
    };
};
