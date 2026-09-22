import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import { X, Save, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const ACADEMIC_YEAR = '2026-2027';
const SLOT_NUMBERS = [1, 2, 3, 4, 5];

interface TimeSlot { id: string; day: string; slot_number: number; start_time: string; end_time: string; }
interface Room { id: string; name: string; code: string; type: string; capacity: number; }
interface Level { id: string; name_ar: string; }
interface Assignment {
  id: string;
  professor_name: string;
  module_name: string;
  level_id: string;
  level_name: string;
  teaching_type: 'محاضرة' | 'أعمال موجهة';
  section_number: number;
  group_number: number | null;
  weekly_sessions: number; // 1 أو 2
}
interface ScheduleEntry {
  id: string;
  assignment_id: string | null;
  room_id: string;
  time_slot_id: string;
  status: string;
  custom_module?: string;
  custom_professor?: string;
  created_by_name?: string;
}
interface ModalState { day: string; slotId: string; slotLabel: string; }

export default function AdminSchedulePage() {
  const { user } = useAuth();
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // فلاتر
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedSection, setSelectedSection] = useState(1);
  const [displayFilter, setDisplayFilter] = useState<'all' | 'lec' | 'td'>('all');
  const [selectedGroup, setSelectedGroup] = useState(0); // 0 = كل الأفواج

  // Modal
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalTab, setModalTab] = useState<'assigned' | 'custom'>('assigned');
  const [modalTypeFilter, setModalTypeFilter] = useState<'all' | 'lec' | 'td'>('all');
  const [modalAssignment, setModalAssignment] = useState('');
  const [modalRoom, setModalRoom] = useState('');
  const [modalSearch, setModalSearch] = useState('');
  const [customModule, setCustomModule] = useState('');
  const [customProfessor, setCustomProfessor] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: ts }, { data: rm }, { data: lv }, { data: asgn }, { data: sched }] = await Promise.all([
      supabase.from('time_slots').select('*').order('slot_number'),
      supabase.from('rooms').select('*').eq('is_active', true).order('name'),
      supabase.from('levels').select('id, name_ar').order('display_order'),
      supabase.from('assignments')
        .select('id, section_number, group_number, teaching_type, weekly_hours, professor:professors(last_name, first_name), module:modules(name_ar, weekly_sessions), level:levels(id, name_ar)')
        .eq('academic_year', ACADEMIC_YEAR).eq('semester', 1).in('status', ['نهائي', 'مؤقت']),
      supabase.from('schedules')
        .select('id, assignment_id, room_id, time_slot_id, status, custom_module, custom_professor, created_by:admins(full_name)')
        .eq('academic_year', ACADEMIC_YEAR).eq('semester', 1),
    ]);

    if (ts) setTimeSlots(ts);
    if (rm) setRooms(rm);
    if (lv) setLevels(lv);
    if (asgn) setAssignments(asgn.map((a: any) => ({
      id: a.id,
      professor_name: a.professor ? a.professor.last_name + ' ' + a.professor.first_name : '—',
      module_name: a.module?.name_ar || '—',
      level_id: (a.level as any)?.id || '',
      level_name: (a.level as any)?.name_ar || '—',
      teaching_type: a.teaching_type,
      section_number: a.section_number,
      group_number: a.group_number,
      weekly_sessions: a.module?.weekly_sessions || 1,
    })));
    if (sched) setSchedule(sched.map((s: any) => ({
      id: s.id, assignment_id: s.assignment_id, room_id: s.room_id,
      time_slot_id: s.time_slot_id, status: s.status,
      custom_module: s.custom_module, custom_professor: s.custom_professor,
      created_by_name: s.created_by?.full_name,
    })));
    setLoading(false);
  }

  // كم مرة جُدِّل إسناد معين
  function scheduledCount(assignmentId: string): number {
    return schedule.filter(s => s.assignment_id === assignmentId).length;
  }

  // هل الإسناد مكتمل التجديل؟
  function isFullyScheduled(a: Assignment): boolean {
    const required = a.teaching_type === 'محاضرة' ? a.weekly_sessions : 1;
    return scheduledCount(a.id) >= required;
  }

  // الإسنادات المتاحة للجدول (لم تكتمل بعد)
  function getAvailableAssignments(slotId: string): Assignment[] {
    return assignments
      .filter(a => {
        if (a.level_id !== selectedLevel) return false;
        if (a.section_number !== selectedSection) return false;
        if (a.teaching_type === 'أعمال موجهة' && selectedGroup > 0 && a.group_number !== selectedGroup) return false;
        if (isFullyScheduled(a)) return false;
        // تحقق تعارض: نفس الأستاذ في نفس الوقت
        const profConflict = schedule.some(s => {
          if (s.time_slot_id !== slotId || !s.assignment_id) return false;
          const other = assignments.find(x => x.id === s.assignment_id);
          return other?.professor_name === a.professor_name;
        });
        if (profConflict) return false;
        return true;
      })
      .filter(a => {
        if (modalTypeFilter === 'lec') return a.teaching_type === 'محاضرة';
        if (modalTypeFilter === 'td') return a.teaching_type === 'أعمال موجهة';
        return true;
      })
      .filter(a => !modalSearch || a.module_name.includes(modalSearch) || a.professor_name.includes(modalSearch))
      .sort((a, b) => {
        // الغير مجدول أولاً ثم الجزئي
        const scoreA = scheduledCount(a.id);
        const scoreB = scheduledCount(b.id);
        return scoreA - scoreB;
      });
  }

  function getSlotId(day: string, slotNum: number): string | null {
    return timeSlots.find(ts => ts.day === day && ts.slot_number === slotNum)?.id || null;
  }

  function getSlotLabel(slotNum: number): string {
    const slot = timeSlots.find(ts => ts.slot_number === slotNum);
    if (!slot) return `${slotNum}`;
    return `${slot.start_time.substring(0,5)}–${slot.end_time.substring(0,5)}`;
  }

  function getCellEntries(day: string, slotNum: number): ScheduleEntry[] {
    const slotId = getSlotId(day, slotNum);
    if (!slotId) return [];
    return schedule.filter(s => {
      if (s.time_slot_id !== slotId) return false;
      if (!selectedLevel) return true;
      if (!s.assignment_id) return true; // custom
      const a = assignments.find(x => x.id === s.assignment_id);
      if (!a || a.level_id !== selectedLevel || a.section_number !== selectedSection) return false;
      if (displayFilter === 'lec' && a.teaching_type !== 'محاضرة') return false;
      if (displayFilter === 'td' && a.teaching_type !== 'أعمال موجهة') return false;
      if (displayFilter === 'td' && selectedGroup > 0 && a.group_number !== selectedGroup) return false;
      return true;
    });
  }

  async function removeEntry(id: string) {
    await supabase.from('schedules').delete().eq('id', id);
    setSchedule(prev => prev.filter(s => s.id !== id));
  }

  async function addEntry() {
    if (!modal) return;
    if (modalTab === 'assigned' && (!modalAssignment || !modalRoom)) {
      setMessage({ type: 'error', text: 'يرجى اختيار الإسناد والقاعة' }); return;
    }
    if (modalTab === 'custom' && (!customModule || !customProfessor || !modalRoom)) {
      setMessage({ type: 'error', text: 'يرجى ملء جميع الحقول' }); return;
    }

    // تحقق تعارض القاعة
    if (schedule.some(s => s.time_slot_id === modal.slotId && s.room_id === modalRoom)) {
      setMessage({ type: 'error', text: 'تعارض — القاعة محجوزة في هذا الوقت' }); return;
    }

    // تحقق: نفس المجموعة لا تحضر محاضرة وTD في نفس الوقت
    if (modalTab === 'assigned') {
      const newA = assignments.find(a => a.id === modalAssignment);
      const conflict = schedule.some(s => {
        if (s.time_slot_id !== modal.slotId || !s.assignment_id) return false;
        const existA = assignments.find(a => a.id === s.assignment_id);
        if (!existA || existA.level_id !== newA?.level_id || existA.section_number !== newA?.section_number) return false;
        // نفس المجموعة → تعارض
        return true;
      });
      if (conflict) {
        setMessage({ type: 'error', text: 'تعارض — هذه المجموعة لديها حصة في نفس الوقت' }); return;
      }
    }

    setSaving(true);
    const insertData: any = {
      room_id: modalRoom, time_slot_id: modal.slotId,
      academic_year: ACADEMIC_YEAR, semester: 1, status: 'مسودة',
      created_by: user?.admin?.id,
    };
    if (modalTab === 'assigned') insertData.assignment_id = modalAssignment;
    else { insertData.assignment_id = null; insertData.custom_module = customModule; insertData.custom_professor = customProfessor; }

    const { data, error } = await supabase.from('schedules').insert(insertData).select().single();
    if (error) { setMessage({ type: 'error', text: error.message }); }
    else {
      setSchedule(prev => [...prev, { ...data, created_by_name: user?.admin?.full_name }]);
      setMessage({ type: 'success', text: 'تمت إضافة الحصة' });
      setModal(null); setModalAssignment(''); setModalRoom('');
      setModalSearch(''); setCustomModule(''); setCustomProfessor('');
    }
    setSaving(false);
  }

  const levelObj = levels.find(l => l.id === selectedLevel);
  // عدد الأفواج للمستوى المختار
  const maxGroups = selectedLevel
    ? Math.max(0, ...assignments.filter(a => a.level_id === selectedLevel && a.teaching_type === 'أعمال موجهة').map(a => a.group_number || 0))
    : 0;

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">التوقيت الأسبوعي — السداسي الأول</h2>
          <p className="text-gray-500 text-sm">{toArabicNum(schedule.length)} حصة مجدولة</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-sm hover:bg-gray-200">
          <RefreshCw className="w-4 h-4" /> تحديث
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
          <button onClick={() => setMessage(null)} className="mr-auto opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* فلاتر */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <select value={selectedLevel} onChange={e => { setSelectedLevel(e.target.value); setSelectedSection(1); setSelectedGroup(0); }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b] bg-white">
            <option value="">— اختر المستوى —</option>
            {levels.map(l => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
          </select>
          {selectedLevel && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">المجموعة:</span>
              {[1,2,3,4].map(s => (
                <button key={s} onClick={() => { setSelectedSection(s); setSelectedGroup(0); }}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${selectedSection === s ? 'bg-[#1a3a6b] text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {toArabicNum(s)}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedLevel && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">عرض:</span>
            {[{v:'all',l:'الكل'},{v:'lec',l:'محاضرات'},{v:'td',l:'TD'}].map(f => (
              <button key={f.v} onClick={() => { setDisplayFilter(f.v as any); setSelectedGroup(0); }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${displayFilter === f.v ? 'bg-[#1a3a6b] text-white' : 'bg-gray-100 text-gray-500'}`}>
                {f.l}
              </button>
            ))}
            {(displayFilter === 'td' || displayFilter === 'all') && maxGroups > 0 && (
              <div className="flex items-center gap-1 mr-2">
                <span className="text-xs text-gray-400">الفوج:</span>
                <button onClick={() => setSelectedGroup(0)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${selectedGroup === 0 ? 'bg-[#c9a227] text-white' : 'bg-gray-100 text-gray-500'}`}>
                  الكل
                </button>
                {Array.from({length: maxGroups}, (_,i) => i+1).map(g => (
                  <button key={g} onClick={() => setSelectedGroup(g)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${selectedGroup === g ? 'bg-[#c9a227] text-white' : 'bg-gray-100 text-gray-500'}`}>
                    {toArabicNum(g)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!selectedLevel && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <p className="text-amber-700 font-medium">اختر المستوى والمجموعة لعرض الجدول</p>
        </div>
      )}

      {selectedLevel && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{minWidth:900}}>
              <thead>
                <tr className="bg-[#1a3a6b] text-white">
                  <th className="px-4 py-3 text-right font-semibold w-20 border-l border-white/10">اليوم</th>
                  {SLOT_NUMBERS.map(n => (
                    <th key={n} className="px-2 py-3 text-center font-semibold border-l border-white/10" style={{minWidth:160}}>
                      {getSlotLabel(n)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, di) => (
                  <tr key={day} className={di%2===0?'bg-gray-50/40':'bg-white'}>
                    <td className="px-3 py-2 font-bold text-[#1a3a6b] text-xs border border-gray-100 whitespace-nowrap align-middle">
                      {day}
                    </td>
                    {SLOT_NUMBERS.map(slotNum => {
                      const slotId = getSlotId(day, slotNum);
                      const entries = getCellEntries(day, slotNum);
                      const MAX_SHOW = 2;
                      const shown = entries.slice(0, MAX_SHOW);
                      const extra = entries.length - MAX_SHOW;
                      return (
                        <td key={slotNum}
                          onClick={() => {
                            if (!slotId) return;
                            setModal({day, slotId, slotLabel: getSlotLabel(slotNum)});
                            setModalTab('assigned'); setModalAssignment(''); setModalRoom('');
                            setModalSearch(''); setModalTypeFilter('all');
                            setCustomModule(''); setCustomProfessor('');
                          }}
                          className="border border-gray-100 p-1 align-top cursor-pointer hover:bg-blue-50/30 transition-colors"
                          style={{minWidth:160, minHeight:90}}>
                          <div className="space-y-1 min-h-[80px]">
                            {shown.map(entry => {
                              const a = assignments.find(x => x.id === entry.assignment_id);
                              const room = rooms.find(r => r.id === entry.room_id);
                              const isCustom = !entry.assignment_id;
                              return (
                                <div key={entry.id} onClick={e => e.stopPropagation()}
                                  className={`rounded-lg p-1.5 relative group text-white ${isCustom ? 'bg-amber-500' : a?.teaching_type === 'محاضرة' ? 'bg-[#1a3a6b]' : 'bg-teal-600'}`}>
                                  <button onClick={e => {e.stopPropagation(); removeEntry(entry.id);}}
                                    className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100 bg-red-500 rounded-full w-4 h-4 flex items-center justify-center">
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                  <p className="font-bold text-[11px] leading-tight ml-4 truncate">
                                    {isCustom ? entry.custom_module : a?.module_name}
                                  </p>
                                  <p className="text-white/75 text-[10px] leading-tight truncate">
                                    {isCustom ? entry.custom_professor : a?.professor_name}
                                  </p>
                                  <div className="flex gap-1 mt-0.5 flex-wrap">
                                    {!isCustom && (
                                      <span className="bg-white/20 px-1 rounded text-[9px]">
                                        {a?.teaching_type === 'محاضرة' ? `م${a.section_number}` : `ف${a?.group_number}`}
                                      </span>
                                    )}
                                    {room && <span className="bg-white/20 px-1 rounded text-[9px]">{room.code || room.name}</span>}
                                    {isCustom && <span className="bg-white/20 px-1 rounded text-[9px]">مقترح</span>}
                                  </div>
                                </div>
                              );
                            })}
                            {extra > 0 && (
                              <div className="text-center text-[10px] text-gray-400 bg-gray-100 rounded-lg py-0.5">
                                +{toArabicNum(extra)} أخرى
                              </div>
                            )}
                            {entries.length === 0 && (
                              <div className="flex items-center justify-center h-[80px] text-gray-200 text-xl hover:text-[#1a3a6b]/20 transition-colors">+</div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-lg font-display">إضافة حصة</h3>
                <p className="text-gray-400 text-sm">{modal.day} — {modal.slotLabel} — {levelObj?.name_ar} م{selectedSection}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            {/* تبويبان */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setModalTab('assigned')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${modalTab==='assigned'?'bg-white text-[#1a3a6b] shadow-sm':'text-gray-500'}`}>
                من الإسناد
              </button>
              <button onClick={() => setModalTab('custom')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${modalTab==='custom'?'bg-white text-amber-600 shadow-sm':'text-gray-500'}`}>
                اقتراح يدوي
              </button>
            </div>

            {modalTab === 'assigned' && (
              <>
                {/* فلتر النوع */}
                <div className="flex gap-1">
                  {[{v:'all',l:'الكل'},{v:'lec',l:'محاضرات'},{v:'td',l:'TD'}].map(f => (
                    <button key={f.v} onClick={() => setModalTypeFilter(f.v as any)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${modalTypeFilter===f.v?'bg-[#1a3a6b] text-white':'bg-gray-100 text-gray-500'}`}>
                      {f.l}
                    </button>
                  ))}
                </div>

                <input type="text" placeholder="ابحث..." value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#1a3a6b]" />

                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {getAvailableAssignments(modal.slotId).length === 0 ? (
                    <p className="text-center text-gray-400 py-6 text-sm">لا توجد إسنادات متاحة</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {getAvailableAssignments(modal.slotId).map(a => {
                        const done = scheduledCount(a.id);
                        const total = a.teaching_type === 'محاضرة' ? a.weekly_sessions : 1;
                        const isLec = a.teaching_type === 'محاضرة';
                        return (
                          <button key={a.id} onClick={() => setModalAssignment(a.id)}
                            className={`w-full text-right px-4 py-3 text-sm transition-all ${modalAssignment===a.id?(isLec?'bg-[#1a3a6b] text-white':'bg-teal-600 text-white'):'hover:bg-gray-50 text-gray-700'}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">{a.module_name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                                done===0?'bg-green-100 text-green-700':
                                done<total?'bg-amber-100 text-amber-700':
                                'bg-gray-100 text-gray-400'
                              } ${modalAssignment===a.id?'!bg-white/20 !text-white':''}`}>
                                {done}/{total}
                              </span>
                            </div>
                            <div className={`text-xs mt-0.5 ${modalAssignment===a.id?'text-white/70':'text-gray-400'}`}>
                              {a.professor_name} —
                              {isLec ? ` م${a.section_number}` : ` ف${a.group_number}`}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {modalTab === 'custom' && (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  اقتراح يدوي — سيُسجَّل باسم: <strong>{user?.admin?.full_name}</strong>
                </div>
                <input placeholder="اسم المقياس..." value={customModule} onChange={e => setCustomModule(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400" />
                <input placeholder="اسم الأستاذ..." value={customProfessor} onChange={e => setCustomProfessor(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400" />
              </div>
            )}

            {/* القاعات */}
            <div>
              <label className="text-xs text-gray-500 mb-2 block font-medium">القاعة</label>
              <div className="flex flex-wrap gap-2">
                {rooms.map(r => (
                  <button key={r.id} onClick={() => setModalRoom(r.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all ${modalRoom===r.id?'bg-[#c9a227] text-white border-[#c9a227]':'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    {r.code || r.name}
                    <span className={`mr-1 text-[10px] ${modalRoom===r.id?'text-white/70':'text-gray-400'}`}>({r.capacity})</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={addEntry} disabled={saving}
              className={`w-full flex items-center justify-center gap-2 text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-40 ${modalTab==='custom'?'bg-amber-500 hover:bg-amber-600':'bg-[#1a3a6b] hover:bg-[#0d2040]'}`}>
              <Save className="w-4 h-4" />
              {saving ? 'جارٍ الحفظ...' : modalTab==='custom' ? 'إضافة اقتراح' : 'إضافة الحصة'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
