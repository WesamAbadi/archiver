/**
 * Arabic Text Processing and Fuzzy Matching Utilities
 * 
 * This module provides comprehensive tools for handling Arabic text variations,
 * normalization, and fuzzy matching. It addresses common challenges in Arabic
 * text search including:
 * 
 * - Character variants (ي/ى, ه/ة, etc.)
 * - Definite article variations (ال prefix)
 * - Diacritic differences
 * - Regional spelling variations
 * 
 * Based on research from:
 * - Arabic fuzzy search best practices
 * - Levenshtein distance algorithms
 * - Common Arabic linguistic patterns
 */

export interface FuzzyMatchResult {
  similarity: number;
  matchType: 'exact' | 'normalized' | 'variant' | 'fuzzy';
  variants: string[];
}

export class ArabicTextProcessor {
  // Common Arabic character variants that should be treated as equivalent
  private static readonly ARABIC_VARIANTS = new Map([
    // Ya/Ta marbuta variants - very common in Arabic text
    ['ي', ['ى', 'ي']], // ya/alif maqsura
    ['ه', ['ة', 'ه']], // ha/ta marbuta  
    ['ة', ['ه', 'ة']], // ta marbuta/ha
    ['ى', ['ي', 'ى']], // alif maqsura/ya
    
    // Hamza variants - crucial for proper Arabic matching
    ['ا', ['أ', 'إ', 'آ', 'ا']], // alif variants
    ['أ', ['ا', 'إ', 'آ', 'أ']],
    ['إ', ['ا', 'أ', 'آ', 'إ']],
    ['آ', ['ا', 'أ', 'إ', 'آ']],
    
    // Other common variants
    ['ك', ['ک', 'ك']], // kaf variants
    ['و', ['ؤ', 'و']], // waw variants
    ['ئ', ['ي', 'ئ']], // ya hamza variants
  ]);

  // Definite article patterns including common prefixes
  private static readonly DEFINITE_ARTICLES = [
    'ال',   // Standard definite article
    'وال',  // wa + al (and the)
    'بال',  // bi + al (with the)  
    'فال',  // fa + al (so the)
    'كال',  // ka + al (like the)
    'لل',   // li + al contracted (for the)
  ];

  // Common Arabic stop words that can be ignored in fuzzy matching
  private static readonly ARABIC_STOP_WORDS = new Set([
    'في', 'من', 'إلى', 'على', 'عن', 'مع', 'إن', 'أن', 'كان', 'التي', 'الذي',
    'هذا', 'هذه', 'ذلك', 'تلك', 'لكن', 'غير', 'بعد', 'قبل', 'عند', 'لدى'
  ]);
  
