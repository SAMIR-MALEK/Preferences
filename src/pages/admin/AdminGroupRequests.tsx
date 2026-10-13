import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, FileText, User, RefreshCw, BarChart2 } from 'lucide-react';

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
  role: 'dept_head' | 'super_admin';
  department?: 'عام' | 'خاص';
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:       { label: 'قيد الانتظار', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  dept_approved: { label: 'موافقة القسم', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  approved:      { label: 'مقبول',        color: 'bg-green-50 text-green-700 border-green-200' },
  rejected:      { label: 'مرفوض',        color: 'bg-red-50 text-red-600 border-red-200' },
};

// ─── حوصلة عامة ───────────────────────────────────────────────────────────────

interface SummaryProps {
  requests: GroupRequest[];
  speciality: string | 'all';
}

function GlobalSummary({ requests, speciality }: SummaryProps) {
  const [open, setOpen] = useState(false);

  const scoped = speciality === 'all'
    ? requests
    : requests.filter(r => r.student?.specialite === speciality);

  const pending = scoped.filter(r => r.status === 'pending');

  const groupStats: Record<number, { out: number; in: number }> = {};
  for (const r of pending) {
    if (!groupStats[r.current_groupe])   groupStats[r.current_groupe]   = { out: 0, in: 0 };
    if (!groupStats[r.requested_groupe]) groupStats[r.requested_groupe] = { out: 0, in: 0 };
    groupStats[r.current_groupe].out++;
    groupStats[r.requested_groupe].in++;
  }

  const groups = Object.keys(groupStats).map(Number).sort((a, b) => a - b);

  const rec = pending.length === 0 ? null : groups.every(g => {
    const { out, in: inC } = groupStats[g];
    return Math.abs(out - inC) <= 2;
  });

  if (pending.length === 0) return null;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-right"
        onClick={() => setOpen(v => !v)}
      >
        <BarChart2 className="w-5 h-5 text-[#0a1628] shrink-0" />
        <div className="flex-1">
          <p className="font-bold text-sm text-gray-800">الحوصلة العامة للطلبات المعلقة</p>
          <p className="text-xs text-gray-400">{pending.length} طلب معلق</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-4">
          {rec !== null && (
            <div className={`rounded-xl border px-3 py-2.5 ${rec
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <p className="text-xs font-bold mb-0.5">
                {rec ? '🟢 يمكن قبول جميع الطلبات المعلقة' : '🟡 لا يُنصح بقبول الجميع دفعةً واحدة'}
              </p>
              <p className="text-[11px] opacity-80">
                {rec
                  ? 'التوازن بين الخروج والدخول لكل فوج محقق — قبول الجميع لن يُحدث اختلالاً ملحوظاً.'
                  : 'بعض الأفواج ستعاني من اختلال في الأعداد إذا قُبلت كل الطلبات. راجع تفاصيل كل فوج أدناه.'}
              </p>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
              <thead>
                <tr className="text-[11px] text-gray-400 border-b border-gray-100">
                  <th className="py-1.5 px-2 text-right font-medium">الفوج</th>
                  <th className="py-1.5 px-2 font-medium">طلبات الخروج</th>
                  <th className="py-1.5 px-2 font-medium">طلبات الدخول</th>
                  <th className="py-1.5 px-2 font-medium">التوازن</th>
                </tr>
              </thead>
              <tbody>
                {groups.map(g => {
                  const { out, in: inC } = groupStats[g];
                  const diff = inC - out;
                  const balanced = Math.abs(diff) <= 2;
                  return (
                    <tr key={g} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 px-2 text-right font-bold text-gray-700">ف {g}</td>
                      <td className="py-2 px-2">
                        <span className="inline-block bg-red-50 text-red-600 rounded-lg px-2 py-0.5 text-xs font-bold">{out}</span>
                      </td>
                      <td className="py-2 px-2">
                        <span className="inline-block bg-green-50 text-green-700 rounded-lg px-2 py-0.5 text-xs font-bold">{inC}</span>
                      </td>
                      <td className="py-2 px-2">
                        <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-bold ${
                          balanced ? 'bg-green-50 text-green-700' : diff > 0 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-600'
                        }`}>
                          {diff > 0 ? `+${diff}` : diff === 0 ? '±0' : diff}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-300">التوازن = طلبات الدخول − طلبات الخروج. القيم بين −2 و+2 تُعدّ متوازنة.</p>
        </div>
      )}
    </div>
  );
}

// ─── بطاقة طلب واحد ───────────────────────────────────────────────────────────

interface GroupStats { fromCount: number; toCount: number; avg: number }

