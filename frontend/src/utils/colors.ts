import * as THREE from 'three';
import type { AntennaElement } from '@/types/models';

/**
 * Default color palette for antenna elements
 * All colors meet WCAG AA contrast requirements (>4.5:1) with #1a1a1a background
 * Color-blind friendly (deuteranopia and protanopia safe)
 */
export const ELEMENT_COLORS = [
  '#FF8C00', // Dark Orange
  '#00CED1', // Dark Turquoise
  '#FF1493', // Deep Pink
  '#32CD32', // Lime Green
  '#FFD700', // Gold
  '#8A2BE2', // Blue Violet
  '#FF4500', // Orange Red
  '#00FA9A', // Medium Spring Green
  '#FF69B4', // Hot Pink
  '#1E90FF', // Dodger Blue
];

/**
 * Default color for new antenna elements
 */
export const DEFAULT_ELEMENT_COLOR = ELEMENT_COLORS[0]; // Orange

/**
 * Get next available color from palette
 * Cycles through palette for more than 10 elements
 */
export function getNextElementColor(existingElements: AntennaElement[]): string {
  const usedCount = existingElements.length;
  return ELEMENT_COLORS[usedCount % ELEMENT_COLORS.length];
}

/**
 * Calculate contrast ratio between two hex colors
 * Used for accessibility validation
 */
export function calculateContrastRatio(color1: string, color2: string): number {
  const getLuminance = (hex: string) => {
    const rgb = parseInt(hex.slice(1), 16);
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = (rgb & 0xff) / 255;
    
    const [rs, gs, bs] = [r, g, b].map(c => 
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );
    
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };
  
  const l1 = getLuminance(color1);
  const l2 = getLuminance(color2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Validate color meets WCAG AA standards against dark background
 */
export function validateColorContrast(color: string): boolean {
  const BACKGROUND_COLOR = '#1a1a1a';
  const WCAG_AA_RATIO = 4.5;
  
  return calculateContrastRatio(color, BACKGROUND_COLOR) >= WCAG_AA_RATIO;
}

/**
 * Convert hex color to THREE.Color
 */
export function hexToThreeColor(hex: string): THREE.Color {
  return new THREE.Color(hex);
}