  /**
   * Normalize Arabic text for better matching
   * Handles diacritics, character variants, and whitespace
   */
  static normalizeArabic(text: string): string {
    if (!text) return '';
    
    let normalized = text.trim();
    
    // Remove Arabic diacritics (short vowels, shadda, sukun, etc.)
    // Unicode ranges for Arabic diacritics
    normalized = normalized.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
    
    // Normalize hamza variants to simple alif
    normalized = normalized.replace(/[أإآ]/g, 'ا');
    
    // Normalize ya/alif maqsura variants
    normalized = normalized.replace(/ى/g, 'ي');
    
    // Normalize ta marbuta/ha (context-dependent, simplified approach)
    normalized = normalized.replace(/ة/g, 'ه');
    
    // Normalize other common variants
    normalized = normalized.replace(/ک/g, 'ك'); // Persian kaf to Arabic kaf
    normalized = normalized.replace(/ؤ/g, 'و'); // Hamza on waw
    
    // Remove extra whitespace and normalize
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  /**
   * Remove definite article from the beginning of Arabic words
   * Handles various forms including compound prefixes
   */
  static removeDefiniteArticle(text: string): string {
    if (!text) return '';
    
    const trimmed = text.trim();
    
    // Check for definite articles in order of length (longest first)
    const sortedArticles = [...this.DEFINITE_ARTICLES].sort((a, b) => b.length - a.length);
    
    for (const article of sortedArticles) {
      if (trimmed.startsWith(article)) {
        const withoutArticle = trimmed.substring(article.length);
        // Ensure we don't return empty string
        return withoutArticle.length > 0 ? withoutArticle : trimmed;
      }
    }
    
    return trimmed;
  }

  /**
   * Add definite article if not present
   */
  static addDefiniteArticle(text: string, article: string = 'ال'): string {
    if (!text) return '';
    
    const trimmed = text.trim();
    
    // Check if already has a definite article
    if (this.DEFINITE_ARTICLES.some(art => trimmed.startsWith(art))) {
      return trimmed;
    }
    
    return article + trimmed;
  }

  /**
   * Generate all possible variant forms of a word for fuzzy matching
   * This is key to handling Arabic text variations
   */
  static generateVariants(word: string): string[] {
    if (!word) return [];
    
    const variants = new Set<string>();
    const normalized = this.normalizeArabic(word);
    
    // Add original and normalized forms
    variants.add(word);
    if (normalized !== word) {
      variants.add(normalized);
    }
    
    // Add version without definite article
    const withoutArticle = this.removeDefiniteArticle(normalized);
    if (withoutArticle !== normalized) {
      variants.add(withoutArticle);
      // Also try removing article from original
      const originalWithoutArticle = this.removeDefiniteArticle(word);
      if (originalWithoutArticle !== word) {
        variants.add(originalWithoutArticle);
      }
    }
    
    // Add version with definite article if it doesn't have one
    if (!this.DEFINITE_ARTICLES.some(article => normalized.startsWith(article))) {
      variants.add(this.addDefiniteArticle(normalized));
      
      // Try other common definite article forms
      variants.add(this.addDefiniteArticle(normalized, 'وال'));
      variants.add(this.addDefiniteArticle(normalized, 'بال'));
    }
    
    // Generate character variants for endings (very important for Arabic)
    if (normalized.length > 2) {
      const root = normalized.slice(0, -1);
      const lastChar = normalized.slice(-1);
      
      // Generate ending variants based on common substitutions
      const endingVariants = this.generateEndingVariants(lastChar);
      endingVariants.forEach(ending => {
        if (ending !== lastChar) {
          variants.add(root + ending);
        }
      });
    }
    
    // Handle common prefixes beyond definite articles
    variants.add('و' + normalized); // wa- prefix
    variants.add('ب' + normalized); // bi- prefix
    variants.add('ل' + normalized); // li- prefix
    variants.add('ف' + normalized); // fa- prefix
    
    return Array.from(variants).filter(v => v.length > 0);
  }

  /**
   * Generate ending variants for a character
   */
  private static generateEndingVariants(char: string): string[] {
    const variants = [char];
    
    switch (char) {
      case 'ي':
        variants.push('ى', 'ه', 'ة');
        break;
      case 'ى':
        variants.push('ي', 'ه', 'ة');
        break;
      case 'ه':
        variants.push('ة', 'ي', 'ى');
        break;
      case 'ة':
        variants.push('ه', 'ي', 'ى');
        break;
      case 'ا':
        variants.push('أ', 'إ', 'آ');
        break;
    }
    
    return variants;
  }

  /**
   * Calculate comprehensive fuzzy similarity between two strings
   * Returns detailed matching information
   */
  static calculateDetailedSimilarity(str1: string, str2: string): FuzzyMatchResult {
    if (!str1 || !str2) {
      return { similarity: 0, matchType: 'fuzzy', variants: [] };
    }
    
    const norm1 = this.normalizeArabic(str1.toLowerCase());
    const norm2 = this.normalizeArabic(str2.toLowerCase());
    
    // Exact match
    if (norm1 === norm2) {
      return { 
        similarity: 1.0, 
        matchType: 'exact', 
        variants: [norm1] 
      };
    }
    
    // Original strings match
    if (str1.toLowerCase() === str2.toLowerCase()) {
      return { 
        similarity: 0.95, 
        matchType: 'exact', 
        variants: [str1.toLowerCase()] 
      };
    }
    
    // Check if one is contained in the other (substring match)
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return { 
        similarity: 0.8, 
        matchType: 'normalized', 
        variants: [norm1, norm2] 
      };
    }
    
    // Check variants
    const variants1 = this.generateVariants(norm1);
    const variants2 = this.generateVariants(norm2);
    
    let bestVariantSimilarity = 0;
    const matchingVariants: string[] = [];
    
    for (const v1 of variants1) {
      for (const v2 of variants2) {
        if (v1 === v2) {
          matchingVariants.push(v1);
          bestVariantSimilarity = Math.max(bestVariantSimilarity, 0.9);
        } else if (v1.includes(v2) || v2.includes(v1)) {
          matchingVariants.push(v1, v2);
          bestVariantSimilarity = Math.max(bestVariantSimilarity, 0.7);
        }
      }
    }
    
    if (bestVariantSimilarity > 0) {
      return {
        similarity: bestVariantSimilarity,
        matchType: 'variant',
        variants: Array.from(new Set(matchingVariants))
      };
    }
    
    // Levenshtein distance based similarity
    const distance = this.levenshteinDistance(norm1, norm2);
    const maxLength = Math.max(norm1.length, norm2.length);
    
    if (maxLength === 0) {
      return { similarity: 1.0, matchType: 'exact', variants: [] };
    }
    
    const similarity = Math.max(0, 1 - (distance / maxLength));
    
    return {
      similarity,
      matchType: 'fuzzy',
      variants: [norm1, norm2]
    };
  }

