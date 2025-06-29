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
  private io?: any; // Socket.IO instance for progress updates

  constructor(io?: any) {
    this.client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!,
    });
    this.io = io;
  }

  // Wait for uploaded file to be in ACTIVE state
  private async waitForFileToBeActive(
    fileName: string,
    userId?: string,
    jobId?: string,
    maxWaitTime: number = 60000
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 2000; // Check every 2 seconds

    console.log(`⏳ Waiting for file ${fileName} to be in ACTIVE state...`);

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const fileInfo = await this.client.files.get({ name: fileName });
        console.log(`📄 File state: ${fileInfo.state}`);

        if (fileInfo.state === "ACTIVE") {
          console.log(
            `✅ File ${fileName} is now ACTIVE and ready for processing`
          );

          // Emit progress update
          if (this.io && userId && jobId) {
            this.io.to(`user:${userId}`).emit("upload-progress", {
              jobId,
              stage: "gemini",
              progress: 50,
              message: "File ready for transcription",
              details: "AI service has processed the file successfully",
            });
          }

          return;
        }

        if (fileInfo.state === "FAILED") {
          throw new Error(
            `File processing failed: ${
              fileInfo.error?.message || "Unknown error"
            }`
          );
        }

        // Wait before next check
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        if ((error as any).status === 404) {
          console.log(`🔍 File not yet available, retrying...`);
        } else {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(
      `Timeout: File ${fileName} did not become ACTIVE within ${maxWaitTime}ms`
    );
  }

  async generateCaptions(
    mediaItemId: string,
    filePath: string,
    userId?: string,
    jobId?: string
  ): Promise<any> {
    try {
      console.log(
        `🎤 Starting phrase-level caption generation for media item: ${mediaItemId}`
      );
      console.log(`📁 File path: ${filePath}`);

      // Emit caption generation start
      if (this.io && userId && jobId) {
        this.io.to(`user:${userId}`).emit("upload-progress", {
          jobId,
          stage: "transcription",
          progress: 0,
          message: "Starting caption generation...",
          details: "Preparing file for AI transcription",
        });
      }

      const fileBuffer = fs.readFileSync(filePath);
      const fileSizeKB = Math.round(fileBuffer.length / 1024);
      console.log(`📊 File size: ${fileSizeKB}KB`);

      // Determine the correct MIME type based on file extension or file signature
      let fileExtension = filePath.split(".").pop()?.toLowerCase();
      let mimeType = "video/mp4"; // default

      // If no extension, try to detect from file signature
      if (!fileExtension || fileExtension === filePath) {
        console.log(
          "🔍 No file extension found, detecting from file signature..."
        );

        // Check file signature (magic bytes)
        const signature = fileBuffer.toString("hex", 0, 12).toLowerCase();
        console.log(`🔬 File signature: ${signature}`);

        if (
          signature.startsWith("000000") &&
          signature.includes("667479704d503431")
        ) {
          // MP4 signature
          fileExtension = "mp4";
          mimeType = "video/mp4";
        } else if (
          signature.startsWith("494433") ||
          signature.startsWith("fff")
        ) {
          // MP3 signature (ID3 tag or MP3 frame sync)
          fileExtension = "mp3";
          mimeType = "audio/mpeg";
        } else if (
          signature.startsWith("52494646") &&
          signature.includes("57415645")
        ) {
          // WAV signature
          fileExtension = "wav";
          mimeType = "audio/wav";
        } else if (signature.startsWith("1a45dfa3")) {
          // WebM/MKV signature
          fileExtension = "webm";
          mimeType = "video/webm";
        } else {
          console.log("⚠️ Unknown file signature, assuming MP4");
          fileExtension = "mp4";
          mimeType = "video/mp4";
        }

        console.log(`🎯 Detected file type: ${fileExtension} (${mimeType})`);
      } else {
        // Use file extension
        if (
          fileExtension === "mp3" ||
          fileExtension === "wav" ||
          fileExtension === "aac"
        ) {
          mimeType = `audio/${
            fileExtension === "mp3" ? "mpeg" : fileExtension
          }`;
        } else if (fileExtension === "webm") {
          mimeType = "video/webm";
        } else if (fileExtension === "mkv") {
          mimeType = "video/x-matroska";
        }
      }

      console.log(
        `🎵 Final MIME type: ${mimeType} (extension: ${fileExtension})`
      );

      // Upload file to Gemini Files API
      console.log(`🤖 Uploading file to Gemini API...`);

      // Emit Gemini upload progress
      if (this.io && userId && jobId) {
        this.io.to(`user:${userId}`).emit("upload-progress", {
          jobId,
          stage: "gemini",
          progress: 20,
          message: "Uploading to AI service...",
          details: "Sending file to Gemini for transcription",
        });
      }

      const uploadResult = await this.client.files.upload({
        file: filePath,
      });

      console.log(`✅ File uploaded with URI: ${uploadResult.uri}`);

      // Emit waiting for file to be active
      if (this.io && userId && jobId) {
        this.io.to(`user:${userId}`).emit("upload-progress", {
          jobId,
          stage: "gemini",
          progress: 40,
          message: "Processing file...",
          details: "Waiting for AI service to process the file",
        });
      }

      // Wait for file to be processed and become ACTIVE
      await this.waitForFileToBeActive(uploadResult.name, userId, jobId);

      const prompt = `Transcribe this ${
        mimeType.startsWith("audio") ? "audio" : "video"
      } file with phrase-level timestamps for natural caption segments.

CRITICAL TIMING FORMAT REQUIREMENTS:
1. ALL times MUST be in TOTAL SECONDS as decimal numbers - this is extremely important!
2. NEVER use MM:SS format in your numbers - always convert to total seconds
3. Time conversion examples:
   - 0:30 → 30.000 (30 seconds)
   - 1:00 → 60.000 (60 seconds, NOT 100)
   - 1:30 → 90.000 (90 seconds, NOT 130)  
   - 1:40 → 100.000 (100 seconds, NOT 140)
   - 2:15 → 135.000 (135 seconds, NOT 215)
   - 3:45 → 225.000 (225 seconds, NOT 345)
4. Formula: (minutes × 60) + seconds = total_seconds
5. Times must be strictly increasing (each endTime > startTime, next startTime >= previous endTime)
6. Use 3 decimal places for precision

WRONG EXAMPLES (DO NOT DO THIS):
❌ 1:40 → 140.000 (This is WRONG!)
❌ 2:30 → 230.000 (This is WRONG!)
❌ 3:15 → 315.000 (This is WRONG!)

CORRECT EXAMPLES:
✅ 1:40 → 100.000 (1×60 + 40 = 100)
✅ 2:30 → 150.000 (2×60 + 30 = 150)  
✅ 3:15 → 195.000 (3×60 + 15 = 195)

TRANSCRIPTION REQUIREMENTS:
1. Break content into natural phrases/segments (3-8 words or one complete thought)
2. Break at natural speech/musical boundaries
3. Support Arabic text (اللغة العربية) and RTL languages
4. Confidence should be between 0.0 and 1.0
5. For instrumental sections, use empty segments array
6. For mixed content, only transcribe vocals/speech

EXAMPLE OF CORRECT TIMING PROGRESSION:
{
  "segments": [
    {
      "startTime": 0.000,
      "endTime": 4.500,
      "text": "Hello everyone",
      "confidence": 0.950
    },
    {
      "startTime": 4.500,
      "endTime": 8.250,
      "text": "welcome to this video",
      "confidence": 0.920
    },
    {
      "startTime": 57.000,
      "endTime": 62.500,
      "text": "at fifty seven seconds",
      "confidence": 0.900
    },
    {
      "startTime": 98.000,
      "endTime": 102.000,
      "text": "at one minute thirty eight",
      "confidence": 0.890
    }
  ]
}

Return ONLY valid JSON with the exact format shown above. Remember: convert ALL times to total seconds!`;

      console.log(
        `🤖 Sending phrase-level transcription request to Gemini API...`
      );

      // Emit transcription progress
      if (this.io && userId && jobId) {
        this.io.to(`user:${userId}`).emit("upload-progress", {
          jobId,
          stage: "transcription",
          progress: 60,
          message: "Transcribing content...",
          details: "AI is analyzing and transcribing the audio/video",
        });
      }

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
                        "Start time in TOTAL SECONDS (convert MM:SS to total seconds: minutes×60+seconds). Example: 1:40 becomes 100.000, not 140.000",
                      minimum: 0,
                    },
                    endTime: {
                      type: "number",
                      description:
                        "End time in TOTAL SECONDS (convert MM:SS to total seconds: minutes×60+seconds). Example: 1:40 becomes 100.000, not 140.000",
                      minimum: 0,
                    },
                    text: {
                      type: "string",
                      description:
                        "Natural phrase or segment being transcribed (supports Arabic and RTL languages)",
                    },
                    confidence: {
                      type: "number",
                      description: "Confidence score between 0.0 and 1.0",
                      minimum: 0,
                      maximum: 1,
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

      let transcriptionData: TranscriptionResponse;
      try {
        transcriptionData = JSON.parse(response);
      } catch (parseError) {
        console.error("❌ Failed to parse Gemini response as JSON:", response);
        console.error("Parse error:", parseError);
        // Return a default structure if parsing fails
        transcriptionData = {
          segments: [
            {
              startTime: 0.0,
              endTime: 3.0,
              text: "Caption generation failed",
              confidence: 0.5,
            },
          ],
        };
      }

      // Enhanced timestamp validation and normalization
      if (
        !transcriptionData.segments ||
        !Array.isArray(transcriptionData.segments)
      ) {
        console.warn(
          "🔄 Empty or invalid transcription data, creating default captions"
        );

        // For audio files, create a simple caption indicating it's an audio track
        const isAudio = ["mp3", "wav", "aac", "ogg", "flac"].includes(
          fileExtension || ""
        );

        console.log(
          `🎶 Creating default caption for ${
            isAudio ? "audio" : "video"
          } content`
        );

        transcriptionData = {
          segments: [
            {
              startTime: 0.0,
              endTime: 3.0,
              text: isAudio ? "🎵 Audio track" : "📹 Video content",
              confidence: 1.0,
            },
          ],
        };
      } else {
        // Enhanced timestamp validation and correction
        let lastEndTime = 0;
        const validatedSegments: TranscriptionSegment[] = [];

        for (let i = 0; i < transcriptionData.segments.length; i++) {
          const segment = transcriptionData.segments[i];

          if (!segment.text?.trim()) {
            continue; // Skip empty segments
          }

          // Validate and correct timestamps - now with better MM:SS detection
          let startTime = this.validateAndConvertTimestamp(segment.startTime);
          let endTime = this.validateAndConvertTimestamp(segment.endTime);

          // Ensure chronological order
          if (startTime < lastEndTime) {
            console.log(
              `🔧 Adjusting startTime from ${startTime} to ${lastEndTime} (chronological order)`
            );
            startTime = lastEndTime;
          }

          if (endTime <= startTime) {
            endTime = startTime + 1.0; // Minimum 1 second duration
            console.log(
              `🔧 Adjusting endTime to ${endTime} (minimum duration)`
            );
          }

          // Log any corrections made
          if (startTime !== segment.startTime || endTime !== segment.endTime) {
            console.log(
              `🔧 Corrected timestamp: ${segment.startTime} → ${startTime}, ${segment.endTime} → ${endTime}`
            );
          }

          validatedSegments.push({
            startTime: Number(startTime.toFixed(3)),
            endTime: Number(endTime.toFixed(3)),
            text: segment.text,
            confidence: Math.min(Math.max(segment.confidence || 0.5, 0.0), 1.0),
          });

          lastEndTime = endTime;
        }

        transcriptionData.segments = validatedSegments;
        console.log(
          `✨ Generated ${transcriptionData.segments.length} phrase-level caption segments`
        );
      }

      // Clean up the uploaded file
      try {
        await this.client.files.delete({ name: uploadResult.name });
        console.log("🗑️ Cleaned up uploaded file");
      } catch (cleanupError) {
        console.warn("⚠️ Failed to cleanup uploaded file:", cleanupError);
      }

      // @ts-ignore
      const caption = await prisma.caption.create({
        data: {
          id: uuidv4(),
          mediaItemId,
          language: "auto",
          isAutoGenerated: true,
          segments: {
            create: transcriptionData.segments.map(
              (segment: TranscriptionSegment) => ({
                id: uuidv4(),
                startTime: segment.startTime,
                endTime: segment.endTime,
                text: segment.text || "No caption available",
                confidence: segment.confidence || 0.5,
              })
            ),
          },
        },
        include: {
          segments: true,
        },
      });

      console.log(
        `💾 Successfully saved phrase-level caption with ${caption.segments.length} segments to database`
      );

      // Emit completion
      if (this.io && userId && jobId) {
        this.io.to(`user:${userId}`).emit("upload-progress", {
          jobId,
          stage: "transcription",
          progress: 100,
          message: "Caption generation complete!",
          details: `Generated ${caption.segments.length} caption segments`,
        });
      }

      return caption;
    } catch (error) {
      console.error("💥 Caption generation error:", error);

      // Emit error
      if (this.io && userId && jobId) {
        this.io.to(`user:${userId}`).emit("upload-progress", {
          jobId,
          stage: "transcription",
          progress: 0,
          message: "Caption generation failed",
          details: (error as Error).message,
        });
      }

      throw new Error(
        `Failed to generate captions: ${(error as Error).message}`
      );
    }
  }

  // Enhanced timestamp validation method
  private validateAndConvertTimestamp(timestamp: number): number {
    // Ensure it's a valid number
    if (typeof timestamp !== "number" || isNaN(timestamp) || timestamp < 0) {
      return 0;
    }

    // Check for common MM:SS misinterpretation patterns
    // Pattern 1: 140 instead of 100 (1:40)
    if (timestamp >= 100 && timestamp < 1000) {
      const timestampStr = timestamp.toString();
      const parts = timestampStr.split(".");
      const wholePart = parts[0];
      const decimalPart = parts[1] || "000";

      // Check if this looks like MM + SS concatenated
      if (wholePart.length >= 3) {
        // Extract potential minutes and seconds
        const potentialMinutesStr = wholePart.slice(0, -2);
        const potentialSecondsStr = wholePart.slice(-2);
        const potentialMinutes = parseInt(potentialMinutesStr);
        const potentialSeconds = parseInt(potentialSecondsStr);

        // If seconds part is < 60, this is likely a MM:SS concatenation error
        if (potentialSeconds < 60 && potentialMinutes < 60) {
          const correctedTimestamp =
            potentialMinutes * 60 +
            potentialSeconds +
            parseFloat("0." + decimalPart);
          return correctedTimestamp;
        }
      }
    }

    // Pattern 2: Very large numbers that might be milliseconds or other formats
    if (timestamp > 10000) {
      console.log(
        `⚠️ Suspicious large timestamp: ${timestamp}, capping at 10000`
      );
      return 10000; // Cap at reasonable video length
    }

    // Pattern 3: Detect other potential time format issues
    // Check if timestamp jumps unreasonably (like going from 98 to 140)
    const timestampStr = timestamp.toString();
    if (timestampStr.includes(".") && timestamp > 100) {
      const [wholePart, decimalPart] = timestampStr.split(".");

      // Another check for concatenated format
      if (wholePart.length === 3) {
        const firstDigit = parseInt(wholePart[0]);
        const lastTwoDigits = parseInt(wholePart.slice(1));

        if (firstDigit <= 9 && lastTwoDigits < 60) {
          const correctedTimestamp =
            firstDigit * 60 + lastTwoDigits + parseFloat("0." + decimalPart);
          console.log(
            `🔧 Converting alternative format: ${timestamp} → ${correctedTimestamp}`
          );
          return correctedTimestamp;
        }
      }
    }

    return timestamp;
  }

  async getCaptions(mediaItemId: string): Promise<any[]> {
    // @ts-ignore
    return prisma.caption.findMany({
      where: { mediaItemId },
      include: { segments: { orderBy: { startTime: "asc" } } },
    });
  }

  async deleteCaptions(captionId: string): Promise<void> {
    // @ts-ignore
    await prisma.caption.delete({
      where: { id: captionId },
    });
  }
} 