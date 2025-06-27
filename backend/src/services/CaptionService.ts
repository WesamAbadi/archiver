import { GoogleGenAI } from '@google/genai';
import prisma from '../lib/database';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

// Define the structured output schema
interface TranscriptionSegment {
  startTime: number;
  text: string;
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

  async generateCaptions(mediaItemId: string, filePath: string): Promise<any> {
    try {
      console.log(`🎤 Starting caption generation for media item: ${mediaItemId}`);
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
      
      const prompt = `Transcribe this ${mimeType.startsWith('audio') ? 'audio' : 'video'} file with accurate timestamps.

Instructions:
- If this is music or instrumental audio, return empty segments array
- If there is spoken content, transcribe it with accurate timestamps
- For mixed content (music + speech), only transcribe the speech parts
- Break speech into natural phrases or sentences
- Use precise timestamps in seconds with decimal places
- Only include startTime (no endTime needed)

Return ONLY the transcription with timestamps.`;

      console.log(`🤖 Sending transcription request to Gemini API...`);
      const result = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          prompt,
          {
            fileData: {
              fileUri: uploadResult.uri,
              mimeType: mimeType
            }
          }
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              segments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    startTime: {
                      type: 'number',
                      description: 'Start time in seconds with decimal precision'
                    },
                    text: {
                      type: 'string',
                      description: 'Transcribed text for this segment'
                    }
                  },
                  required: ['startTime', 'text']
                }
              }
            },
            required: ['segments']
          }
        }
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
              text: "Caption generation failed - could not parse audio"
            }
          ]
        };
      }
      
      // Validate the structure and provide meaningful captions
      if (!transcriptionData.segments || !Array.isArray(transcriptionData.segments) || transcriptionData.segments.length === 0) {
        console.warn('🔄 Empty or invalid transcription data, creating default captions');
        
        // For audio files, create a simple caption indicating it's an audio track
        const isAudio = ['mp3', 'wav', 'aac', 'ogg', 'flac'].includes(fileExtension || '');
        
        console.log(`🎶 Creating default caption for ${isAudio ? 'audio' : 'video'} content`);
        
        transcriptionData = {
          segments: [
            {
              startTime: 0.0,
              text: isAudio ? "🎵 Audio track - No speech detected" : "📹 Video content - No captions available"
            }
          ]
        };
      } else {
        console.log(`✨ Generated ${transcriptionData.segments.length} caption segments`);
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
          language: 'en',
          isAutoGenerated: true,
          segments: {
            create: transcriptionData.segments.map((segment: TranscriptionSegment, index: number) => {
              // Calculate endTime as the startTime of the next segment, or add 5 seconds for the last segment
              const nextSegment = transcriptionData.segments[index + 1];
              const endTime = nextSegment ? nextSegment.startTime : segment.startTime + 5.0;
              
              return {
                id: uuidv4(),
                startTime: segment.startTime || 0,
                endTime: endTime,
                text: segment.text || 'No caption available',
                confidence: 0.95 // Default confidence for structured output
              };
            })
          }
        },
        include: {
          segments: true
        }
      });

      console.log(`💾 Successfully saved caption with ${caption.segments.length} segments to database`);
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