/**
 * Base64 an arbitrary byte buffer.
 *
 * `btoa` takes a *binary string*, and `String.fromCharCode(...bytes)` throws
 * ("too many arguments") once the buffer is more than ~64k entries — which any
 * real audio file is. So it is chunked here rather than in the caller.
 *
 * This exists because Google's transcription API has no "fetch this URL for me"
 * mode (Groq does), so the Worker has to hand it the bytes itself.
 */
const CHUNK_SIZE = 0x8000; // 32,768 — comfortably under the argument limit

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
  }
  return btoa(binary);
}

/** Base64 of an ArrayBuffer, without an intermediate copy when possible. */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer));
}
