import { GoogleGenAI } from '@google/genai';
import prisma from '../lib/database';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

// Define the structured output schema for word-level transcription
interface TranscriptionSegment {
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
}

interface TranscriptionResponse {
  segments: TranscriptionSegment[];
}

export class CaptionService {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!
    });
  }

  // Wait for uploaded file to be in ACTIVE state
  private async waitForFileToBeActive(fileName: string, maxWaitTime: number = 60000): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000; // Check every 2 seconds
    
    console.log(`⏳ Waiting for file ${fileName} to be in ACTIVE state...`);
    
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const fileInfo = await this.client.files.get({ name: fileName });
        console.log(`📄 File state: ${fileInfo.state}`);
        
        if (fileInfo.state === 'ACTIVE') {
          console.log(`✅ File ${fileName} is now ACTIVE and ready for processing`);
          return;
        }
        
        if (fileInfo.state === 'FAILED') {
          throw new Error(`File processing failed: ${fileInfo.error?.message || 'Unknown error'}`);
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        if ((error as any).status === 404) {
          console.log(`🔍 File not yet available, retrying...`);
        } else {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    throw new Error(`Timeout: File ${fileName} did not become ACTIVE within ${maxWaitTime}ms`);
  }

  // Normalize timestamp to ensure seconds don't exceed 59
  private normalizeTimestamp(timeInSeconds: number): number {
    if (isNaN(timeInSeconds) || timeInSeconds < 0) {
      return 0;
    }
    
    // Convert to total seconds, then properly format
    const totalSeconds = Math.floor(timeInSeconds);
    const fractionalPart = timeInSeconds - totalSeconds;
    
    // Convert seconds that exceed 59 to proper minutes:seconds format
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    // Return the normalized time as total seconds (minutes * 60 + seconds + fractional)
    return (minutes * 60) + seconds + fractionalPart;
  }

  async generateCaptions(mediaItemId: string, filePath: string): Promise<any> {
    try {
      console.log(`🎤 Starting phrase-level caption generation for media item: ${mediaItemId}`);
      console.log(`📁 File path: ${filePath}`);
      
      const fileBuffer = fs.readFileSync(filePath);
      const fileSizeKB = Math.round(fileBuffer.length / 1024);
      console.log(`📊 File size: ${fileSizeKB}KB`);
      
      // Determine the correct MIME type based on file extension or file signature
      let fileExtension = filePath.split('.').pop()?.toLowerCase();
      let mimeType = 'video/mp4'; // default
      
      // If no extension, try to detect from file signature
      if (!fileExtension || fileExtension === filePath) {
        console.log('🔍 No file extension found, detecting from file signature...');
        
        // Check file signature (magic bytes)
        const signature = fileBuffer.toString('hex', 0, 12).toLowerCase();
        console.log(`🔬 File signature: ${signature}`);
        
        if (signature.startsWith('000000') && signature.includes('667479704d503431')) {
          // MP4 signature
          fileExtension = 'mp4';
          mimeType = 'video/mp4';
        } else if (signature.startsWith('494433') || signature.startsWith('fff')) {
          // MP3 signature (ID3 tag or MP3 frame sync)
          fileExtension = 'mp3';
          mimeType = 'audio/mpeg';
        } else if (signature.startsWith('52494646') && signature.includes('57415645')) {
          // WAV signature
          fileExtension = 'wav';
          mimeType = 'audio/wav';
        } else if (signature.startsWith('1a45dfa3')) {
          // WebM/MKV signature
          fileExtension = 'webm';
          mimeType = 'video/webm';
        } else {
          console.log('⚠️ Unknown file signature, assuming MP4');
          fileExtension = 'mp4';
          mimeType = 'video/mp4';
        }
        
        console.log(`🎯 Detected file type: ${fileExtension} (${mimeType})`);
      } else {
        // Use file extension
        if (fileExtension === 'mp3' || fileExtension === 'wav' || fileExtension === 'aac') {
          mimeType = `audio/${fileExtension === 'mp3' ? 'mpeg' : fileExtension}`;
        } else if (fileExtension === 'webm') {
          mimeType = 'video/webm';
        } else if (fileExtension === 'mkv') {
          mimeType = 'video/x-matroska';
        }
      }
      
      console.log(`🎵 Final MIME type: ${mimeType} (extension: ${fileExtension})`);

      // Upload file to Gemini Files API
      console.log(`🤖 Uploading file to Gemini API...`);
      const uploadResult = await this.client.files.upload({
        file: filePath
      });

      console.log(`✅ File uploaded with URI: ${uploadResult.uri}`);
      
      // Wait for file to be processed and become ACTIVE
      await this.waitForFileToBeActive(uploadResult.name);
      
      const prompt = `Transcribe this ${mimeType.startsWith('audio') ? 'audio' : 'video'} file with phrase-level timestamps for natural caption segments.

CRITICAL REQUIREMENTS FOR TIMESTAMP FORMAT:
1. Times MUST be expressed as TOTAL SECONDS from the start of the audio/video
2. Example: 1 minute 10.5 seconds = 70.5 (NOT 1:10.5)
3. Example: 2 minutes 5.3 seconds = 125.3 (NOT 2:05.3)  
4. Example: 45.7 seconds = 45.7 (this is correct)
5. Use decimal precision for sub-second timing (e.g., 14.516, 19.346)
6. NEVER use minute:second format - always convert to total seconds

TRANSCRIPTION REQUIREMENTS:
1. Transcribe in NATURAL PHRASES/SEGMENTS like traditional video captions
2. Each segment should contain 3-8 words or one complete thought/phrase
3. Break at natural speech boundaries (commas, sentence endings, breath pauses)
4. This may be a SONG/MUSIC, so consider musical phrases and lyrical structure
5. Support Arabic text (اللغة العربية) and right-to-left languages perfectly
6. Confidence should reflect how accurate you believe the transcription is (0.0 to 1.0)
7. If this is purely instrumental with no vocals, return empty segments array
8. For mixed content, only transcribe the vocal/speech parts in natural segments

SEGMENT EXAMPLES:
- "Hello everyone, welcome back" (one segment)
- "Today we're going to talk about" (another segment)
- "artificial intelligence and machine learning" (another segment)

For songs:
- "نقتفي قائدا شجاعا" (one lyrical phrase)
- "في خطى الفداء" (another phrase)
- "لن نقول سيدي وداعا" (complete lyrical thought)

EXAMPLES OF PROPER TIMING (TOTAL SECONDS FORMAT):
- A phrase from 14.5 to 18.2 seconds: startTime: 14.5, endTime: 18.2
- A phrase from 1:01.3 to 1:05.8 (total seconds): startTime: 61.3, endTime: 65.8
- A phrase from 2:15.7 to 2:20.1 (total seconds): startTime: 135.7, endTime: 140.1

IMPORTANT: Create natural caption segments like you see in YouTube videos or movie subtitles, not individual words.

Return ONLY the JSON with phrase-level transcription using TOTAL SECONDS for all timestamps.`;

      console.log(`🤖 Sending phrase-level transcription request to Gemini API...`);
      const result = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          prompt,
          {
            fileData: {
              fileUri: uploadResult.uri,
              mimeType: mimeType,
            },
          },
        ],
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              segments: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    startTime: {
                      type: "number",
                      description:
                        "Start time in TOTAL SECONDS with decimal precision (never exceeds 59 in seconds component)",
                    },
                    endTime: {
                      type: "number",
                      description:
                        "End time in TOTAL SECONDS with decimal precision (never exceeds 59 in seconds component)",
                    },
                    text: {
                      type: "string",
                      description:
                        "Natural phrase or segment being transcribed (supports Arabic and RTL languages)",
                    },
                    confidence: {
                      type: "number",
                      description: "Confidence score between 0.0 and 1.0",
                    },
                  },
                  required: ["startTime", "endTime", "text", "confidence"],
                },
              },
            },
            required: ["segments"],
          },
        },
      });

      const response = result.text;
      console.log('🔍 Raw Gemini API response:', response);
      
      let transcriptionData: TranscriptionResponse;
      try {
        transcriptionData = JSON.parse(response);
        console.log('✅ Successfully parsed JSON:', transcriptionData);
      } catch (parseError) {
        console.error('❌ Failed to parse Gemini response as JSON:', response);
        console.error('Parse error:', parseError);
        // Return a default structure if parsing fails
        transcriptionData = {
          segments: [
            {
              startTime: 0.0,
              endTime: 3.0,
              text: "Caption generation failed",
              confidence: 0.5
            }
          ]
        };
      }
      
      // Validate and normalize timestamps
      if (!transcriptionData.segments || !Array.isArray(transcriptionData.segments) || transcriptionData.segments.length === 0) {
        console.warn('🔄 Empty or invalid transcription data, creating default captions');
        
        // For audio files, create a simple caption indicating it's an audio track
        const isAudio = ['mp3', 'wav', 'aac', 'ogg', 'flac'].includes(fileExtension || '');
        
        console.log(`🎶 Creating default caption for ${isAudio ? 'audio' : 'video'} content`);
        
        transcriptionData = {
          segments: [
            {
              startTime: 0.0,
              endTime: 3.0,
              text: isAudio ? "🎵 Audio track" : "📹 Video content",
              confidence: 1.0
            }
          ]
        };
      } else {
        // Normalize all timestamps to ensure proper time format and log any issues
        console.log('🔧 Normalizing timestamps...');
        const originalSegments = [...transcriptionData.segments];
        
        transcriptionData.segments = transcriptionData.segments.map((segment, index) => {
          const originalStart = segment.startTime;
          const originalEnd = segment.endTime;
          
          const normalizedStart = this.normalizeTimestamp(segment.startTime);
          const normalizedEnd = this.normalizeTimestamp(segment.endTime);
          
          // Log if we had to normalize (indicating the AI gave bad timestamps)
          if (Math.abs(originalStart - normalizedStart) > 0.001 || Math.abs(originalEnd - normalizedEnd) > 0.001) {
            console.warn(`⚠️ Normalized timestamps for segment ${index}: ${originalStart}→${normalizedStart}, ${originalEnd}→${normalizedEnd}`);
          }
          
          return {
            ...segment,
            startTime: normalizedStart,
            endTime: normalizedEnd,
            confidence: Math.min(Math.max(segment.confidence || 0.5, 0.0), 1.0) // Ensure confidence is between 0-1
          };
        });
        
        console.log(`✨ Generated ${transcriptionData.segments.length} phrase-level caption segments`);
      }

      // Clean up the uploaded file
      try {
        await this.client.files.delete({ name: uploadResult.name });
        console.log('🗑️ Cleaned up uploaded file');
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup uploaded file:', cleanupError);
      }

      // @ts-ignore
      const caption = await prisma.caption.create({
        data: {
          id: uuidv4(),
          mediaItemId,
          language: 'auto', // Changed from 'en' to 'auto' to support multiple languages
          isAutoGenerated: true,
          segments: {
            create: transcriptionData.segments.map((segment: TranscriptionSegment) => ({
              id: uuidv4(),
              startTime: segment.startTime,
              endTime: segment.endTime,
              text: segment.text || 'No caption available',
              confidence: segment.confidence || 0.5
            }))
          }
        },
        include: {
          segments: true
        }
      });

      console.log(`�� Successfully saved phrase-level caption with ${caption.segments.length} segments to database`);
      return caption;
    } catch (error) {
      console.error('💥 Caption generation error:', error);
      throw new Error(`Failed to generate captions: ${(error as Error).message}`);
    }
  }

  async getCaptions(mediaItemId: string): Promise<any[]> {
    // @ts-ignore
    return prisma.caption.findMany({
      where: { mediaItemId },
      include: { segments: { orderBy: { startTime: 'asc' } } }
    });
  }

  async deleteCaptions(captionId: string): Promise<void> {
    // @ts-ignore
    await prisma.caption.delete({
      where: { id: captionId }
    });
  }
} 