import { randomBytes } from 'crypto';

/** Unguessable URL-safe token for a ministry link (~32 chars). */
export function generateToken() {
    return randomBytes(24).toString('base64url');
}
