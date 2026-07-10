import * as crypto from 'crypto';

/**
 * Max failed verification attempts allowed against a single OTP record
 * before it is locked out and the user must request a new one.
 */
export const MAX_OTP_ATTEMPTS = 5;

/**
 * Generates a cryptographically secure 4-digit numeric OTP (0000-9999)
 * @returns 4-digit OTP as string with leading zeros if needed
 */
export function generateOtp(): string {
    const otp = crypto.randomInt(0, 10000).toString();
    return otp.padStart(4, '0');
}

/**
 * Hashes an OTP using SHA-256
 * @param otp - The OTP to hash
 * @returns Hashed OTP
 */
export function hashOtp(otp: string): string {
    return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * Verifies an OTP against a hashed OTP
 * @param otp - The OTP to verify
 * @param hashedOtp - The hashed OTP to compare against
 * @returns true if OTP matches, false otherwise
 */
export function verifyOtp(otp: string, hashedOtp: string): boolean {
    const hashedInput = hashOtp(otp);
    return crypto.timingSafeEqual(
        Buffer.from(hashedInput),
        Buffer.from(hashedOtp)
    );
}

