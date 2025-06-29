import React, { useMemo } from 'react';
import { useImageColors } from '../hooks/useImageColors';

interface DynamicBackgroundProps {
  imageUrl?: string;
  variant?: 'mobile' | 'desktop';
  className?: string;
}

interface GradientOrb {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
  opacity: number;
  blur: number;
}

export const DynamicBackground: React.FC<DynamicBackgroundProps> = ({ 
  imageUrl, 
  variant = 'desktop',
  className = '' 
}) => {
  const colors = useImageColors(imageUrl);

  // Generate random but organized static orb layout
  const orbs = useMemo(() => {
    if (!colors || variant === 'mobile') return [];

    const colorPalette = [colors.dominant, colors.secondary, colors.accent];
    const orbCount = Math.floor(Math.random() * 4) + 3; // 3-6 orbs
    const generatedOrbs: GradientOrb[] = [];

    // Create grid-based positions to avoid overlap
    const gridCells = [
      { x: 10, y: 15 }, { x: 25, y: 10 }, { x: 75, y: 20 },
      { x: 85, y: 70 }, { x: 60, y: 80 }, { x: 20, y: 85 },
      { x: 40, y: 30 }, { x: 70, y: 45 }, { x: 15, y: 50 },
      { x: 80, y: 25 }, { x: 50, y: 15 }, { x: 30, y: 65 }
    ];

    // Shuffle and select positions
    const shuffledCells = [...gridCells].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < Math.min(orbCount, shuffledCells.length); i++) {
      const cell = shuffledCells[i];
      const colorIndex = i % colorPalette.length;
      
      // Add some randomness to grid positions
      const randomOffsetX = (Math.random() - 0.5) * 10; // ±5%
      const randomOffsetY = (Math.random() - 0.5) * 10; // ±5%
      
      generatedOrbs.push({
        id: `orb-${i}`,
        x: Math.max(5, Math.min(95, cell.x + randomOffsetX)),
        y: Math.max(5, Math.min(95, cell.y + randomOffsetY)),
        size: Math.floor(Math.random() * 200) + 150, // 150-350px
        color: colorPalette[colorIndex],
        opacity: Math.random() * 0.2 + 0.1, // 0.1-0.3
        blur: Math.floor(Math.random() * 2) + 2, // 2-3 (for blur-2xl to blur-3xl)
      });
    }

    return generatedOrbs;
  }, [colors, variant, imageUrl]); // Regenerate when image changes

  if (!colors && !imageUrl) {
    return (
      <div className={`fixed inset-0 bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 ${className}`} />
    );
  }

  if (variant === 'mobile' && imageUrl) {
    return (
      <div className={`fixed inset-0 ${className}`}>
        {/* Base image background */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
        
        {/* Blur overlay */}
        <div className="absolute inset-0 backdrop-blur-3xl bg-black/40" />
        
        {/* Glass effect with extracted colors */}
        {colors && (
          <div 
            className="absolute inset-0 backdrop-blur-sm"
            style={{
              background: `linear-gradient(135deg, 
                ${colors.dominant}20, 
                ${colors.secondary}15, 
                ${colors.accent}10,
                transparent 70%
              )`
            }}
          />
        )}
        
        {/* Additional ice/frost effect */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-black/20" />
      </div>
    );
  }

  // Desktop variant - use colors without stretching image
  return (
    <div className={`fixed inset-0 ${className}`}>
      {colors ? (
        <>
          {/* Base gradient using extracted colors */}
          <div 
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at 30% 20%, ${colors.dominant}40 0%, ${colors.secondary}20 50%, ${colors.accent}10 100%),
                          linear-gradient(135deg, ${colors.dominant}30, ${colors.secondary}20, transparent 70%)`
            }}
          />
          
          {/* Dynamic static gradient orbs */}
          {orbs.map((orb) => {
            const blurClass = orb.blur === 2 ? 'blur-2xl' : 'blur-3xl';
            
            return (
              <div 
                key={orb.id}
                className={`absolute rounded-full ${blurClass}`}
                style={{
                  left: `${orb.x}%`,
                  top: `${orb.y}%`,
                  width: `${orb.size}px`,
                  height: `${orb.size}px`,
                  backgroundColor: orb.color,
                  opacity: orb.opacity,
                  transform: 'translate(-50%, -50%)', // Center the orbs
                }}
              />
            );
          })}
          
          {/* Glass/ice overlay */}
          <div className="absolute inset-0 backdrop-blur-sm bg-gradient-to-br from-white/5 via-transparent to-black/20" />
          
          {/* Frosted glass effect */}
          <div 
            className="absolute inset-0 opacity-40"
            style={{
              background: `conic-gradient(from 45deg, ${colors.dominant}10, ${colors.secondary}05, ${colors.accent}08, transparent)`
            }}
          />
        </>
      ) : (
        /* Fallback gradient */
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900" />
      )}
      
      {/* Noise texture for extra depth */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.4'/%3E%3C/svg%3E")`,
          backgroundSize: '200px 200px'
        }}
      />
    </div>
  );
}; 