import crypto from 'crypto';
import type { Request } from 'express';
import type { Queryable } from './db.ts';

/**
 * Records a mutation in audit_logs. Call it with the same client as the mutation
 * (inside the transaction) so the log and the change commit or roll back together.
 */
export async function audit(
  db: Queryable,
  req: Request,
  action: string,
  entity: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
  details = ''
): Promise<void> {
  const user = req.user;
  await db.query(
    `INSERT INTO audit_logs (id, user_name, user_role, action, details, status, ip_address, actor_id, entity, entity_id, before_data, after_data, created_at)
     VALUES ($1, $2, $3, $4, $5, 'success', $6, $7, $8, $9, $10, $11, NOW());`,
    [
      crypto.randomUUID(),
      user?.name ?? 'system',
      user?.role ?? 'system',
      action,
      details,
      req.ip ?? null,
      user?.id ?? null,
      entity,
      entityId,
      before === undefined || before === null ? null : JSON.stringify(before),
      after === undefined || after === null ? null : JSON.stringify(after),
    ]
  );
}
