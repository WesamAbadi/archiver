import { Request, Response, NextFunction } from 'express';
import { verifyJWT, JWTPayload } from '../lib/auth';

export interface AuthenticatedRequest extends Request {
  user: {
    uid: string;
    email?: string;
    displayName?: string;
  };
}

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      res.status(401).json({ 
        success: false, 
        error: 'Access token required' 
      });
      return;
    }

    const decoded = verifyJWT(token);
    (req as AuthenticatedRequest).user = {
      uid: decoded.uid,
      email: decoded.email,
      displayName: decoded.displayName,
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(403).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
};

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = verifyJWT(token);
        (req as any).user = {
          uid: decoded.uid,
          email: decoded.email,
          displayName: decoded.displayName,
        };
      } catch (error) {
        // Token is invalid, but that's okay for optional auth
        console.log('Optional auth: Invalid token provided, continuing without user');
      }
    }

    next();
  } catch (error) {
    // For optional auth, we continue even if there's an error
    next();
  }
}; 