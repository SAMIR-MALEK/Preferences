import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Shield, Download, RefreshCw, Clock, Database, AlertCircle, CheckCircle } from 'lucide-react';
import { toArabicNum } from '../../lib/utils';

interface AuditLog {
  id: string;
  admin_name: string;
  action: string;
  entity: string;
  details: any;
  created_at: string;
}

interface Backup {
  id: string;
  created_by_name: string;
  label: string;
  created_at: string;
  data: any;
}

const ACTION_LABELS: Record<string, string> = {
  assign: 'إسناد',
  unassign: 'حذف إسناد',
  update_assignment: 'تعديل إسناد',
  publish_results: 'نشر النتائج',
  unpublish_results: 'إخفاء النتائج',
  open_registration: 'فتح التسجيل',
  close_registration: 'إغلاق التسجيل',
  open_appeals: 'فتح الطعون',
  close_appeals: 'إغلاق الطعون',
  reply_appeal: 'الرد على طعن',
  save_settings: 'حفظ الإعدادات',
  backup: 'نسخة احتياطية',
  restore: 'استعادة نسخة',
};

export default function AdminAuditPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<'logs' | 'backups'>('logs');
  const [filterEntity, setFilterEntity] = useState('');
  const [isSuper, setIsSuper] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: logsData }, { data: backupsData }, { data: adminData }] = await Promise.all([
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('backups').select('id, created_by_name, label, created_at').order('created_at', { ascending: false }),
      supabase.from('admins').select('is_super').eq('user_id', user?.id).single(),
    ]);
    if (logsData) setLogs(logsData);
    if (backupsData) setBackups(backupsData);
    if (adminData) setIsSuper(adminData.is_super === true);
    setLoading(false);
  }

  async function createBackup() {
    setCreating(true);
    const [{ data: assignments }, { data: appeals }, { data: settings }, { data: schedules }] = await Promise.all([
      supabase.from('assignments').select('*').eq('academic_year', '2026-2027').eq('semester', 1),
      supabase.from('assignment_appeals').select('*').eq('academic_year', '2026-2027'),
      supabase.from('academic_settings').select('*').eq('academic_year', '2026-2027'),
      supabase.from('schedules').select('*').eq('academic_year', '2026-2027'),
    ]);

    const backupData = { assignments, appeals, settings, schedules, timestamp: new Date().toISOString() };
    const label = `نسخة ${new Date().toLocaleDateString('ar-DZ')} — ${new Date().toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}`;

    const { error } = await supabase.from('backups').insert({
      created_by: user?.admin?.id,
      created_by_name: user?.admin?.full_name,
      label,
      data: backupData,
    });

    if (error) setMessage({ type: 'error', text: 'خطأ في إنشاء النسخة' });
    else { setMessage({ type: 'success', text: '✓ تم إنشاء النسخة الاحتياطية' }); await loadData(); }
    setCreating(false);
  }

  async function restoreBackup(backup: Backup) {
    if (!window.confirm(`تحذير: سيتم استعادة النسخة "${backup.label}" وستُحذف الإسنادات الحالية. هل أنت متأكد؟`)) return;
    setRestoring(true);
    const { assignments, appeals } = backup.data;

    // حذف الحالية وإعادة الاستعادة
    await supabase.from('assignments').delete().eq('academic_year', '2026-2027').eq('semester', 1);
    if (assignments?.length) await supabase.from('assignments').insert(assignments);

    // تسجيل في الـ audit
    await supabase.from('audit_logs').insert({
      admin_id: user?.admin?.id,
      admin_name: user?.admin?.full_name,
      action: 'restore',
      entity: 'backup',
      details: { backup_id: backup.id, label: backup.label },
    });

    setMessage({ type: 'success', text: '✓ تمت الاستعادة بنجاح' });
    setRestoring(false);
  }

  const filtered = logs.filter(l => !filterEntity || l.entity === filterEntity);
  const entities = [...new Set(logs.map(l => l.entity))];

  function formatDetails(log: AuditLog): string {
    const d = log.details;
    if (!d) return '';
    if (log.action === 'assign') return `${d.prof_name} ← ${d.module_name} (${d.teaching_type} ${d.section ? 'م' + d.section : 'ف' + d.group})`;
    if (log.action === 'unassign') return `حُذف: ${d.prof_name} من ${d.module_name}`;
    if (log.action === 'reply_appeal') return `${d.prof_name}: ${d.status} — "${d.reply?.substring(0, 50)}"`;
    return JSON.stringify(d).substring(0, 80);
  }

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">سجل التدقيق والنسخ الاحتياطية</h2>
          <p className="text-gray-500 text-sm">{toArabicNum(logs.length)} عملية مسجّلة</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadData} className="flex items-center gap-2 bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-sm hover:bg-gray-200">
            <RefreshCw className="w-4 h-4" /> تحديث
          </button>
          {isSuper && (
            <button onClick={createBackup} disabled={creating}
              className="flex items-center gap-2 bg-[#1a3a6b] text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-[#0d2040] disabled:opacity-50">
              <Database className="w-4 h-4" /> {creating ? 'جارٍ...' : 'نسخة احتياطية'}
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* تبويبان */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button onClick={() => setTab('logs')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'logs' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500'}`}>
          سجل العمليات
        </button>
        {isSuper && (
          <button onClick={() => setTab('backups')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'backups' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500'}`}>
            النسخ الاحتياطية ({toArabicNum(backups.length)})
          </button>
        )}
      </div>

      {tab === 'logs' && (
        <div className="space-y-3">
          {/* فلتر */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilterEntity('')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${!filterEntity ? 'bg-[#1a3a6b] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
              الكل
            </button>
            {entities.map(e => (
              <button key={e} onClick={() => setFilterEntity(e)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${filterEntity === e ? 'bg-[#1a3a6b] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
                {e}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold">التاريخ والوقت</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold">المسؤول</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold">العملية</th>
                  <th className="text-right px-4 py-3 text-gray-500 font-semibold">التفاصيل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">لا توجد عمليات مسجّلة</td></tr>
                )}
                {filtered.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {new Date(log.created_at).toLocaleDateString('ar-DZ')} {new Date(log.created_at).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-700">{log.admin_name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        log.action.includes('delete') || log.action === 'unassign' ? 'bg-red-100 text-red-700' :
                        log.action.includes('publish') || log.action === 'assign' ? 'bg-green-100 text-green-700' :
                        log.action === 'restore' ? 'bg-purple-100 text-purple-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs truncate">{formatDetails(log)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'backups' && isSuper && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {backups.length === 0 ? (
            <p className="text-center py-10 text-gray-400">لا توجد نسخ احتياطية — أنشئ أولى</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {backups.map(b => (
                <div key={b.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="font-medium text-gray-800">{b.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">بواسطة: {b.created_by_name} — {new Date(b.created_at).toLocaleString('ar-DZ')}</p>
                  </div>
                  <button onClick={() => restoreBackup(b)} disabled={restoring}
                    className="flex items-center gap-2 bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors disabled:opacity-50">
                    <Download className="w-3.5 h-3.5" /> استعادة
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
