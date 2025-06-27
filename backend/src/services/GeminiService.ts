import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import { createError } from '../middleware/errorHandler';

export class GeminiService {
  private client: GoogleGenAI;
  
  constructor() {
    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!
    });
  }

  async generateMetadataFromFile(filePath: string): Promise<{
    summary?: string;
    keywords?: string[];
    captions?: string;
    generatedAt: Date;
  }> {
    try {
      // For now, return basic AI metadata structure
      // In a real implementation, you would analyze the file content
      return {
        summary: 'AI-generated summary will be available soon',
        keywords: ['media', 'archived'],
        captions: 'AI-generated captions will be available soon',
        generatedAt: new Date(),
      };
    } catch (error) {
      console.error('Gemini metadata generation error:', error);
      return {
        summary: 'Failed to generate AI summary',
        keywords: [],
        captions: 'Failed to generate AI captions',
        generatedAt: new Date(),
      };
    }
  }

  async generateMetadata(mediaId: string, userId: string): Promise<{
    summary?: string;
    keywords?: string[];
    captions?: string;
    generatedAt: Date;
  }> {
    try {
      // In a real implementation, you would fetch the media item and analyze it
      // For now, return placeholder AI metadata
      return {
        summary: 'AI-generated summary based on media content',
        keywords: ['media', 'content', 'archived'],
        captions: 'AI-generated captions for this media item',
        generatedAt: new Date(),
      };
    } catch (error) {
      throw createError(`Failed to generate AI metadata: ${(error as Error).message}`, 500);
    }
  }

  async analyzeText(text: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    topics: string[];
    summary: string;
  }> {
    try {
      const prompt = `Analyze the following text and provide:
1. Sentiment (positive/negative/neutral)
2. Main topics (as an array)
3. Brief summary

Text: "${text}"

Respond in JSON format with keys: sentiment, topics, summary`;
      
      const result = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              sentiment: {
                type: 'string',
                enum: ['positive', 'negative', 'neutral']
              },
              topics: {
                type: 'array',
                items: { type: 'string' }
              },
              summary: {
                type: 'string'
              }
            },
            required: ['sentiment', 'topics', 'summary']
          }
        }
      });
      
      try {
        return JSON.parse(result.text);
      } catch {
        // Fallback if JSON parsing fails
        return {
          sentiment: 'neutral' as const,
          topics: ['general'],
          summary: 'Analysis not available',
        };
      }
    } catch (error) {
      throw createError(`Failed to analyze text: ${(error as Error).message}`, 500);
    }
  }
} 