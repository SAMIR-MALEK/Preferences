import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  BookOpen, Clock, MapPin, User, LogOut, AlertCircle,
  CheckCircle, XCircle, Upload, Send, ChevronDown, ChevronUp,
  Calendar, Users, FileText, Bell
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string;
  mat_bac: string;
  annee_bac: number | null;
  mat_etudiant: string;
  sit_ins: string | null;
  specialite: string;
  phone: string;
  last_name: string;
  first_name: string;
  section: number | null;
  groupe: number | null;
}

interface ScheduleEntry {
  id: string;
  day: string;
  start_time: string;
  end_time: string;
  slot_number: number;
  module_name: string;
  professor_name: string;
  room_name: string;
  teaching_type: string; // 'lecture' | 'td'
  custom_module?: string;
  custom_professor?: string;
}

interface GroupChangeRequest {
  id: string;
  current_section: number;
  current_groupe: number;
  requested_groupe: number;
  reason: string;
  status: string;
  created_at: string;
  dept_head_note?: string;
  admin_note?: string;
}

// ─── Day order ────────────────────────────────────────────────────────────────

const DAY_ORDER: Record<string, number> = {
  'السبت': 0, 'الأحد': 1, 'الاثنين': 2, 'الثلاثاء': 3,
  'الأربعاء': 4, 'الخميس': 5, 'الجمعة': 6,
  'saturday': 0, 'sunday': 1, 'monday': 2, 'tuesday': 3,
  'wednesday': 4, 'thursday': 5, 'friday': 6,
};

const TYPE_LABEL: Record<string, string> = {
  'محاضرة': 'محاضرة',
  'أعمال موجهة': 'أعمال موجهة',
  'أعمال تطبيقية': 'أعمال تطبيقية',
};

const TYPE_COLOR: Record<string, string> = {
  'محاضرة': 'bg-blue-50 text-blue-700 border-blue-200',
  'أعمال موجهة': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'أعمال تطبيقية': 'bg-purple-50 text-purple-700 border-purple-200',
};

// ─── Login Screen ─────────────────────────────────────────────────────────────

function LoginScreen({ onLogin }: { onLogin: (s: Student) => void }) {
  const [matBac, setMatBac] = useState('');
  const [anneeBac, setAnneeBac] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!matBac.trim() || !anneeBac.trim()) {
      setError('يرجى إدخال رقم البكالوريا وسنتها');
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: err } = await supabase
      .from('students')
      .select('*')
      .eq('mat_bac', matBac.trim())
      .eq('annee_bac', Number(anneeBac.trim()))
      .maybeSingle();
    setLoading(false);
    if (err || !data) {
      setError('رقم البكالوريا أو السنة غير صحيح');
      return;
    }
    onLogin(data as Student);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" dir="rtl"
      style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f2040 50%, #0a1628 100%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo + Title — same as LoginPage */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ backgroundColor: '#c9a227' }}>
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0112 20.055a11.952 11.952 0 01-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">المنصة البيداغوجية</h1>
          <p style={{ color: '#c9a227' }} className="text-sm font-medium">كلية الحقوق والعلوم السياسية</p>
          <p className="text-white/50 text-xs mt-1">جامعة برج بوعريريج — الموسم الجامعي 2026/2027</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-7 shadow-2xl" style={{ backgroundColor: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="flex items-center justify-center gap-2 mb-6">
            <BookOpen className="w-5 h-5" style={{ color: '#c9a227' }} />
            <h2 className="text-lg font-bold text-white">فضاء الطالب</h2>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1.5 text-right">سنة البكالوريا</label>
              <input
                value={anneeBac}
                onChange={e => setAnneeBac(e.target.value)}
                placeholder="مثال: 2023"
                type="number"
                className="w-full rounded-xl px-4 py-3 text-sm text-right focus:outline-none focus:ring-2"
                style={{ backgroundColor: 'rgba(255,255,255,0.92)', color: '#1a1a2e' }}
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1.5 text-right">رقم البكالوريا</label>
              <input
                value={matBac}
                onChange={e => setMatBac(e.target.value)}
                placeholder="أدخل رقم البكالوريا"
                className="w-full rounded-xl px-4 py-3 text-sm text-right focus:outline-none focus:ring-2"
                style={{ backgroundColor: 'rgba(255,255,255,0.92)', color: '#1a1a2e' }}
              />
            </div>

            {error && (
              <div className="flex items-center justify-end gap-2 rounded-xl px-4 py-3 text-sm"
                style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}>
                {error}
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 mt-2"
              style={{ backgroundColor: '#c9a227', color: '#fff' }}
            >
              {loading ? 'جارٍ التحقق...' : 'دخول'}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-white/10 flex items-start justify-end gap-2">
            <p className="text-xs text-white/40 text-right leading-relaxed">
              بيانات الدخول هي رقم البكالوريا وسنة الحصول عليها.
              للمساعدة، تواصل مع{' '}
              <span style={{ color: '#c9a227' }}>نيابة العمادة المكلفة بالبيداغوجيا</span>
            </p>
            <BookOpen className="w-4 h-4 text-white/30 flex-shrink-0 mt-0.5" />
          </div>
        </div>

        <p className="text-center text-white/25 text-xs mt-6">
          تحت إشراف نائب العميد د. عشاش حمزة
        </p>
      </div>
    </div>
  );
}

