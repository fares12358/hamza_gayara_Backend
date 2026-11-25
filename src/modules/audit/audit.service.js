import { AuditLog } from './audit.model.js';

export function recordAudit({ actor, action, entity, entityId, data }, session) {
  return AuditLog.create([{ user: actor._id, userName: actor.name, action, entity, entityId, data }], { session });
}
