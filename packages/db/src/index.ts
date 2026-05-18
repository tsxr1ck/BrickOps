import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
export * from '@prisma/client';

export { MessageService } from './message-service';
export { SessionService } from './session-service';
