import React, { useState, useEffect } from 'react';
import './ScrollProgress.css';

/**
 * ScrollProgress Component
 * Displays scroll progress as a thin gradient bar below the header
 */
const ScrollProgress = () => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const updateProgress = () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;

            if (docHeight <= 0) {
                setProgress(0);
                return;
            }

            const scrollProgress = (scrollTop / docHeight) * 100;
            setProgress(Math.min(100, Math.max(0, scrollProgress)));
        };

        window.addEventListener('scroll', updateProgress, { passive: true });
        // Initial check
        updateProgress();

        return () => window.removeEventListener('scroll', updateProgress);
    }, []);

    // Don't render if there's nothing to scroll
    if (progress === 0 && window.scrollY === 0) {
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (docHeight <= 0) return null;
    }

    return (
        <div className="scroll-progress-container" aria-hidden="true">
            <div
                className="scroll-progress-bar"
                style={{ width: `${progress}%` }}
            />
        </div>
    );
};

export default ScrollProgress;
