import prisma from './prisma';

export async function logChange(params: {
  tableName: 'work_time_reports' | 'orders' | 'employees';
  recordId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  oldValues?: any;
  newValues?: any;
  userId: string;
}) {
  try {
    // Helper to serialize any decimal objects or other custom objects to plain JS values
    const serialize = (val: any) => {
      if (!val) return null;
      return JSON.parse(JSON.stringify(val));
    };

    await prisma.auditLog.create({
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
    console.error('Failed to write audit log:', error);
  }
}