// ─── Status Banner ────────────────────────────────────────────────────────────

function StatusBanner({ sit_ins }: { sit_ins: string | null }) {
  if (sit_ins === 'Validée') return null;
  if (sit_ins === 'Générée') return (
    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
      <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-bold text-amber-800 text-sm">يرجى دفع حقوق التسجيل</p>
        <p className="text-amber-700 text-xs mt-0.5">لم يتم تفعيل حسابك بعد. توجّه إلى مصلحة المالية لإتمام عملية الدفع.</p>
      </div>
    </div>
  );
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
      <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-bold text-red-800 text-sm">يرجى التواصل مع إدارة الكلية</p>
        <p className="text-red-700 text-xs mt-0.5">وضعيتك تستوجب تسوية إدارية قبل تفعيل الحساب. اتصل بالأمانة.</p>
      </div>
    </div>
  );
}

// ─── Schedule Table ───────────────────────────────────────────────────────────

function ScheduleView({ schedule }: { schedule: ScheduleEntry[] }) {
  if (schedule.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">لا يوجد توقيت مسجّل حالياً</p>
      </div>
    );
  }

  // Group by day
  const byDay: Record<string, ScheduleEntry[]> = {};
  for (const e of schedule) {
    if (!byDay[e.day]) byDay[e.day] = [];
    byDay[e.day].push(e);
  }
  const days = Object.keys(byDay).sort((a, b) => (DAY_ORDER[a.toLowerCase()] ?? 9) - (DAY_ORDER[b.toLowerCase()] ?? 9));

  return (
    <div className="space-y-4">
      {days.map(day => (
        <div key={day}>
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2 px-1">{day}</h3>
          <div className="space-y-2">
            {byDay[day]
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map(entry => {
                const modName = entry.custom_module || entry.module_name;
                const profName = entry.custom_professor || entry.professor_name;
                const typeKey = entry.teaching_type || '';
                return (
                  <div key={entry.id} className="bg-white border border-gray-100 rounded-xl p-4 flex items-start gap-4 shadow-sm">
                    {/* Time */}
                    <div className="text-center min-w-[60px]">
                      <p className="text-sm font-bold text-[#1a3a6b]">{entry.start_time?.slice(0, 5)}</p>
                      <p className="text-xs text-gray-400">{entry.end_time?.slice(0, 5)}</p>
                    </div>
                    {/* Divider */}
                    <div className="w-px bg-gray-100 self-stretch" />
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="font-semibold text-gray-800 text-sm">{modName}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TYPE_COLOR[typeKey] || 'bg-gray-50 text-gray-600 border-gray-200'}`}>
                          {TYPE_LABEL[typeKey] || entry.teaching_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {profName && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <User className="w-3 h-3" /> {profName}
                          </span>
                        )}
                        {entry.room_name && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="w-3 h-3" /> {entry.room_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Group Change Request ─────────────────────────────────────────────────────

function GroupChangePanel({ student, onSuccess }: { student: Student; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [requestedGroupe, setRequestedGroupe] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [requests, setRequests] = useState<GroupChangeRequest[]>([]);
  const [availableGroupes, setAvailableGroupes] = useState<number[]>([]);
  const [groupsPerSection, setGroupsPerSection] = useState<number>(5);

  useEffect(() => { loadRequests(); loadAvailableGroupes(); }, []);

  async function loadAvailableGroupes() {
    if (!student.section) return;

    // 1. جلب level_id
    const { data: levelData } = await supabase
      .from('levels')
      .select('id')
      .eq('name_ar', student.specialite)
      .maybeSingle();

    if (levelData) {
      // 2. جلب عدد الأفواج من level_semesters
      const { data: semData } = await supabase
        .from('level_semesters')
        .select('num_sections, num_groups')
        .eq('level_id', levelData.id)
        .limit(1)
        .maybeSingle();

      if (semData?.num_sections && semData?.num_groups) {
        // الأفواج تُرقَّم 1..N عالمياً: 4 مجموعات × 5 أفواج = 20 فوج
        const total = semData.num_sections * semData.num_groups;
        const all = Array.from({ length: total }, (_, i) => i + 1);
        setGroupsPerSection(semData.num_groups);
        setAvailableGroupes(all.filter(g => g !== student.groupe));
        return;
      }
    }

    // fallback: الأفواج الموجودة في جدول students على مستوى التخصص كله
    const { data } = await supabase
      .from('students')
      .select('groupe')
      .eq('specialite', student.specialite)
      .not('groupe', 'is', null);
    if (data) {
      const unique = [...new Set(data.map(d => d.groupe as number))].sort((a, b) => a - b);
      setAvailableGroupes(unique.filter(g => g !== student.groupe));
    }
  }

  async function loadRequests() {
    const { data } = await supabase
      .from('group_change_requests')
      .select('*')
      .eq('student_id', student.id)
      .order('created_at', { ascending: false });
    if (data) setRequests(data);
  }

  // الطالب قدّم طلباً من قبل (مهما كانت حالته)
  const hasExistingRequest = requests.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requestedGroupe || !reason.trim()) {
      setMsg('يرجى تحديد الفوج المطلوب وكتابة المبرر');
      return;
    }
    setSubmitting(true);
    setMsg('');

    let attachmentUrl: string | null = null;
    if (file) {
      const ext = file.name.split('.').pop();
      const path = `group-requests/${student.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);
        attachmentUrl = urlData.publicUrl;
      }
    }

    const { error } = await supabase.from('group_change_requests').insert({
      student_id: student.id,
      current_section: student.section,
      current_groupe: student.groupe,
      requested_groupe: Number(requestedGroupe),
      reason: reason.trim(),
      attachment_url: attachmentUrl,
    });

    setSubmitting(false);
    if (error) {
      setMsg('حدث خطأ أثناء الإرسال: ' + error.message);
    } else {
      setMsg('✓ تم إرسال طلبك بنجاح');
      setRequestedGroupe('');
      setReason('');
      setFile(null);
      setOpen(false);
      loadRequests();
      onSuccess();
    }
  }

  const statusLabel: Record<string, { label: string; color: string }> = {
    pending:  { label: 'قيد المراجعة', color: 'bg-yellow-50 text-yellow-700' },
    approved: { label: 'مقبول',        color: 'bg-green-50 text-green-700' },
    rejected: { label: 'مرفوض',        color: 'bg-red-50 text-red-600' },
  };

  return (
    <div className="space-y-4">
      {/* الطلبات السابقة */}
      {requests.length > 0 && (
        <div className="space-y-3">
          {requests.map(r => {
            const st = statusLabel[r.status] || { label: r.status, color: 'bg-gray-50 text-gray-600' };
            return (
              <div key={r.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-medium text-gray-700">
                    طلب تغيير من الفوج {r.current_groupe} إلى الفوج {r.requested_groupe}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{r.reason}</p>
                {r.dept_head_note && <p className="text-xs text-blue-600 mt-1">ملاحظة رئيس القسم: {r.dept_head_note}</p>}
                <p className="text-xs text-gray-400 mt-1">{new Date(r.created_at).toLocaleDateString('ar-DZ')}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* زر الطلب الجديد — يظهر فقط إذا لم يسبق له الطلب */}
      {student.sit_ins === 'Validée' && !hasExistingRequest && (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-2 text-sm font-medium text-[#1a3a6b] hover:text-[#0f2544] transition-colors"
          >
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {open ? 'إلغاء' : 'طلب تغيير الفوج'}
          </button>

          {open && (
            <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">الفوج المطلوب</label>
                {availableGroupes.length === 0 ? (
                  <p className="text-xs text-gray-400">لا توجد أفواج متاحة للتغيير</p>
                ) : (() => {
                  // تجميع الأفواج حسب المجموعة
                  // gpSection = num_groups من level_semesters (مثلاً 5 لأولى ليسانس، 8 لماستر 2 جنائي)
                  const maxGroupe = Math.max(...availableGroupes, student.groupe ?? 0);
                  const gpSection = groupsPerSection > 0 ? groupsPerSection : maxGroupe;
                  const numSections = Math.ceil(maxGroupe / gpSection);
                  const sections: number[][] = [];
                  for (let s = 0; s < numSections; s++) {
                    const groupesInSection = [];
                    for (let g = s * gpSection + 1; g <= (s + 1) * gpSection && g <= maxGroupe; g++) {
                      if (availableGroupes.includes(g)) groupesInSection.push(g);
                    }
                    if (groupesInSection.length > 0) sections.push(groupesInSection);
                  }
                  return (
                    <div className="space-y-3">
                      {sections.map((groupes, idx) => {
                        const sectionNum = Math.ceil(groupes[0] / gpSection);
                        return (
                          <div key={idx}>
                            <p className="text-[10px] text-gray-400 mb-1.5">المجموعة {sectionNum}</p>
                            <div className="flex flex-wrap gap-2">
                              {groupes.map(g => (
                                <button
                                  key={g}
                                  type="button"
                                  onClick={() => setRequestedGroupe(String(g))}
                                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                                    requestedGroupe === String(g)
                                      ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]'
                                      : 'bg-white text-gray-700 border-gray-200 hover:border-[#1a3a6b]'
                                  }`}
                                >
                                  ف {g}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">المبرر</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={3}
                  placeholder="اشرح سبب طلب تغيير الفوج..."
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">مستند مرفق (اختياري)</label>
                <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-xl px-4 py-3 cursor-pointer hover:border-[#1a3a6b] transition-colors">
                  <Upload className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">{file ? file.name : 'اختر ملفاً (PDF، صورة...)'}</span>
                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                    onChange={e => setFile(e.target.files?.[0] || null)} />
                </label>
              </div>
              {msg && (
                <p className={`text-xs px-3 py-2 rounded-lg ${msg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {msg}
                </p>
              )}
              <button type="submit" disabled={submitting}
                className="w-full flex items-center justify-center gap-2 bg-[#1a3a6b] hover:bg-[#0f2544] text-white py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                <Send className="w-4 h-4" />
                {submitting ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main Student Page ────────────────────────────────────────────────────────

export default function StudentPage() {
  const [student, setStudent] = useState<Student | null>(() => {
    try {
      const saved = sessionStorage.getItem('student_session');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [activeTab, setActiveTab] = useState<'schedule' | 'info' | 'requests'>('schedule');

  function handleLogin(s: Student) {
    try { sessionStorage.setItem('student_session', JSON.stringify(s)); } catch {}
    setStudent(s);
  }

  function handleLogout() {
    try { sessionStorage.removeItem('student_session'); } catch {}
    setStudent(null);
  }

  useEffect(() => {
    if (student) loadSchedule();
  }, [student]);

  async function loadSchedule() {
    if (!student) return;
    setLoadingSchedule(true);

    // 1. Find level_id from specialite
    const { data: levelData } = await supabase
      .from('levels')
      .select('id')
      .eq('name_ar', student.specialite)
      .maybeSingle();

    console.log('level found:', levelData, 'for specialite:', student.specialite);
    if (!levelData) { setLoadingSchedule(false); return; }
    const levelId = levelData.id;

    // 2. Find assignments for this student's section/group
    const { data: assignmentsData } = await supabase
      .from('assignments')
      .select('id, teaching_type, module_id, professor_id, section_number, group_number')
      .eq('level_id', levelId)
      .in('status', ['نهائي', 'مؤقت'])
      .or(
        `and(teaching_type.eq.محاضرة,section_number.eq.${student.section ?? 0}),` +
        `and(teaching_type.neq.محاضرة,section_number.eq.${student.section ?? 0},group_number.eq.${student.groupe ?? 0})`
      );

    console.log('assignments found:', assignmentsData?.length, assignmentsData);
    if (!assignmentsData || assignmentsData.length === 0) { setLoadingSchedule(false); return; }

    const assignmentIds = assignmentsData.map(a => a.id);

    // 3. Get schedules for these assignments
    const { data: schedData } = await supabase
      .from('schedules')
      .select(`
        id,
        custom_module,
        custom_professor,
        assignment_id,
        time_slots (id, day, start_time, end_time, slot_number),
        rooms (name)
      `)
      .in('assignment_id', assignmentIds)
      .eq('academic_year', '2026-2027')
      .eq('semester', 1);

    console.log('schedules found:', schedData?.length, schedData);
    if (!schedData) { setLoadingSchedule(false); return; }

    // 4. Get modules and professors
    const modIds = [...new Set(assignmentsData.map(a => a.module_id).filter(Boolean))];
    const profIds = [...new Set(assignmentsData.map(a => a.professor_id).filter(Boolean))];

    const [{ data: modsData }, { data: profsData }] = await Promise.all([
      supabase.from('modules').select('id, name_ar').in('id', modIds),
      supabase.from('professors').select('id, last_name, first_name').in('id', profIds),
    ]);

    const modMap = Object.fromEntries((modsData || []).map(m => [m.id, m.name_ar]));
    const profMap = Object.fromEntries((profsData || []).map(p => [p.id, `${p.last_name} ${p.first_name}`]));
    const assignMap = Object.fromEntries(assignmentsData.map(a => [a.id, a]));

    const entries: ScheduleEntry[] = schedData.map((s: any) => {
      const asgn = assignMap[s.assignment_id];
      const ts = Array.isArray(s.time_slots) ? s.time_slots[0] : s.time_slots;
      const room = Array.isArray(s.rooms) ? s.rooms[0] : s.rooms;
      return {
        id: s.id,
        day: ts?.day || '',
        start_time: ts?.start_time || '',
        end_time: ts?.end_time || '',
        slot_number: ts?.slot_number || 0,
        module_name: modMap[asgn?.module_id] || '',
        professor_name: profMap[asgn?.professor_id] || '',
        room_name: room?.name || '',
        teaching_type: asgn?.teaching_type || '',
        custom_module: s.custom_module || '',
        custom_professor: s.custom_professor || '',
      };
    }).filter(e => e.day);

    setSchedule(entries);
    setLoadingSchedule(false);
  }

  if (!student) return <LoginScreen onLogin={handleLogin} />;

  const isActive = student.sit_ins === 'Validée';

  const tabs = [
    { key: 'schedule', label: 'التوقيت', icon: Clock },
    { key: 'info', label: 'معلوماتي', icon: User },
    { key: 'requests', label: 'طلباتي', icon: FileText },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <div className="text-white px-4 pt-6 pb-16" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #0f2040 50%, #0a1628 100%)' }}>
        <div className="max-w-2xl mx-auto">
          {/* Platform title */}
          <div className="flex items-center justify-center gap-2 mb-5 pb-4 border-b border-white/10">
            <span className="text-xs text-white/40">فضاء الطالب</span>
            <span className="text-white/20">|</span>
            <span className="text-sm font-bold" style={{ color: '#c9a227' }}>المنصة البيداغوجية</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-xs mb-0.5">مرحباً،</p>
              <h1 className="text-xl font-bold">{student.last_name} {student.first_name}</h1>
              <p className="text-white/70 text-sm mt-0.5">{student.specialite}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl text-xs transition-colors"
            >
              <LogOut className="w-4 h-4" />
              خروج
            </button>
          </div>

          {/* Info chips */}
          <div className="flex flex-wrap gap-2 mt-4">
            {student.section && (
              <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-medium">
                المجموعة {student.section}
              </span>
            )}
            {student.groupe && (
              <span className="bg-white/15 px-3 py-1 rounded-full text-xs font-medium">
                الفوج {student.groupe}
              </span>
            )}
            {student.sit_ins && (
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                student.sit_ins === 'Validée' ? 'bg-green-400/20 text-green-200' :
                student.sit_ins === 'Générée' ? 'bg-amber-400/20 text-amber-200' :
                'bg-red-400/20 text-red-200'
              }`}>
                {student.sit_ins === 'Validée' ? 'مسجّل' : student.sit_ins === 'Générée' ? 'معلّق' : 'غير مسجّل'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content card */}
      <div className="max-w-2xl mx-auto px-4 -mt-10">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Status banner */}
          {student.sit_ins !== 'Validée' && (
            <div className="p-4 border-b border-gray-100">
              <StatusBanner sit_ins={student.sit_ins} />
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === key
                    ? 'border-[#1a3a6b] text-[#1a3a6b]'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4">
            {activeTab === 'schedule' && (
              loadingSchedule ? (
                <div className="text-center py-12 text-gray-400">
                  <Clock className="w-8 h-8 mx-auto mb-3 animate-pulse opacity-40" />
                  <p className="text-sm">جارٍ تحميل التوقيت...</p>
                </div>
              ) : (
                <ScheduleView schedule={schedule} />
              )
            )}

            {activeTab === 'info' && (
              <div className="space-y-3">
                {/* Name banner */}
                <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a1628 0%, #1a3a6b 100%)' }}>
                  <div className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
                        style={{ background: '#c9a227', color: '#0a1628' }}>
                        {student.last_name?.[0] || '؟'}
                      </div>
                      <div>
                        <p className="text-white font-bold text-lg leading-tight">{student.last_name} {student.first_name}</p>
                        <p className="text-white/50 text-xs mt-0.5">{student.mat_etudiant || student.mat_bac}</p>
                      </div>
                    </div>
                    {/* Specialite + section/groupe */}
                    <div className="bg-white/10 rounded-xl p-3">
                      <p className="text-white/60 text-[10px] uppercase tracking-wider mb-1">التخصص</p>
                      <p className="text-white font-semibold text-sm">{student.specialite}</p>
                      <div className="flex gap-2 mt-2">
                        {student.section && (
                          <span className="bg-white/15 text-white/80 px-2.5 py-0.5 rounded-full text-xs">
                            مجموعة {student.section}
                          </span>
                        )}
                        {student.groupe && (
                          <span className="bg-white/15 text-white/80 px-2.5 py-0.5 rounded-full text-xs">
                            فوج {student.groupe}
                          </span>
                        )}
                        {student.sit_ins && (
                          <span className={`px-2.5 py-0.5 rounded-full text-xs ${
                            student.sit_ins === 'Validée' ? 'bg-green-400/25 text-green-200' :
                            student.sit_ins === 'Générée' ? 'bg-amber-400/25 text-amber-200' :
                            'bg-red-400/25 text-red-200'
                          }`}>{student.sit_ins === 'Validée' ? 'مسجّل' : student.sit_ins === 'Générée' ? 'معلّق' : 'غير مسجّل'}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Info grid — 2 columns */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'رقم البكالوريا', value: student.mat_bac },
                    { label: 'سنة البكالوريا', value: student.annee_bac?.toString() ?? '—' },
                    { label: 'رقم التسجيل', value: student.mat_etudiant || '—' },
                    { label: 'الهاتف', value: student.phone || '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-[10px] text-gray-400 mb-1">{label}</p>
                      <p className="text-sm font-bold text-gray-800 truncate">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'requests' && (
              <GroupChangePanel student={student} onSuccess={loadSchedule} />
            )}
          </div>
        </div>
      </div>

      <div className="h-8" />
    </div>
  );
}
