/**
 * @fileoverview Card tilt effect hook for 3D hover interactions.
 * Provides perspective-based rotation on mouse movement.
 * @module hooks/useCardTilt
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Hook that provides a 3D tilt effect for card elements.
 * @param {Object} options - Configuration options
 * @returns {Object} ref and style to apply to the element
 */
const useCardTilt = ({ maxTilt = 15, perspective = 1000, scale = 1.05 } = {}) => {
    const ref = useRef(null);
    const [style, setStyle] = useState({});

    useEffect(() => {
        const element = ref.current;
        if (!element) return;

        const handleMouseMove = (e) => {
            const { left, top, width, height } = element.getBoundingClientRect();
            const x = e.clientX - left;
            const y = e.clientY - top;

            const centerX = width / 2;
            const centerY = height / 2;

            const tiltX = ((y - centerY) / centerY) * maxTilt * -1; // Invert tilt for natural feel
            const tiltY = ((x - centerX) / centerX) * maxTilt;

            setStyle({
                transform: `perspective(${perspective}px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(${scale})`,
                transition: 'transform 0.1s ease-out',
                zIndex: 10,
            });
        };

        const handleMouseLeave = () => {
            setStyle({
                transform: `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale(1)`,
                transition: 'transform 0.5s ease-out',
                zIndex: 1,
            });
        };

        element.addEventListener('mousemove', handleMouseMove);
        element.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            element.removeEventListener('mousemove', handleMouseMove);
            element.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [maxTilt, perspective, scale]);

    return { ref, style };
};

export default useCardTilt;
