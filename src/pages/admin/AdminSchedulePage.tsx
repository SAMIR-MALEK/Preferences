import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import { X, Save, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const ACADEMIC_YEAR = '2026-2027';
const SLOT_NUMBERS = [1, 2, 3, 4, 5];

interface TimeSlot { id: string; day: string; slot_number: number; start_time: string; end_time: string; }
interface Room { id: string; name: string; type: string; capacity: number; }
interface Level { id: string; name_ar: string; }
interface Assignment {
  id: string;
  professor_name: string;
  module_name: string;
  level_name: string;
  level_id: string;
  teaching_type: string;
  section_number: number;
  group_number: number | null;
  weekly_hours: number;
}
interface ScheduleCell {
  id: string;
  assignment_id: string;
  room_id: string;
  time_slot_id: string;
}
interface ModalState {
  day: string;
  slotId: string;
  slotLabel: string;
}

export default function AdminSchedulePage() {
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedule, setSchedule] = useState<ScheduleCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // فلاتر
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedSection, setSelectedSection] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'group' | 'professor' | 'room'>('group');
  const [selectedProfessor, setSelectedProfessor] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');

  // Modal
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalAssignment, setModalAssignment] = useState('');
  const [modalRoom, setModalRoom] = useState('');
  const [modalSearch, setModalSearch] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: ts }, { data: rm }, { data: lv }, { data: asgn }, { data: sched }] = await Promise.all([
      supabase.from('time_slots').select('*').eq('is_active', true).order('slot_number'),
      supabase.from('rooms').select('*').eq('is_active', true).order('name'),
      supabase.from('levels').select('id, name_ar').order('display_order'),
      supabase.from('assignments')
        .select('id, section_number, group_number, teaching_type, weekly_hours, professor:professors(last_name, first_name), module:modules(name_ar), level:levels(id, name_ar)')
        .eq('academic_year', ACADEMIC_YEAR).eq('semester', 1).in('status', ['نهائي', 'مؤقت']),
      supabase.from('schedules')
        .select('id, assignment_id, room_id, time_slot_id')
        .eq('academic_year', ACADEMIC_YEAR).eq('semester', 1),
    ]);

    console.log('timeSlots loaded:', ts?.length, ts);
    if (ts) setTimeSlots(ts);
    if (rm) setRooms(rm);
    if (lv) setLevels(lv);
    if (asgn) setAssignments(asgn.map((a: any) => ({
      id: a.id,
      professor_name: a.professor ? a.professor.last_name + ' ' + a.professor.first_name : '—',
      module_name: a.module?.name_ar || '—',
      level_name: (a.level as any)?.name_ar || '—',
      level_id: (a.level as any)?.id || '',
      teaching_type: a.teaching_type,
      section_number: a.section_number,
      group_number: a.group_number,
      weekly_hours: a.weekly_hours,
    })));
    if (sched) setSchedule(sched);
    setLoading(false);
  }

  function getSlotId(day: string, slotNum: number): string | null {
    return timeSlots.find(ts => ts.day === day && ts.slot_number === slotNum)?.id || null;
  }

  function getSlotLabel(slotNum: number): string {
    const slot = timeSlots.find(ts => ts.slot_number === slotNum);
    if (!slot) return '';
    return `${slot.start_time.substring(0, 5)} — ${slot.end_time.substring(0, 5)}`;
  }

  function getCellSchedules(day: string, slotNum: number): ScheduleCell[] {
    const slotId = getSlotId(day, slotNum);
    if (!slotId) return [];
    return schedule.filter(s => s.time_slot_id === slotId);
  }

  function getFilteredAssignments(): Assignment[] {
    let list = assignments;
    if (viewMode === 'group' && selectedLevel) {
      list = list.filter(a => a.level_id === selectedLevel && a.section_number === selectedSection);
    } else if (viewMode === 'professor' && selectedProfessor) {
      list = list.filter(a => a.professor_name === selectedProfessor);
    }
    if (modalSearch) {
      list = list.filter(a =>
        a.module_name.includes(modalSearch) || a.professor_name.includes(modalSearch)
      );
    }
    return list;
  }

  async function removeCell(scheduleId: string) {
    await supabase.from('schedules').delete().eq('id', scheduleId);
    setSchedule(prev => prev.filter(s => s.id !== scheduleId));
    setMessage({ type: 'success', text: 'تم حذف الحصة' });
  }

  async function addCell() {
    if (!modal || !modalAssignment || !modalRoom) {
      setMessage({ type: 'error', text: 'يرجى اختيار الإسناد والقاعة' });
      return;
    }
    // تحقق من التعارض
    const conflict = schedule.find(s =>
      s.time_slot_id === modal.slotId &&
      (s.assignment_id === modalAssignment || s.room_id === modalRoom)
    );
    if (conflict) {
      setMessage({ type: 'error', text: 'تعارض — هذه القاعة أو الإسناد محجوز في هذا التوقيت' });
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.from('schedules').insert({
      assignment_id: modalAssignment,
      room_id: modalRoom,
      time_slot_id: modal.slotId,
      academic_year: ACADEMIC_YEAR,
      semester: 1,
      status: 'مسودة',
    }).select().single();

    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setSchedule(prev => [...prev, data]);
      setMessage({ type: 'success', text: 'تمت إضافة الحصة' });
      setModal(null);
      setModalAssignment('');
      setModalRoom('');
      setModalSearch('');
    }
    setSaving(false);
  }

  const professors = [...new Set(assignments.map(a => a.professor_name))].sort();

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">التوقيت الأسبوعي — السداسي الأول</h2>
          <p className="text-gray-500 text-sm mt-0.5">{toArabicNum(schedule.length)} حصة مجدولة</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-sm hover:bg-gray-200 transition-colors">
          <RefreshCw className="w-4 h-4" /> تحديث
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* تبديل العرض */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {[{ v: 'group', l: 'حسب المجموعة' }, { v: 'professor', l: 'حسب الأستاذ' }, { v: 'room', l: 'حسب القاعة' }].map(m => (
          <button key={m.v} onClick={() => setViewMode(m.v as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === m.v ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500'}`}>
            {m.l}
          </button>
        ))}
      </div>

      {/* فلاتر */}
      <div className="flex gap-3 flex-wrap items-center">
        {viewMode === 'group' && (
          <>
            <select value={selectedLevel} onChange={e => { setSelectedLevel(e.target.value); setSelectedSection(1); }}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b] bg-white">
              <option value="">اختر المستوى...</option>
              {levels.map(l => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
            </select>
            {selectedLevel && (
              <div className="flex gap-1">
                {[1, 2, 3, 4].map(s => (
                  <button key={s} onClick={() => setSelectedSection(s)}
                    className={`w-9 h-9 rounded-xl text-sm font-bold transition-all ${selectedSection === s ? 'bg-[#1a3a6b] text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
                    {toArabicNum(s)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {viewMode === 'professor' && (
          <select value={selectedProfessor} onChange={e => setSelectedProfessor(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b] bg-white min-w-[200px]">
            <option value="">اختر الأستاذ...</option>
            {professors.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
      </div>

      {/* الجدول */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: 800 }}>
            <thead>
              <tr className="bg-[#1a3a6b] text-white">
                <th className="px-4 py-3 text-right font-semibold w-24 border-l border-white/10">اليوم</th>
                {SLOT_NUMBERS.map(slotNum => (
                  <th key={slotNum} className="px-3 py-3 text-center font-semibold border-l border-white/10" style={{ minWidth: 160 }}>
                    <div className="text-sm">{getSlotLabel(slotNum)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, di) => (
                <tr key={day} className={di % 2 === 0 ? 'bg-gray-50/40' : 'bg-white'}>
                  <td className="px-4 py-3 font-bold text-[#1a3a6b] text-sm border border-gray-100 whitespace-nowrap align-middle">
                    {day}
                  </td>
                  {SLOT_NUMBERS.map(slotNum => {
                    const slotId = getSlotId(day, slotNum);
                    const cells = getCellSchedules(day, slotNum);
                    const slotLabel = getSlotLabel(slotNum);

                    return (
                      <td key={slotNum}
                        onClick={() => {
                          if (slotId) {
                            setModal({ day, slotId, slotLabel });
                            setModalAssignment('');
                            setModalRoom('');
                            setModalSearch('');
                          }
                        }}
                        className="border border-gray-100 p-1.5 align-top cursor-pointer hover:bg-blue-50/30 transition-colors"
                        style={{ minWidth: 160, minHeight: 80 }}>
                        <div className="space-y-1 min-h-[70px]">
                          {cells.map(cell => {
                            const asgn = assignments.find(a => a.id === cell.assignment_id);
                            const room = rooms.find(r => r.id === cell.room_id);
                            return (
                              <div key={cell.id}
                                onClick={e => e.stopPropagation()}
                                className="bg-[#1a3a6b] text-white rounded-lg p-1.5 relative group">
                                <button
                                  onClick={e => { e.stopPropagation(); removeCell(cell.id); }}
                                  className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100 bg-red-500 rounded-full w-4 h-4 flex items-center justify-center transition-all">
                                  <X className="w-2.5 h-2.5 text-white" />
                                </button>
                                <p className="font-bold leading-tight text-[11px] ml-4">{asgn?.module_name}</p>
                                <p className="text-white/80 leading-tight text-[10px]">{asgn?.professor_name}</p>
                                <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                  <span className="bg-white/20 px-1 rounded text-[9px]">
                                    {asgn?.teaching_type === 'محاضرة' ? `م${asgn.section_number}` : `ف${asgn?.group_number}`}
                                  </span>
                                  {room && <span className="bg-[#c9a227] text-white px-1 rounded text-[9px]">{room.name}</span>}
                                </div>
                              </div>
                            );
                          })}
                          {cells.length === 0 && (
                            <div className="flex items-center justify-center h-16 text-gray-200 text-lg hover:text-[#1a3a6b]/30 transition-colors">
                              +
                            </div>
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

      {/* Modal إضافة حصة */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4"
            onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-gray-900 text-lg">إضافة حصة</h3>
                <p className="text-gray-500 text-sm">{modal.day} — {modal.slotLabel}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* بحث */}
            <input type="text" placeholder="ابحث عن مقياس أو أستاذ..." value={modalSearch}
              onChange={e => setModalSearch(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1a3a6b]" />

            {/* قائمة الإسنادات */}
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">الإسناد</label>
              <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                {getFilteredAssignments().length === 0 ? (
                  <p className="text-center text-gray-400 py-4 text-sm">لا توجد إسنادات متاحة</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {getFilteredAssignments().map(a => (
                      <button key={a.id}
                        onClick={() => setModalAssignment(a.id)}
                        className={`w-full text-right px-4 py-3 text-sm transition-all ${modalAssignment === a.id ? 'bg-[#1a3a6b] text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                        <div className="font-medium">{a.module_name}</div>
                        <div className={`text-xs mt-0.5 ${modalAssignment === a.id ? 'text-white/70' : 'text-gray-400'}`}>
                          {a.professor_name} —
                          {a.teaching_type === 'محاضرة' ? ` م${a.section_number}` : ` ف${a.group_number}`} —
                          {a.level_name}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* قائمة القاعات */}
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">القاعة</label>
              <div className="flex flex-wrap gap-2">
                {rooms.map(r => (
                  <button key={r.id}
                    onClick={() => setModalRoom(r.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all ${modalRoom === r.id ? 'bg-[#c9a227] text-white border-[#c9a227]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    {r.name}
                    <span className={`mr-1 text-[10px] ${modalRoom === r.id ? 'text-white/70' : 'text-gray-400'}`}>({r.capacity})</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={addCell} disabled={saving || !modalAssignment || !modalRoom}
              className="w-full flex items-center justify-center gap-2 bg-[#1a3a6b] hover:bg-[#0d2040] text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-40">
              <Save className="w-4 h-4" />
              {saving ? 'جارٍ الحفظ...' : 'إضافة الحصة'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
