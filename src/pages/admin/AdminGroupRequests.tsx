import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, FileText, User, RefreshCw } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupRequest {
  id: string;
  student_id: string;
  current_section: number;
  current_groupe: number;
  requested_groupe: number;
  reason: string;
  file_url?: string;
  status: 'pending' | 'dept_approved' | 'approved' | 'rejected';
  dept_head_note?: string;
  admin_note?: string;
  created_at: string;
  student?: {
    last_name: string;
    first_name: string;
    mat_etudiant: string;
    specialite: string;
  };
}

interface Props {
  /** role of the logged-in admin: 'dept_head' | 'super_admin' */
  role: 'dept_head' | 'super_admin';
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:       { label: 'قيد الانتظار',      color: 'bg-amber-50 text-amber-700 border-amber-200' },
  dept_approved: { label: 'موافقة رئيس القسم', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  approved:      { label: 'مقبول',              color: 'bg-green-50 text-green-700 border-green-200' },
  rejected:      { label: 'مرفوض',              color: 'bg-red-50 text-red-600 border-red-200' },
};

// ─── Single request card ───────────────────────────────────────────────────────

function RequestCard({ req, role, onRefresh }: { req: GroupRequest; role: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const st = STATUS_LABEL[req.status] ?? STATUS_LABEL.pending;

  async function decide(action: 'approve' | 'reject') {
    setLoading(true);
    let update: Record<string, string> = {};

    if (role === 'dept_head') {
      update = action === 'approve'
        ? { status: 'dept_approved', dept_head_note: note }
        : { status: 'rejected',      dept_head_note: note };
    } else {
      update = action === 'approve'
        ? { status: 'approved', admin_note: note }
        : { status: 'rejected', admin_note: note };
    }

    await supabase.from('group_change_requests').update(update).eq('id', req.id);
    setLoading(false);
    setNote('');
    onRefresh();
  }

  // What this role can act on
  const canAct =
    (role === 'dept_head'   && req.status === 'pending') ||
    (role === 'super_admin' && req.status === 'dept_approved');

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      {/* Header row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="w-9 h-9 rounded-full bg-[#0a1628] flex items-center justify-center text-white font-bold text-sm shrink-0">
          {req.student?.last_name?.[0] ?? '؟'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm truncate">
            {req.student?.last_name} {req.student?.first_name}
          </p>
          <p className="text-xs text-gray-400 truncate">{req.student?.specialite}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${st.color}`}>
            {st.label}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-3">

          {/* Quick info */}
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'المجموعة الحالية', value: `م ${req.current_section}` },
              { label: 'الفوج الحالي',     value: `ف ${req.current_groupe}` },
              { label: 'الفوج المطلوب',    value: `ف ${req.requested_groupe}` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-50 rounded-xl py-2 px-1">
                <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
                <p className="text-sm font-bold text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          {/* Reason */}
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 mb-1">المبرر</p>
            <p className="text-sm text-gray-700 leading-relaxed">{req.reason}</p>
          </div>

          {/* Attached file */}
          {req.file_url && (
            <a
              href={req.file_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-[#1a3a6b] font-medium hover:underline"
            >
              <FileText className="w-4 h-4" />
              عرض المستند المرفق
            </a>
          )}

          {/* Previous notes */}
          {req.dept_head_note && (
            <div className="bg-blue-50 rounded-xl p-3">
              <p className="text-[10px] text-blue-400 mb-1">ملاحظة رئيس القسم</p>
              <p className="text-sm text-blue-800">{req.dept_head_note}</p>
            </div>
          )}
          {req.admin_note && (
            <div className="bg-green-50 rounded-xl p-3">
              <p className="text-[10px] text-green-500 mb-1">ملاحظة الإدارة</p>
              <p className="text-sm text-green-800">{req.admin_note}</p>
            </div>
          )}

          {/* Date */}
          <p className="text-[11px] text-gray-300 text-left">
            {new Date(req.created_at).toLocaleDateString('ar-DZ', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          {/* Action buttons */}
          {canAct && (
            <div className="space-y-2 pt-1">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="ملاحظة (اختياري)..."
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#1a3a6b]"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => decide('approve')}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  {role === 'dept_head' ? 'إحالة للإدارة' : 'قبول نهائي'}
                </button>
                <button
                  onClick={() => decide('reject')}
                  disabled={loading}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  رفض
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function AdminGroupRequests({ role }: Props) {
  const [requests, setRequests] = useState<GroupRequest[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'all' | 'pending' | 'dept_approved' | 'approved' | 'rejected'>('all');

  async function fetchRequests() {
    setLoading(true);
    const { data } = await supabase
      .from('group_change_requests')
      .select(`
        *,
        student:students (last_name, first_name, mat_etudiant, specialite)
      `)
      .order('created_at', { ascending: false });

    setRequests((data as GroupRequest[]) || []);
    setLoading(false);
  }

  useEffect(() => { fetchRequests(); }, []);

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const counts = {
    all:           requests.length,
    pending:       requests.filter(r => r.status === 'pending').length,
    dept_approved: requests.filter(r => r.status === 'dept_approved').length,
    approved:      requests.filter(r => r.status === 'approved').length,
    rejected:      requests.filter(r => r.status === 'rejected').length,
  };

  const filters: { key: typeof filter; label: string }[] = [
    { key: 'all',           label: `الكل (${counts.all})` },
    { key: 'pending',       label: `انتظار (${counts.pending})` },
    { key: 'dept_approved', label: `إحالة (${counts.dept_approved})` },
    { key: 'approved',      label: `مقبول (${counts.approved})` },
    { key: 'rejected',      label: `مرفوض (${counts.rejected})` },
  ];

  return (
    <div dir="rtl" className="space-y-4">

      {/* Title + refresh */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">طلبات تغيير الأفواج</h2>
        <button
          onClick={fetchRequests}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl px-3 py-1.5 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          تحديث
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              filter === key
                ? 'bg-[#0a1628] text-white border-[#0a1628]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <Clock className="w-8 h-8 mx-auto mb-3 animate-pulse opacity-40" />
          <p className="text-sm">جارٍ التحميل...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-300">
          <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">لا توجد طلبات</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => (
            <RequestCard key={req.id} req={req} role={role} onRefresh={fetchRequests} />
          ))}
        </div>
      )}
    </div>
  );
}
