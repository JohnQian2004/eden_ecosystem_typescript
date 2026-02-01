/**
 * Garden of Eden Mobile App - Typography
 * Serif fonts for classical feel + handwritten fonts for warmth
 */

export const typography = {
  // Serif fonts (classical)
  serif: {
    regular: 'Georgia',
    bold: 'Georgia-Bold',
  },
  
  // Handwritten fonts (warmth)
  handwritten: {
    regular: 'Brush Script MT',
    italic: 'Brush Script MT-Italic',
  },
  
  // System fonts (fallback)
  system: {
    regular: 'System',
    bold: 'System-Bold',
  },
  
  // Font Sizes
  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },
  
  // Line Heights
  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },
  
  // Font Weights
  weights: {
    light: '300',
    regular: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
};

export type Typography = typeof typography;