function RequestCard({ req, role, onRefresh }: { req: GroupRequest; role: string; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<GroupStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const st = STATUS_LABEL[req.status] ?? STATUS_LABEL.pending;

  async function loadStats() {
    if (stats || statsLoading || !req.student?.specialite) return;
    setStatsLoading(true);
    const { data } = await supabase
      .from('students')
      .select('groupe')
      .eq('specialite', req.student.specialite)
      .not('groupe', 'is', null);

    if (data && data.length > 0) {
      const counts: Record<number, number> = {};
      for (const s of data) counts[s.groupe] = (counts[s.groupe] || 0) + 1;
      const vals = Object.values(counts);
      const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
      setStats({ fromCount: counts[req.current_groupe] ?? 0, toCount: counts[req.requested_groupe] ?? 0, avg });
    }
    setStatsLoading(false);
  }

  function handleExpand() { setExpanded(v => !v); if (!expanded) loadStats(); }

  async function decide(action: 'approve' | 'reject') {
    setLoading(true);
    const update: Record<string, string> = action === 'approve'
      ? { status: 'approved', dept_head_note: note }
      : { status: 'rejected', dept_head_note: note };
    await supabase.from('group_change_requests').update(update).eq('id', req.id);
    setLoading(false); setNote(''); onRefresh();
  }

  const canAct = role === 'dept_head' && req.status === 'pending';

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none" onClick={handleExpand}>
        <div className="w-9 h-9 rounded-full bg-[#0a1628] flex items-center justify-center text-white font-bold text-sm shrink-0">
          {req.student?.last_name?.[0] ?? '؟'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 text-sm truncate">{req.student?.last_name} {req.student?.first_name}</p>
          <p className="text-xs text-gray-400 truncate">{req.student?.specialite}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] px-2.5 py-0.5 rounded-full border font-medium ${st.color}`}>{st.label}</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-50 px-4 pb-4 pt-3 space-y-3">
          {role === 'dept_head' && (
            <div className="space-y-2">
              {statsLoading ? (
                <div className="py-2 text-xs text-gray-300 text-center">جارٍ التحميل...</div>
              ) : stats ? (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: `ف ${req.current_groupe} الأصلي`,    value: stats.fromCount },
                      { label: `ف ${req.requested_groupe} المطلوب`, value: stats.toCount },
                      { label: 'المتوسط',                            value: stats.avg },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-50 rounded-xl py-2.5 px-1">
                        <p className="text-[10px] text-gray-400 mb-0.5 leading-tight">{label}</p>
                        <p className="text-base font-black text-[#0a1628]">{value}</p>
                        <p className="text-[9px] text-gray-300">طالب</p>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const { fromCount, toCount, avg } = stats;
                    const THRESHOLD = 3;
                    const toFull = toCount >= avg, fromOver = fromCount > avg;
                    const close = Math.abs(toCount - avg) <= THRESHOLD && Math.abs(fromCount - avg) <= THRESHOLD;
                    let rec: { icon: string; color: string; title: string; reason: string };
                    if (close) rec = { icon: '🟡', color: 'bg-amber-50 border-amber-200 text-amber-800', title: 'يحتاج تقدير', reason: `الفوج المطلوب (${toCount}) والفوج الأصلي (${fromCount}) قريبان من المتوسط (${avg})، القرار يعود لتقديرك.` };
                    else if (!toFull && fromOver) rec = { icon: '🟢', color: 'bg-green-50 border-green-200 text-green-800', title: 'يُنصح بالقبول', reason: `الفوج الأصلي (${fromCount}) مكتظ فوق المتوسط (${avg})، والفوج المطلوب (${toCount}) لديه مجال.` };
                    else if (toFull && !fromOver) rec = { icon: '🔴', color: 'bg-red-50 border-red-200 text-red-800', title: 'يُنصح بالرفض', reason: `الفوج المطلوب (${toCount}) ممتلئ عند المتوسط (${avg})، والفوج الأصلي (${fromCount}) ليس مكتظاً.` };
                    else if (!toFull && !fromOver) rec = { icon: '🟡', color: 'bg-amber-50 border-amber-200 text-amber-800', title: 'يحتاج تقدير', reason: `كلا الفوجين دون المتوسط (${avg})، لا يوجد مبرر موضوعي واضح، راجع سبب الطلب.` };
                    else rec = { icon: '🔴', color: 'bg-red-50 border-red-200 text-red-800', title: 'يُنصح بالرفض', reason: `الفوج المطلوب (${toCount}) فوق المتوسط (${avg})، النقل سيزيد الاكتظاظ.` };
                    return (
                      <div className={`rounded-xl border px-3 py-2.5 ${rec.color}`}>
                        <p className="text-xs font-bold mb-0.5">{rec.icon} {rec.title}</p>
                        <p className="text-[11px] leading-relaxed opacity-80">{rec.reason}</p>
                      </div>
                    );
                  })()}
                </>
              ) : null}
            </div>
          )}

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

          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 mb-1">المبرر</p>
            <p className="text-sm text-gray-700 leading-relaxed">{req.reason}</p>
          </div>

          {req.file_url && (
            <a href={req.file_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-[#1a3a6b] font-medium hover:underline">
              <FileText className="w-4 h-4" />عرض المستند المرفق
            </a>
          )}

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

          <p className="text-[11px] text-gray-300 text-left">
            {new Date(req.created_at).toLocaleDateString('ar-DZ', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>

          {canAct && (
            <div className="space-y-2 pt-1">
              <textarea value={note} onChange={e => setNote(e.target.value)}
                placeholder="ملاحظة (اختياري)..." rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#1a3a6b]" />
              <div className="flex gap-2">
                <button onClick={() => decide('approve')} disabled={loading}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50">
                  <CheckCircle className="w-4 h-4" />قبول
                </button>
                <button onClick={() => decide('reject')} disabled={loading}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2.5 rounded-xl transition-colors disabled:opacity-50">
                  <XCircle className="w-4 h-4" />رفض
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── المكوّن الرئيسي ───────────────────────────────────────────────────────────

export default function AdminGroupRequests({ role, department }: Props) {
  const [requests, setRequests]             = useState<GroupRequest[]>([]);
  const [loading, setLoading]               = useState(true);
  const [allowedSpecialities, setAllowed]   = useState<string[]>([]);
  const [statusFilter, setStatusFilter]     = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [specialityFilter, setSpeciality]   = useState<string>('all');

  // جلب التخصصات المسموح بها من جدول levels
  useEffect(() => {
    if (role !== 'dept_head' || !department) return;
    supabase
      .from('levels')
      .select('name_ar')
      .eq('department', department)
      .eq('is_active', true)
      .then(({ data }) => {
        setAllowed((data ?? []).map((l: any) => l.name_ar));
      });
  }, [role, department]);

  async function fetchRequests() {
    setLoading(true);
    const { data } = await supabase
      .from('group_change_requests')
      .select(`*, student:students (last_name, first_name, mat_etudiant, specialite)`)
      .order('created_at', { ascending: false });

    let rows = (data as GroupRequest[]) || [];

    // رئيس القسم يرى فقط تخصصات قسمه
    if (role === 'dept_head' && allowedSpecialities.length > 0) {
      rows = rows.filter(r => allowedSpecialities.includes(r.student?.specialite ?? ''));
    }

    setRequests(rows);
    setLoading(false);
  }

  useEffect(() => {
    // انتظر حتى تُحمَّل التخصصات قبل جلب الطلبات
    if (role === 'dept_head' && allowedSpecialities.length === 0 && department) return;
    fetchRequests();
  }, [allowedSpecialities]);

  // التخصصات الموجودة فعلاً في الطلبات
  const availableSpecialities = useMemo(() => {
    const set = new Set<string>();
    for (const r of requests) if (r.student?.specialite) set.add(r.student.specialite);
    return Array.from(set).sort();
  }, [requests]);

  const filtered = useMemo(() => requests.filter(r => {
    const matchStatus     = statusFilter === 'all' || r.status === statusFilter;
    const matchSpeciality = specialityFilter === 'all' || r.student?.specialite === specialityFilter;
    return matchStatus && matchSpeciality;
  }), [requests, statusFilter, specialityFilter]);

  const counts = {
    all:      requests.length,
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  };

  const statusFilters: { key: typeof statusFilter; label: string }[] = [
    { key: 'all',      label: `الكل (${counts.all})` },
    { key: 'pending',  label: `انتظار (${counts.pending})` },
    { key: 'approved', label: `مقبول (${counts.approved})` },
    { key: 'rejected', label: `مرفوض (${counts.rejected})` },
  ];

  const deptLabel = department === 'عام' ? 'قسم القانون العام' : department === 'خاص' ? 'قسم القانون الخاص' : '';

  return (
    <div dir="rtl" className="space-y-4">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">طلبات تغيير الأفواج</h2>
          {deptLabel && <p className="text-xs text-gray-400 mt-0.5">{deptLabel}</p>}
        </div>
        <button onClick={fetchRequests}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl px-3 py-1.5 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />تحديث
        </button>
      </div>

      <GlobalSummary requests={requests} speciality={specialityFilter} />

      {availableSpecialities.length > 1 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[11px] text-gray-400 shrink-0">التخصص:</span>
          <button onClick={() => setSpeciality('all')}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              specialityFilter === 'all' ? 'bg-[#0a1628] text-white border-[#0a1628]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}>الكل</button>
          {availableSpecialities.map(sp => (
            <button key={sp} onClick={() => setSpeciality(sp)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                specialityFilter === sp ? 'bg-[#0a1628] text-white border-[#0a1628]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}>{sp}</button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {statusFilters.map(({ key, label }) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              statusFilter === key ? 'bg-[#0a1628] text-white border-[#0a1628]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}>{label}</button>
        ))}
      </div>

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