  /**
   * Simple similarity calculation (backward compatibility)
   */
  static calculateSimilarity(str1: string, str2: string): number {
    return this.calculateDetailedSimilarity(str1, str2).similarity;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * Uses dynamic programming for efficiency
   */
  static levenshteinDistance(str1: string, str2: string): number {
    if (str1.length === 0) return str2.length;
    if (str2.length === 0) return str1.length;
    
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    // Initialize first row and column
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    // Fill the matrix
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Check if a word is an Arabic stop word
   */
  static isStopWord(word: string): boolean {
    const normalized = this.normalizeArabic(word);
    return this.ARABIC_STOP_WORDS.has(normalized);
  }

  /**
   * Split text into words and filter out stop words
   */
  static getSignificantWords(text: string, includeStopWords: boolean = false): string[] {
    if (!text) return [];
    
    const words = text.trim().split(/\s+/);
    
    if (includeStopWords) {
      return words;
    }
    
    return words.filter(word => !this.isStopWord(word) && word.length > 1);
  }

  /**
   * Find the best matches from a list of candidates
   */
  static findBestMatches(query: string, candidates: string[], threshold: number = 0.3, maxResults: number = 10): Array<{text: string, similarity: number, matchType: string}> {
    if (!query || !candidates.length) return [];
    
    const results = candidates
      .map(candidate => {
        const result = this.calculateDetailedSimilarity(query, candidate);
        return {
          text: candidate,
          similarity: result.similarity,
          matchType: result.matchType
        };
      })
      .filter(result => result.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);
    
    return results;
  }

  /**
   * Enhanced search query preprocessing
   * Prepares a query for database search with multiple strategies
   */
  static preprocessSearchQuery(query: string): {
    original: string;
    normalized: string;
    variants: string[];
    significantWords: string[];
    sqlPatterns: string[];
  } {
    if (!query) {
      return {
        original: '',
        normalized: '',
        variants: [],
        significantWords: [],
        sqlPatterns: []
      };
    }

    const original = query.trim();
    const normalized = this.normalizeArabic(original);
    const variants = this.generateVariants(original);
    const significantWords = this.getSignificantWords(original);
    
    // Generate SQL LIKE patterns
    const sqlPatterns = [
      `%${original}%`,
      `%${normalized}%`,
      ...variants.map(v => `%${v}%`)
    ];

    return {
      original,
      normalized,
      variants,
      significantWords,
      sqlPatterns: Array.from(new Set(sqlPatterns))
    };
  }
}

// Export convenience functions
export const {
  normalizeArabic,
  removeDefiniteArticle,
  addDefiniteArticle,
  generateVariants,
  calculateSimilarity,
  calculateDetailedSimilarity,
  levenshteinDistance,
  isStopWord,
  getSignificantWords,
  findBestMatches,
  preprocessSearchQuery
} = ArabicTextProcessor;

// Export default
export default ArabicTextProcessor; 