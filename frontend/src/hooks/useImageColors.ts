import { useState, useEffect } from 'react';

interface ColorPalette {
  dominant: string;
  secondary: string;
  accent: string;
  text: string;
}

export const useImageColors = (imageUrl?: string): ColorPalette | null => {
  const [colors, setColors] = useState<ColorPalette | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setColors(null);
      return;
    }

    const extractColors = async () => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          // Scale down for performance
          const scale = Math.min(100 / img.width, 100 / img.height);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;

          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const colorMap = new Map<string, number>();
          
          // Sample every 4th pixel for performance
          for (let i = 0; i < imageData.data.length; i += 16) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];
            const a = imageData.data[i + 3];
            
            if (a < 128) continue; // Skip transparent pixels
            
            // Group similar colors
            const roundedR = Math.round(r / 16) * 16;
            const roundedG = Math.round(g / 16) * 16;
            const roundedB = Math.round(b / 16) * 16;
            
            const colorKey = `${roundedR},${roundedG},${roundedB}`;
            colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
          }

          // Sort colors by frequency
          const sortedColors = Array.from(colorMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([color]) => {
              const [r, g, b] = color.split(',').map(Number);
              return { r, g, b };
            });

          if (sortedColors.length === 0) {
            setColors({
              dominant: '#8b5cf6',
              secondary: '#a855f7',
              accent: '#c084fc',
              text: '#ffffff'
            });
            return;
          }

          // Find dominant color (most frequent)
          const dominant = sortedColors[0];
          
          // Find secondary color (different enough from dominant)
          const secondary = sortedColors.find(color => {
            const distance = Math.sqrt(
              Math.pow(color.r - dominant.r, 2) +
              Math.pow(color.g - dominant.g, 2) +
              Math.pow(color.b - dominant.b, 2)
            );
            return distance > 50;
          }) || sortedColors[1] || dominant;

          // Create accent by adjusting saturation/lightness
          const accent = {
            r: Math.min(255, dominant.r + 30),
            g: Math.min(255, dominant.g + 30),
            b: Math.min(255, dominant.b + 30)
          };

          // Determine text color based on dominant color brightness
          const brightness = (dominant.r * 299 + dominant.g * 587 + dominant.b * 114) / 1000;
          const textColor = brightness > 128 ? '#000000' : '#ffffff';

          setColors({
            dominant: `rgb(${dominant.r}, ${dominant.g}, ${dominant.b})`,
            secondary: `rgb(${secondary.r}, ${secondary.g}, ${secondary.b})`,
            accent: `rgb(${accent.r}, ${accent.g}, ${accent.b})`,
            text: textColor
          });
        };

        img.onerror = () => {
          // Fallback colors
          setColors({
            dominant: '#8b5cf6',
            secondary: '#a855f7',
            accent: '#c084fc',
            text: '#ffffff'
          });
        };

        img.src = imageUrl;
      } catch (error) {
        console.error('Error extracting colors:', error);
        setColors({
          dominant: '#8b5cf6',
          secondary: '#a855f7',
          accent: '#c084fc',
          text: '#ffffff'
        });
      }
    };

    extractColors();
  }, [imageUrl]);

  return colors;
}; 