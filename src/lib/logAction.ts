import { supabase } from './supabase';

export async function logAction(
  adminId: string | undefined,
  adminName: string | undefined,
  action: string,
  entity: string,
  details?: object
) {
  if (!adminId) return;
  await supabase.from('audit_logs').insert({
    admin_id: adminId,
    admin_name: adminName || '—',
    action,
    entity,
    details: details || null,
  });
}
