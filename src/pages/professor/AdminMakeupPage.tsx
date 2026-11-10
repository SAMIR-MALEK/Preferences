import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { CalendarDays, MapPin, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

const ACADEMIC_YEAR = '2026-2027';
const DAYS_AR: Record<string, string> = {
  sunday: 'الأحد', monday: 'الاثنين', tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت',
};
const TYPE_AR: Record<string, string> = { lecture: 'محاضرة', td: 'أعمال موجهة' };
const STATUS_AR: Record<string, { label: string; color: string }> = {
  pending:   { label: 'قيد المراجعة', color: 'bg-amber-100 text-amber-700' },
  approved:  { label: 'مقبول',        color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'مرفوض',        color: 'bg-red-100 text-red-700'   },
  cancelled: { label: 'ملغى',         color: 'bg-gray-100 text-gray-500'  },
};

export default function AdminMakeupPage() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  const isDeptHead = user?.admin?.role === 'dept_head';
  const department = user?.admin?.department; // 'عام' | 'خاص'

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    // جلب الطلبات مع العلاقات المباشرة فقط
    const { data: raw } = await supabase
      .from('makeup_requests')
      .select(`
        id, status, requested_date, notes, created_at, reviewed_at,
        assignment_id,
        time_slot:time_slots ( day, start_time, end_time ),
        room:rooms ( name, code, capacity ),
        professor:professors ( last_name, first_name )
      `)
      .eq('academic_year', ACADEMIC_YEAR)
      .order('created_at', { ascending: false });

    if (!raw || raw.length === 0) { setRequests([]); setLoading(false); return; }

    // جلب بيانات الـ assignments بشكل منفصل لتجنب خطأ TypeScript
    const assignmentIds = [...new Set(raw.map((r: any) => r.assignment_id).filter(Boolean))];
    const { data: assignmentsRaw } = await supabase
      .from('assignments')
      .select(`
        id, teaching_type, section_number, group_number,
        module:modules ( name_ar ),
        level:levels ( name_ar, code, department )
      `)
      .in('id', assignmentIds);

    const assignMap: Record<string, any> = {};
    for (const a of (assignmentsRaw as any[]) || []) {
      assignMap[a.id] = {
        ...a,
        module: Array.isArray(a.module) ? a.module[0] : a.module,
        level:  Array.isArray(a.level)  ? a.level[0]  : a.level,
      };
    }

    let list: any[] = (raw as any[]).map(r => ({
      ...r,
      time_slot:  Array.isArray(r.time_slot)  ? r.time_slot[0]  : r.time_slot,
      room:       Array.isArray(r.room)        ? r.room[0]       : r.room,
      professor:  Array.isArray(r.professor)   ? r.professor[0]  : r.professor,
      assignment: assignMap[r.assignment_id] || null,
    }));

    // رئيس القسم يرى فقط مقاييس قسمه
    if (isDeptHead && department) {
      list = list.filter(r => r.assignment?.level?.department === department);
    }

    setRequests(list);
    setLoading(false);
  }

  async function review(id: string, action: 'approved' | 'rejected') {
    setReviewingId(id);
    const { data: adminData } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', user?.id)
      .maybeSingle();

    await supabase
      .from('makeup_requests')
      .update({
        status: action,
        reviewed_by: adminData?.id,
        reviewed_at: new Date().toISOString(),
        notes: notes.trim() || null,
      })
      .eq('id', id);

    setNotes('');
    setOpenNoteId(null);
    setReviewingId(null);
    await load();
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter);
  const counts = {
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
    all:      requests.length,
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[300px]" dir="rtl">
      <div className="w-8 h-8 border-4 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">

      {/* هيدر */}
      <div>
        <h2 className="font-display font-bold text-gray-900 text-xl">الحصص التعويضية</h2>
        <p className="text-gray-500 text-sm">
          {isDeptHead ? `قسم القانون ${department}` : 'جميع الأقسام'} — {ACADEMIC_YEAR}
        </p>
      </div>

      {/* بانر */}
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(['pending', 'approved', 'rejected', 'all'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`text-center rounded-xl p-3 transition-all ${
                filter === s ? 'bg-white/20 ring-2 ring-white/40' : 'bg-white/5 hover:bg-white/10'
              }`}>
              <p className="text-2xl font-display font-bold">{counts[s]}</p>
              <p className="text-xs text-gray-300 mt-0.5">
                {s === 'pending' ? 'قيد المراجعة'
                  : s === 'approved' ? 'مقبولة'
                  : s === 'rejected' ? 'مرفوضة'
                  : 'الكل'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* القائمة */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-10 text-center text-gray-400 text-sm">
          لا توجد طلبات
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const st = STATUS_AR[req.status] || { label: req.status, color: 'bg-gray-100 text-gray-500' };
            const isOpen = openNoteId === req.id;
            return (
              <div key={req.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      {/* رأس البطاقة */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
                        <span className="text-xs text-gray-400">{new Date(req.created_at).toLocaleDateString('ar-DZ')}</span>
                        <span className="text-xs text-gray-300">|</span>
                        <span className="text-xs font-semibold text-[#1a3a6b]">
                          {req.professor?.last_name} {req.professor?.first_name}
                        </span>
                      </div>

                      {/* المقياس */}
                      <p className="font-semibold text-gray-800 text-sm">
                        {req.assignment?.level?.name_ar} — {req.assignment?.module?.name_ar}
                        <span className="text-gray-400 font-normal mr-1 text-xs">
                          ({req.assignment?.teaching_type})
                          {req.assignment?.teaching_type === 'أعمال موجهة'
                            ? ` ف${req.assignment?.group_number}`
                            : ` م${req.assignment?.section_number}`}
                        </span>
                      </p>

                      {/* التفاصيل */}
                      <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {req.requested_date} — {DAYS_AR[req.time_slot?.day] || req.time_slot?.day}
                          {' '}{req.time_slot?.start_time?.slice(0,5)}–{req.time_slot?.end_time?.slice(0,5)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {req.room?.name} ({req.room?.code}) — {req.room?.capacity} مقعد
                        </span>
                      </div>

                      {/* ملاحظة موجودة */}
                      {req.notes && (
                        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                          ملاحظة: {req.notes}
                        </p>
                      )}
                    </div>

                    {/* أزرار */}
                    {req.status === 'pending' && (
                      <button
                        onClick={() => setOpenNoteId(isOpen ? null : req.id)}
                        className="flex items-center gap-1 text-xs text-[#1a3a6b] bg-[#1a3a6b]/10 hover:bg-[#1a3a6b]/20 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        مراجعة
                      </button>
                    )}
                  </div>

                  {/* منطقة المراجعة */}
                  {req.status === 'pending' && isOpen && (
                    <div className="mt-4 border-t border-gray-100 pt-4 space-y-3">
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="ملاحظة اختيارية (ستظهر للأستاذ)"
                        rows={2}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-[#1a3a6b]"
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => review(req.id, 'approved')}
                          disabled={reviewingId === req.id}
                          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors">
                          <CheckCircle className="w-3.5 h-3.5" />
                          موافقة
                        </button>
                        <button
                          onClick={() => review(req.id, 'rejected')}
                          disabled={reviewingId === req.id}
                          className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-bold transition-colors">
                          <XCircle className="w-3.5 h-3.5" />
                          رفض
                        </button>
                        <button
                          onClick={() => { setOpenNoteId(null); setNotes(''); }}
                          className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2 transition-colors">
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
