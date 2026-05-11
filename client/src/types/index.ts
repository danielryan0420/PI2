export type Role = 'counter' | 'office' | 'admin';

export interface User {
  id: number;
  username: string;
  role: Role;
  created_at: string;
}

export interface InventorySession {
  id: number;
  name: string;
  status: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
}

export interface SlocConfig {
  sloc: string;
  description: string | null;
  wm_enabled: number;
  im_enabled: number;
}

export interface Count {
  id: number;
  session_id: number;
  username: string;
  material_number: string;
  material_description: string | null;
  quantity: number;
  sloc: string;
  wm_bin: string | null;
  zbin: string | null;
  status: 'pending' | 'verified' | 'flagged';
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: number;
  count_id: number;
  filename: string;
  original_name: string | null;
  uploaded_at: string;
}

export interface Message {
  id: number;
  count_id: number | null;
  session_id: number;
  sender: string;
  role: 'counter' | 'office';
  body: string;
  sent_at: string;
  // enriched fields from office view
  material_number?: string | null;
  sloc?: string | null;
  counter_username?: string | null;
}

export interface AuditEntry {
  id: number;
  count_id: number;
  editor_username: string;
  event_type: 'create' | 'edit' | 'verify' | 'flag' | 'reopen';
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  created_at: string;
  material_number: string;
  sloc: string;
}

export interface SlocBreakdown {
  sloc: string;
  total: number;
  pending: number;
  verified: number;
  flagged: number;
}

export interface CounterActivity {
  username: string;
  total: number;
  pending: number;
  verified: number;
  flagged: number;
  first_count: string;
  last_count: string;
}

export interface CountTrend {
  hour: string;
  count: number;
}

export interface DashboardStats {
  session_id: number;
  totals: { total: number; pending: number; verified: number; flagged: number };
  first_pass_yield: number | null;
  first_pass_count: number;
  snapshot_loaded: boolean;
  snapshot_total: number;
  snapshot_counted: number;
  unread_messages: number;
  sloc_breakdown: SlocBreakdown[];
  counter_activity: CounterActivity[];
  count_trend: CountTrend[];
}

export interface MaterialStatus {
  material_number: string;
  description: string | null;
  sloc: string;
  total_value: number | null;
  sap_quantity: number;
  counted_qty: number;
  count_status: string | null;
  submission_count: number;
  variance: number;
  derived_status: 'not_counted' | 'pending' | 'verified' | 'flagged' | 'variance';
}

export interface VarianceRow {
  sloc: string;
  sap_total: number;
  counted_total: number;
  material_count: number;
  counted_materials: number;
}

export interface WmBin {
  id: number;
  bin: string;
  storage_type: '100' | '200';
  sloc: string;
  description: string | null;
  material_count: number;
  created_at: string;
}

export interface WmBinMaterial {
  id: number;
  bin_id: number;
  material_number: string;
  material_description: string | null;
  created_at: string;
}

export interface HighValueItem {
  material_number: string;
  description: string | null;
  total_value: number | null;
  submission_count: number;
  latest_status: string | null;
}

export interface MessageThread {
  id: number;
  session_id: number;
  count_id: number | null;
  title: string;
  created_by: string;
  created_by_role: Role;
  answered: boolean;
  answered_by: string | null;
  answered_at: string | null;
  created_at: string;
  message_count?: number;
  unread_count?: number;
}

export interface Notification {
  id: number;
  user_id: number;
  thread_id: number;
  type: 'new_question' | 'new_answer' | 'thread_answered';
  read_at: string | null;
  created_at: string;
}
