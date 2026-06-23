"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logChange = logChange;
const prisma_1 = __importDefault(require("./prisma"));
async function logChange(params) {
    try {
        // Helper to serialize any decimal objects or other custom objects to plain JS values
        const serialize = (val) => {
            if (!val)
                return null;
            return JSON.parse(JSON.stringify(val));
        };
        await prisma_1.default.auditLog.create({
            data: {
                tableName: params.tableName,
                recordId: params.recordId,
                action: params.action,
                oldValues: serialize(params.oldValues),
                newValues: serialize(params.newValues),
                userId: params.userId,
            },
        });
    }
    catch (error) {
        console.error('Failed to write audit log:', error);
    }
}
