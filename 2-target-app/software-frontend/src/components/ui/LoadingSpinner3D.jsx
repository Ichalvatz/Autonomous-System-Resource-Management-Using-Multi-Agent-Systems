/**
 * @fileoverview 3D Loading Spinner Component using Three.js/React Three Fiber.
 * 
 * Provides an animated 3D torus spinner for loading states. Uses React Three
 * Fiber for WebGL rendering with @react-three/drei for convenient 3D primitives.
 * The spinner features a continuously rotating torus shape.
 * 
 * @module components/ui/LoadingSpinner3D
 * @requires react
 * @requires @react-three/fiber - React renderer for Three.js
 * @requires @react-three/drei - Useful helpers for React Three Fiber
 */

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Torus } from '@react-three/drei';

/**
 * SpinningTorus Component
 * 
 * Internal component that renders an animated torus mesh.
 * Uses useFrame hook for animation loop integration.
 * Rotates on both X and Y axes at different speeds for visual interest.
 * 
 * @component
 * @private
 * @returns {React.ReactElement} A rotating torus 3D mesh
 */
const SpinningTorus = () => {
    // Ref to access the mesh for animation
    const meshRef = useRef();

    // Animation loop - updates rotation on each frame
    useFrame((_, delta) => {
        if (meshRef.current) {
            // Rotate on X axis at 1x speed
            meshRef.current.rotation.x += delta * 1;
            // Rotate on Y axis at 2x speed for asymmetric motion
            meshRef.current.rotation.y += delta * 2;
        }
    });

    return (
        // Torus geometry: [radius, tube radius, radial segments, tubular segments]
        <Torus ref={meshRef} args={[1, 0.2, 16, 32]}>
            {/* Indigo/purple color matching app theme */}
            <meshStandardMaterial color="#4f46e5" />
        </Torus>
    );
};

/**
 * LoadingSpinner3D Component
 * 
 * A 3D animated loading spinner using WebGL rendering.
 * Displays a rotating torus shape with ambient and point lighting.
 * 
 * @component
 * @example
 * // Basic usage
 * <LoadingSpinner3D />
 * 
 * @example
 * // With custom className for positioning
 * <LoadingSpinner3D className="centered-spinner" />
 * 
 * @param {Object} props - Component props
 * @param {string} [props.className] - Optional CSS class name for the container
 * @returns {React.ReactElement} A 3D canvas with animated spinner
 */
const LoadingSpinner3D = ({ className }) => {
    return (
        // Container div with fixed dimensions for the 3D canvas
        <div className={className} style={{ width: '100px', height: '100px' }}>
            {/* Three.js canvas with positioned camera */}
            <Canvas camera={{ position: [0, 0, 5] }}>
                {/* Ambient light for overall illumination */}
                <ambientLight intensity={0.5} />
                {/* Point light for highlights and depth */}
                <pointLight position={[10, 10, 10]} />
                {/* Animated torus spinner */}
                <SpinningTorus />
            </Canvas>
        </div>
    );
};

export default LoadingSpinner3D;

