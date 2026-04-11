import db from '../db';

interface AuditParams {
  count_id: number;
  editor_username: string;
  event_type: 'create' | 'edit' | 'verify' | 'flag' | 'reopen';
  field_name?: string;
  old_value?: string | number | null;
  new_value?: string | number | null;
  reason?: string;
}

const insertAudit = db.prepare(`
  INSERT INTO audit_log (count_id, editor_username, event_type, field_name, old_value, new_value, reason)
  VALUES (@count_id, @editor_username, @event_type, @field_name, @old_value, @new_value, @reason)
`);

export function recordAudit(params: AuditParams) {
  insertAudit.run({
    count_id: params.count_id,
    editor_username: params.editor_username,
    event_type: params.event_type,
    field_name: params.field_name ?? null,
    old_value: params.old_value != null ? String(params.old_value) : null,
    new_value: params.new_value != null ? String(params.new_value) : null,
    reason: params.reason ?? null,
  });
}
