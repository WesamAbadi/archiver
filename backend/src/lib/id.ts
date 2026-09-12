/**
 * ID generation. `nanoid` is the Workers-friendly choice (no crypto.getRandomValues
 * pitfalls, no UUID module quirks); ids are URL-safe and fit the varchar(32) columns.
 */
import { customAlphabet } from 'nanoid';

// Crockford-ish alphabet: no visually ambiguous chars
const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const nanoid = customAlphabet(alphabet, 24);

export function createId(): string {
  return nanoid();
}
