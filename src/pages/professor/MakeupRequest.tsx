import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  BookOpen, Clock, MapPin, CalendarDays, CheckCircle,
  AlertCircle, XCircle, Trash2, ChevronDown, ChevronUp
} from 'lucide-react';

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

export default function MakeupRequest() {
  const { user } = useAuth();
  const [professor, setProfessor] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);

  // form state
  const [assignmentId, setAssignmentId] = useState('');
  const [date, setDate] = useState('');
  const [slotId, setSlotId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [freeRooms, setFreeRooms] = useState<any[]>([]);
  const [checkingRooms, setCheckingRooms] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    // بيانات الأستاذ
    const { data: prof } = await supabase
      .from('professors')
      .select('id, last_name, first_name')
      .eq('user_id', user?.id)
      .maybeSingle();
    setProfessor(prof);

    if (!prof?.id) { setLoading(false); return; }

    // مقاييس الأستاذ هذا الموسم
    const { data: ass } = await supabase
      .from('assignments')
      .select(`
        id, teaching_type, section_number, group_number, semester,
        module:modules ( id, name_ar, has_lectures, has_td ),
        level:levels ( id, name_ar, code )
      `)
      .eq('professor_id', prof.id)
      .eq('academic_year', ACADEMIC_YEAR)
      .in('status', ['مؤقت', 'نهائي']);
    setAssignments(ass || []);

    // time_slots النشطة
    const { data: ts } = await supabase
      .from('time_slots')
      .select('id, day, start_time, end_time, slot_number, level_id')
      .eq('academic_year', ACADEMIC_YEAR)
      .eq('is_active', true)
      .order('day').order('start_time');
    setTimeSlots(ts || []);

    // القاعات النشطة
    const { data: rm } = await supabase
      .from('rooms')
      .select('id, name, code, capacity, type')
      .eq('is_active', true)
      .order('name');
    setRooms(rm || []);

    // طلبات الأستاذ
    await loadMyRequests(prof.id);
    setLoading(false);
  }

  async function loadMyRequests(profId: string) {
    const { data } = await supabase
      .from('makeup_requests')
      .select(`
        id, status, requested_date, notes, created_at,
        time_slot:time_slots ( day, start_time, end_time ),
        room:rooms ( name, code ),
        assignment:assignments (
          teaching_type, section_number, group_number,
          module:modules ( name_ar ),
          level:levels ( name_ar, code )
        )
      `)
      .eq('professor_id', profId)
      .eq('academic_year', ACADEMIC_YEAR)
      .order('created_at', { ascending: false });
    setMyRequests(data || []);
  }

  // حساب أدنى تاريخ مسموح (48 ساعة من الآن)
  const minDate = (() => {
    const d = new Date();
    d.setHours(d.getHours() + 48);
    return d.toISOString().slice(0, 10);
  })();

  // جلب القاعات الفارغة عند تغيير التاريخ أو الـ slot
  useEffect(() => {
    if (!date || !slotId) { setFreeRooms([]); setRoomId(''); return; }
    fetchFreeRooms();
  }, [date, slotId]);

  async function fetchFreeRooms() {
    setCheckingRooms(true);
    setRoomId('');
    // القاعات المشغولة في هذا الـ slot وهذا التاريخ
    const { data: busy } = await supabase
      .from('makeup_requests')
      .select('room_id')
      .eq('time_slot_id', slotId)
      .eq('requested_date', date)
      .in('status', ['pending', 'approved']);

    // أيضاً القاعات في schedules الرسمي لهذا الـ slot
    const { data: scheduled } = await supabase
      .from('schedules')
      .select('room_id')
      .eq('time_slot_id', slotId)
      .eq('academic_year', ACADEMIC_YEAR);

    const busyIds = new Set([
      ...(busy || []).map((b: any) => b.room_id),
      ...(scheduled || []).map((s: any) => s.room_id),
    ]);

    setFreeRooms(rooms.filter(r => !busyIds.has(r.id)));
    setCheckingRooms(false);
  }

  async function handleSubmit() {
    if (!assignmentId || !date || !slotId || !roomId) {
      setError('يرجى تعبئة جميع الحقول.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const { error: err } = await supabase.from('makeup_requests').insert({
      professor_id: professor.id,
      assignment_id: assignmentId,
      time_slot_id: slotId,
      room_id: roomId,
      requested_date: date,
      academic_year: ACADEMIC_YEAR,
    });

    if (err) {
      setError('حدث خطأ أثناء الإرسال، يرجى المحاولة مجدداً.');
    } else {
      setSuccess(true);
      setAssignmentId(''); setDate(''); setSlotId(''); setRoomId('');
      setFreeRooms([]);
      setShowForm(false);
      await loadMyRequests(professor.id);
      setTimeout(() => setSuccess(false), 4000);
    }
    setSubmitting(false);
  }

  async function cancelRequest(id: string) {
    await supabase
      .from('makeup_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('status', 'pending');
    await loadMyRequests(professor.id);
  }

  // time_slots مصفاة حسب الـ assignment المختار (نفس level_id)
  const selectedAss = assignments.find(a => a.id === assignmentId);
  const filteredSlots = selectedAss
    ? timeSlots.filter(ts => ts.level_id === selectedAss.level?.id)
    : timeSlots;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[300px]" dir="rtl">
      <div className="w-8 h-8 border-4 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-5" dir="rtl">

      {/* هيدر */}
      <div className="bg-[#1a3a6b] rounded-2xl px-6 py-5 text-white">
        <div className="flex items-center gap-3 mb-1">
          <CalendarDays className="w-5 h-5 text-blue-200" />
          <h1 className="text-base font-bold">طلب حصة تعويضية</h1>
        </div>
        <p className="text-xs text-gray-300">السنة الجامعية {ACADEMIC_YEAR}</p>
      </div>

      {/* نجاح */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          تم إرسال طلبك بنجاح، في انتظار موافقة رئيس القسم.
        </div>
      )}

      {/* زر فتح النموذج */}
      <button
        onClick={() => setShowForm(v => !v)}
        className="w-full flex items-center justify-between bg-white border-2 border-[#1a3a6b]/20 hover:border-[#1a3a6b] rounded-xl px-5 py-4 text-sm font-bold text-[#1a3a6b] transition-all">
        <span>+ طلب حصة تعويضية جديدة</span>
        {showForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* النموذج */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="font-bold text-gray-800 text-sm">تفاصيل الطلب</h2>
          </div>

          <div className="px-5 py-5 space-y-4">

            {/* المقياس */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">المقياس ونوع الحصة</label>
              <select
                value={assignmentId}
                onChange={e => { setAssignmentId(e.target.value); setSlotId(''); setRoomId(''); }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-[#1a3a6b]">
                <option value="">— اختر المقياس —</option>
                {assignments.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.module?.name_ar} — {TYPE_AR[a.teaching_type] || a.teaching_type}
                    {' '}({a.level?.code} — {a.teaching_type === 'td'
                      ? `فوج ${a.group_number}`
                      : `فصل ${a.section_number}`})
                  </option>
                ))}
              </select>
            </div>

            {/* التاريخ */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                تاريخ الحصة التعويضية
                <span className="text-gray-400 font-normal mr-1">(48 ساعة على الأقل من الآن)</span>
              </label>
              <input
                type="date"
                min={minDate}
                value={date}
                onChange={e => { setDate(e.target.value); setSlotId(''); setRoomId(''); }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1a3a6b]"
              />
            </div>

            {/* الفترة الزمنية */}
            {date && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">الفترة الزمنية</label>
                <select
                  value={slotId}
                  onChange={e => setSlotId(e.target.value)}
                  disabled={!assignmentId}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-[#1a3a6b] disabled:opacity-50">
                  <option value="">— اختر الفترة —</option>
                  {filteredSlots.map(ts => (
                    <option key={ts.id} value={ts.id}>
                      {DAYS_AR[ts.day] || ts.day} — {ts.start_time?.slice(0,5)} إلى {ts.end_time?.slice(0,5)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* القاعة */}
            {slotId && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  القاعة المتاحة
                  {checkingRooms && <span className="text-gray-400 font-normal mr-1">جاري التحقق...</span>}
                </label>
                {!checkingRooms && freeRooms.length === 0 ? (
                  <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    لا توجد قاعات متاحة في هذا التوقيت، اختر توقيتاً آخر.
                  </div>
                ) : (
                  <select
                    value={roomId}
                    onChange={e => setRoomId(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-white focus:outline-none focus:border-[#1a3a6b]">
                    <option value="">— اختر القاعة —</option>
                    {freeRooms.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.code}) — سعة {r.capacity}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              يمكنك إلغاء الطلب قبل موافقة رئيس القسم.
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !assignmentId || !date || !slotId || !roomId}
              className="w-full bg-[#1a3a6b] hover:bg-[#0f2347] disabled:bg-gray-300 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold text-sm transition-colors">
              {submitting ? 'جاري الإرسال...' : 'إرسال الطلب'}
            </button>
          </div>
        </div>
      )}

      {/* طلباتي السابقة */}
      {myRequests.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-800 text-sm">طلباتي</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {myRequests.map(req => {
              const st = STATUS_AR[req.status] || { label: req.status, color: 'bg-gray-100 text-gray-500' };
              return (
                <div key={req.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${st.color}`}>{st.label}</span>
                        <span className="text-xs text-gray-400">{new Date(req.created_at).toLocaleDateString('ar-DZ')}</span>
                      </div>
                      <p className="font-medium text-gray-800 text-sm">
                        {req.assignment?.module?.name_ar}
                        <span className="text-gray-400 font-normal mr-1 text-xs">
                          — {TYPE_AR[req.assignment?.teaching_type] || req.assignment?.teaching_type}
                          {req.assignment?.teaching_type === 'td'
                            ? ` (فوج ${req.assignment?.group_number})`
                            : ` (فصل ${req.assignment?.section_number})`}
                        </span>
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />
                          {req.requested_date} — {DAYS_AR[req.time_slot?.day] || req.time_slot?.day}
                          {' '}{req.time_slot?.start_time?.slice(0,5)}–{req.time_slot?.end_time?.slice(0,5)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {req.room?.name} ({req.room?.code})
                        </span>
                      </div>
                      {req.notes && (
                        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mt-1">
                          ملاحظة رئيس القسم: {req.notes}
                        </p>
                      )}
                    </div>
                    {req.status === 'pending' && (
                      <button
                        onClick={() => cancelRequest(req.id)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
                        <Trash2 className="w-3 h-3" />
                        إلغاء
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
