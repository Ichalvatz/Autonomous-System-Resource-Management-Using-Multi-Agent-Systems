/**
 * @fileoverview 3D Travel Globe component.
 * Interactive globe with orbiting satellites using Three.js.
 * @module components/3d/TravelGlobe
 */

import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Icosahedron, OrbitControls, Stars } from '@react-three/drei';

const Satellite = ({ radius, speed, size, color, initialAngle = 0, axis = 'y' }) => {
    const meshRef = useRef();

    useFrame((state) => {
        if (!meshRef.current) return;
        const time = state.clock.getElapsedTime();
        // Orbit logic
        const angle = time * speed + initialAngle;

        let x, y, z;
        if (axis === 'y') {
            x = Math.cos(angle) * radius;
            z = Math.sin(angle) * radius;
            y = Math.cos(time * 0.5) * (radius * 0.2); // Gentle bobbing
        } else if (axis === 'x') {
            y = Math.cos(angle) * radius;
            z = Math.sin(angle) * radius;
            x = Math.sin(time * 0.3) * (radius * 0.2);
        } else {
            x = Math.cos(angle) * radius;
            y = Math.sin(angle) * radius;
            z = Math.cos(time * 0.3) * (radius * 0.2);
        }

        meshRef.current.position.set(x, y, z);
        meshRef.current.rotation.y += 0.05;
    });

    return (
        <mesh ref={meshRef}>
            <sphereGeometry args={[size, 16, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
        </mesh>
    );
};

const TechGlobe = () => {
    const groupRef = useRef();

    useFrame((_, delta) => {
        if (groupRef.current) {
            groupRef.current.rotation.y += delta * 0.1; // Slow main rotation
        }
    });

    return (
        <group ref={groupRef}>
            {/* Core Planet */}
            <Icosahedron args={[2.2, 1]}>
                <meshPhongMaterial
                    color="#4338ca" // Indigo-700
                    emissive="#312e81" // Indigo-900
                    specular="#a5b4fc"
                    shininess={50}
                    flatShading
                />
            </Icosahedron>

            {/* Wireframe Overlay */}
            <Icosahedron args={[2.21, 1]}>
                <meshBasicMaterial
                    color="#818cf8" // Indigo-400
                    wireframe
                    transparent
                    opacity={0.3}
                />
            </Icosahedron>

            {/* Satellites / Points of Interest */}
            <Satellite radius={3.2} speed={0.8} size={0.15} color="#fbbf24" initialAngle={0} axis="y" /> {/* Amber */}
            <Satellite radius={3.8} speed={0.6} size={0.12} color="#34d399" initialAngle={2} axis="x" /> {/* Emerald */}
            <Satellite radius={3.0} speed={1.0} size={0.10} color="#f472b6" initialAngle={4} axis="z" /> {/* Pink */}
        </group>
    );
};

const TravelGlobe = ({ className }) => {
    return (
        <div className={className} style={{ width: '100%', height: '100%', minHeight: '300px' }}>
            <Canvas camera={{ position: [0, 0, 7], fov: 45 }}>
                <ambientLight intensity={0.6} />
                <pointLight position={[10, 10, 10]} intensity={1.5} />
                <pointLight position={[-10, -10, -5]} intensity={0.5} color="#818cf8" />

                <TechGlobe />

                {/* Subtle Stars Background */}
                <Stars radius={100} depth={50} count={1000} factor={4} saturation={0} fade speed={1} />

                <OrbitControls
                    enableZoom={false}
                    enablePan={false}
                    autoRotate
                    autoRotateSpeed={0.5}
                    minPolarAngle={Math.PI / 4}
                    maxPolarAngle={Math.PI / 1.5}
                />
            </Canvas>
        </div>
    );
};

export default TravelGlobe;
