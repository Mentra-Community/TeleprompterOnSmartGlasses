import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

/**
 * Verify frontend token (similar to SDK's internal verifyFrontendToken)
 * Frontend tokens are in the format: userId:hash
 */
export function verifyFrontendToken(frontendToken: string, apiKey: string): string | null {
  try {
    const tokenParts = frontendToken.split(':');
    if (tokenParts.length === 2) {
      const [tokenUserId, tokenHash] = tokenParts;
      
      // Hash the API key first (matching SDK implementation)
      const hashedApiKey = crypto.createHash('sha256').update(apiKey).digest('hex');
      
      // Create the expected hash using userId + hashedApiKey
      const expectedHash = crypto.createHash('sha256')
        .update(tokenUserId)
        .update(hashedApiKey)
        .digest('hex');
      
      if (tokenHash === expectedHash) {
        console.log('[Auth] Frontend token validated for user:', tokenUserId);
        return tokenUserId;
      }
    }
  } catch (error) {
    console.error('[Auth] Error verifying frontend token:', error);
  }
  return null;
}

/**
 * Extended Request type with authUserId
 */
export interface AuthRequest extends Request {
  userId?: string;
}

/**
 * Authentication middleware factory
 * Creates middleware that verifies the Authorization token
 */
export function createAuthMiddleware(apiKey: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      res.status(401).json({
        success: false,
        message: 'Authorization header is required'
      });
      return;
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : authHeader;

    const userId = verifyFrontendToken(token, apiKey);
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
      return;
    }

    // Attach userId to request for use in route handlers
    req.userId = userId;
    next();
  };
}