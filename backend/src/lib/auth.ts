import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import prisma from './database';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export interface GoogleTokenPayload {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface JWTPayload {
  uid: string;
  email: string;
  displayName?: string;
  iat: number;
  exp: number;
}

export const verifyGoogleToken = async (token: string): Promise<GoogleTokenPayload> => {
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid token payload');
    }
    
    return {
      sub: payload.sub,
      email: payload.email!,
      name: payload.name,
      picture: payload.picture,
    };
  } catch (error) {
    throw new Error('Invalid Google token');
  }
};

export const generateJWT = (payload: Omit<JWTPayload, 'iat' | 'exp'>): string => {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '7d',
  });
};

export const verifyJWT = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid JWT token');
  }
};

export const findOrCreateUser = async (googlePayload: GoogleTokenPayload) => {
  let user = await prisma.user.findUnique({
    where: { uid: googlePayload.sub },
  });

  if (!user) {
    // Try to find by email in case user exists with different UID
    const existingUser = await prisma.user.findUnique({
      where: { email: googlePayload.email },
    });

    if (existingUser) {
      // Update existing user with new UID
      user = await prisma.user.update({
        where: { email: googlePayload.email },
        data: {
          uid: googlePayload.sub,
          displayName: googlePayload.name || existingUser.displayName,
          photoURL: googlePayload.picture || existingUser.photoURL,
        },
      });
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          uid: googlePayload.sub,
          email: googlePayload.email,
          displayName: googlePayload.name || '',
          photoURL: googlePayload.picture,
        },
      });
    }
  } else {
    // Update existing user info
    user = await prisma.user.update({
      where: { uid: googlePayload.sub },
      data: {
        displayName: googlePayload.name || user.displayName,
        photoURL: googlePayload.picture || user.photoURL,
      },
    });
  }

  return user;
}; 