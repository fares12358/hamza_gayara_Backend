import { AuditLog } from './audit.model.js';

export function recordAudit({ actor, action, entity, entityId, data }, session) {
  return AuditLog.create([{ user: actor._id, userName: actor.name, action, entity, entityId, data }], { session });
}

export async function listAudit(limit) {
  const [records, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean(),
    AuditLog.estimatedDocumentCount(),
  ]);
  return {
    total,
    records: records.map((r) => ({
      id: String(r._id),
      at: r.createdAt,
      userName: r.userName ?? '',
      action: r.action,
      entity: r.entity,
      data: r.data ?? {},
    })),
  };
}
