import db from '../db';
import { recordAudit } from './auditService';

interface SlocConfig {
  sloc: string;
  wm_enabled: number;
  im_enabled: number;
}

interface SubmitCountParams {
  session_id: number;
  username: string;
  material_number: string;
  quantity: number;
  sloc: string;
  wm_bin?: string;
  zbin?: string;
}

interface EditCountParams {
  id: number;
  editor_username: string;
  changes: Partial<{
    material_number: string;
    quantity: number;
    sloc: string;
    wm_bin: string;
    zbin: string;
  }>;
  reason: string;
}

export function getSlocConfig(sloc: string): SlocConfig | undefined {
  return db.prepare('SELECT * FROM sloc_config WHERE sloc = ?').get(sloc) as SlocConfig | undefined;
}

export function validateSlocFields(
  sloc: string,
  wm_bin: string | undefined,
  zbin: string | undefined
): string | null {
  const config = getSlocConfig(sloc);
  if (!config) return null; // unknown SLOC passes — office configures SLOCs in-app
  if (config.wm_enabled && !wm_bin) return `WM Bin is required for SLOC ${sloc}`;
  if (config.im_enabled && !zbin) return `ZBIN is required for SLOC ${sloc}`;
  return null;
}

export function submitCount(params: SubmitCountParams) {
  const err = validateSlocFields(params.sloc, params.wm_bin, params.zbin);
  if (err) throw new Error(err);

  const result = db
    .prepare(
      `INSERT INTO counts (session_id, username, material_number, quantity, sloc, wm_bin, zbin)
       VALUES (@session_id, @username, @material_number, @quantity, @sloc, @wm_bin, @zbin)`
    )
    .run({
      session_id: params.session_id,
      username: params.username,
      material_number: params.material_number,
      quantity: params.quantity,
      sloc: params.sloc,
      wm_bin: params.wm_bin ?? null,
      zbin: params.zbin ?? null,
    });

  const count_id = result.lastInsertRowid as number;

  recordAudit({
    count_id,
    editor_username: params.username,
    event_type: 'create',
    new_value: params.quantity,
  });

  return db.prepare('SELECT * FROM counts WHERE id = ?').get(count_id);
}

export function editCount(params: EditCountParams) {
  const current = db.prepare('SELECT * FROM counts WHERE id = ?').get(params.id) as
    | Record<string, unknown>
    | undefined;
  if (!current) throw new Error('Count not found');

  const fields = params.changes as Record<string, unknown>;
  const setClauses: string[] = [];
  const values: Record<string, unknown> = { id: params.id };

  const editFn = db.transaction(() => {
    for (const [field, newVal] of Object.entries(fields)) {
      const oldVal = current[field];
      if (newVal === undefined || newVal === oldVal) continue;
      setClauses.push(`${field} = @${field}`);
      values[field] = newVal;
      recordAudit({
        count_id: params.id,
        editor_username: params.editor_username,
        event_type: 'edit',
        field_name: field,
        old_value: oldVal as string | number,
        new_value: newVal as string | number,
        reason: params.reason,
      });
    }

    if (setClauses.length === 0) return db.prepare('SELECT * FROM counts WHERE id = ?').get(params.id);

    setClauses.push("updated_at = datetime('now')");
    db.prepare(`UPDATE counts SET ${setClauses.join(', ')} WHERE id = @id`).run(values);
    return db.prepare('SELECT * FROM counts WHERE id = ?').get(params.id);
  });

  return editFn();
}

export function verifyCount(id: number, verifiedBy: string) {
  const current = db.prepare('SELECT * FROM counts WHERE id = ?').get(id) as
    | { status: string }
    | undefined;
  if (!current) throw new Error('Count not found');

  const fn = db.transaction(() => {
    db.prepare(
      "UPDATE counts SET status = 'verified', updated_at = datetime('now') WHERE id = ?"
    ).run(id);
    recordAudit({
      count_id: id,
      editor_username: verifiedBy,
      event_type: 'verify',
      old_value: current.status,
      new_value: 'verified',
    });
    return db.prepare('SELECT * FROM counts WHERE id = ?').get(id);
  });

  return fn();
}

export function flagCount(id: number, flaggedBy: string, reason: string) {
  const current = db.prepare('SELECT * FROM counts WHERE id = ?').get(id) as
    | { status: string }
    | undefined;
  if (!current) throw new Error('Count not found');

  const fn = db.transaction(() => {
    db.prepare(
      "UPDATE counts SET status = 'flagged', updated_at = datetime('now') WHERE id = ?"
    ).run(id);
    recordAudit({
      count_id: id,
      editor_username: flaggedBy,
      event_type: 'flag',
      old_value: current.status,
      new_value: 'flagged',
      reason,
    });
    return db.prepare('SELECT * FROM counts WHERE id = ?').get(id);
  });

  return fn();
}
