/**
 * Stub for @brickops/db package.
 */

// Prisma client stub
export const prisma = {
  project: {
    findUnique: async (args: any) => null as any,
    findFirst: async (args: any) => null as any,
    findMany: async (args?: any) => [] as any[],
    create: async (args: any) => ({} as any),
    update: async (args: any) => ({} as any),
    delete: async (args: any) => ({} as any),
  },
  projectThread: {
    create: async (args: any) => ({} as any),
    findMany: async (args?: any) => [] as any[],
  },
  approval: {
    findUnique: async (args: any) => null as any,
    findMany: async (args?: any) => [] as any[],
    update: async (args: any) => ({} as any),
  },
  run: {
    findUnique: async (args: any) => null as any,
    findMany: async (args?: any) => [] as any[],
  },
  runStep: {
    findMany: async (args?: any) => [] as any[],
  },
  session: {
    findUnique: async (args: any) => null as any,
    findMany: async (args?: any) => [] as any[],
    create: async (args: any) => ({} as any),
  },
  sessionMessage: {
    create: async (args: any) => ({} as any),
    findMany: async (args?: any) => [] as any[],
  },
};

// Service stubs
export class SessionService {
  async getSession(id: string) {
    return null;
  }
  async saveSession(data: any) {
    return data;
  }
}

export class MessageService {
  async getMessages(sessionId: string) {
    return [];
  }
  async addMessage(sessionId: string, message: any) {
    return message;
  }
}
