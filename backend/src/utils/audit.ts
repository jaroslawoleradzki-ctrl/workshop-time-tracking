import { Prisma, PrismaClient } from '@prisma/client';
import prisma from './prisma';
import logger from './logger';

type AuditClient = Pick<PrismaClient, 'auditLog'> | Prisma.TransactionClient;

interface AuditOptions {
  client?: AuditClient;
  rethrow?: boolean;
}

export async function logChange(params: {
  tableName: 'work_time_reports' | 'orders' | 'employees';
  recordId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  oldValues?: any;
  newValues?: any;
  userId: string;
}, options: AuditOptions = {}) {
  const client = options.client || prisma;

  try {
    // Helper to serialize any decimal objects or other custom objects to plain JS values
    const serialize = (val: any) => {
      if (!val) return null;
      return JSON.parse(JSON.stringify(val));
    };

    await client.auditLog.create({
      data: {
        tableName: params.tableName,
        recordId: params.recordId,
        action: params.action,
        oldValues: serialize(params.oldValues),
        newValues: serialize(params.newValues),
        userId: params.userId,
      },
    });
  } catch (error) {
    logger.error(error, 'Failed to write audit log');
    if (options.rethrow) {
      throw error;
    }
  }
}
