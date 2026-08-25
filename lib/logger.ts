import { prisma } from './prisma';

export async function logInfo(source: string, message: string, url?: string) {
  try {
    await prisma.systemLog.create({
      data: {
        level: 'INFO',
        source,
        message,
        url,
      },
    });
  } catch (error) {
    console.error('Failed to save INFO log:', error);
  }
}

export async function logWarning(source: string, message: string, url?: string) {
  try {
    await prisma.systemLog.create({
      data: {
        level: 'WARNING',
        source,
        message,
        url,
      },
    });
  } catch (error) {
    console.error('Failed to save WARNING log:', error);
  }
}

export async function logError(source: string, error: any, url?: string) {
  try {
    const message = error instanceof Error ? error.message : (typeof error === 'string' ? error : 'Unknown error');
    const stack = error instanceof Error ? error.stack : null;
    
    await prisma.systemLog.create({
      data: {
        level: 'ERROR',
        source,
        message,
        stack,
        url,
      },
    });
  } catch (err) {
    console.error('Failed to save ERROR log:', err);
  }
}
