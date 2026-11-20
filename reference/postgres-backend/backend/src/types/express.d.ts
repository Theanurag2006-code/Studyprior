import type { User } from '@prisma/client';

declare global {
  namespace Express {
    interface Request { id?: string; auth?: { sessionId: string; csrfToken: string; user: User } }
  }
}
export {};
