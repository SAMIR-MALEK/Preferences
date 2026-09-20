import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import { ChevronDown, X, Plus, Save, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const ACADEMIC_YEAR = '2026-2027';

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
  assignment?: Assignment;
  room?: Room;
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

  // picking
  const [pickingCell, setPickingCell] = useState<{ day: string; slotId: string } | null>(null);
  const [pickingAssignment, setPickingAssignment] = useState('');
  const [pickingRoom, setPickingRoom] = useState('');

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: ts }, { data: rm }, { data: lv }, { data: asgn }, { data: sched }] = await Promise.all([
      supabase.from('time_slots').select('*').eq('is_active', true).order('day').order('slot_number'),
      supabase.from('rooms').select('*').eq('is_active', true).order('name'),
      supabase.from('levels').select('id, name_ar').order('display_order'),
      supabase.from('assignments')
        .select('id, section_number, group_number, teaching_type, weekly_hours, professor:professors(last_name, first_name), module:modules(name_ar), level:levels(id, name_ar)')
        .eq('academic_year', ACADEMIC_YEAR).eq('semester', 1).in('status', ['نهائي', 'مؤقت']),
      supabase.from('schedules')
        .select('id, assignment_id, room_id, time_slot_id')
        .eq('academic_year', ACADEMIC_YEAR).eq('semester', 1),
    ]);

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

  // حذف خلية
  async function removeCell(scheduleId: string) {
    await supabase.from('schedules').delete().eq('id', scheduleId);
    setSchedule(prev => prev.filter(s => s.id !== scheduleId));
  }

  // إضافة خلية
  async function addCell() {
    if (!pickingCell || !pickingAssignment || !pickingRoom) return;
    setSaving(true);
    const slotObj = timeSlots.find(ts => ts.id === pickingCell.slotId && ts.day === pickingCell.day);
    if (!slotObj) { setSaving(false); return; }

    // تحقق من التعارض
    const conflict = schedule.find(s => {
      const sSlot = timeSlots.find(ts => ts.id === s.time_slot_id);
      return sSlot?.day === pickingCell.day && s.time_slot_id === pickingCell.slotId && (
        s.assignment_id === pickingAssignment || s.room_id === pickingRoom
      );
    });
    if (conflict) {
      setMessage({ type: 'error', text: 'تعارض — هذه القاعة أو الإسناد محجوز في هذا التوقيت' });
      setSaving(false);
      return;
    }

    const { data, error } = await supabase.from('schedules').insert({
      assignment_id: pickingAssignment,
      room_id: pickingRoom,
      time_slot_id: pickingCell.slotId,
      academic_year: ACADEMIC_YEAR,
      semester: 1,
      status: 'مسودة',
    }).select().single();

    if (error) setMessage({ type: 'error', text: error.message });
    else {
      setSchedule(prev => [...prev, data]);
      setMessage({ type: 'success', text: 'تمت إضافة الحصة' });
    }
    setPickingCell(null);
    setPickingAssignment('');
    setPickingRoom('');
    setSaving(false);
  }

  // الساعات الفريدة
  const uniqueSlotNumbers = [1, 2, 3, 4, 5];

  // الأساتذة الفريدون
  const professors = [...new Set(assignments.map(a => a.professor_name))].sort();

  // تصفية الإسنادات حسب العرض
  function getFilteredAssignments() {
    if (viewMode === 'group') {
      return assignments.filter(a => a.level_id === selectedLevel && a.section_number === selectedSection);
    }
    if (viewMode === 'professor') return assignments.filter(a => a.professor_name === selectedProfessor);
    return assignments;
  }

  // إيجاد الحصة في خلية معينة
  function getCellSchedule(day: string, slotNum: number) {
    const slotsForDay = timeSlots.filter(ts => ts.day === day && ts.slot_number === slotNum);
    const slotIds = slotsForDay.map(ts => ts.id);
    return schedule.filter(s => slotIds.includes(s.time_slot_id));
  }
  
  function getSlotId(day: string, slotNum: number): string | null {
    const slot = timeSlots.find(ts => ts.day === day && ts.slot_number === slotNum);
    return slot?.id || null;
  }

  function getSlotTime(slotNum: number) {
    const slot = timeSlots.find(ts => ts.slot_number === slotNum && ts.day === 'السبت');
    if (!slot) {
      const anySlot = timeSlots.find(ts => ts.slot_number === slotNum);
      return anySlot ? `${anySlot.start_time.substring(0, 5)} — ${anySlot.end_time.substring(0, 5)}` : '';
    }
    return `${slot.start_time.substring(0, 5)} — ${slot.end_time.substring(0, 5)}`;
  }

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
      <div className="flex gap-3 flex-wrap">
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
        {viewMode === 'room' && (
          <select value={selectedRoom} onChange={e => setSelectedRoom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b] bg-white min-w-[200px]">
            <option value="">اختر القاعة...</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>

      {/* الجدول الأسبوعي */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#1a3a6b] text-white">
                <th className="px-3 py-3 text-right font-semibold min-w-[80px]">اليوم</th>
                {uniqueSlotNumbers.map(slotNum => (
                  <th key={slotNum} className="px-2 py-3 text-center font-semibold min-w-[140px] border-r border-white/10">
                    <div>{toArabicNum(slotNum)}</div>
                    <div className="text-[10px] text-white/70 font-normal">{getSlotTime(slotNum)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((day, di) => (
                <tr key={day} className={di % 2 === 0 ? 'bg-gray-50/50' : 'bg-white'}>
                  <td className="px-3 py-2 font-bold text-[#1a3a6b] text-sm border-b border-gray-100 whitespace-nowrap">
                    {day}
                  </td>
                  {uniqueSlotNumbers.map(slotNum => {
                    const cellSchedules = getCellSchedule(day, slotNum);
                    const slotObjId = getSlotId(day, slotNum);
                    const slotObj = timeSlots.find(ts => ts.id === slotObjId);
                    const isPicking = pickingCell?.day === day && pickingCell?.slotId === slotObj?.id;

                    return (
                      <td key={slotNum} className="border border-gray-100 p-1 align-top min-h-[80px]" style={{ minWidth: 140, verticalAlign: 'top' }}>
                        <div className="space-y-1 min-h-[70px]">
                          {cellSchedules.map(cell => {
                            const asgn = assignments.find(a => a.id === cell.assignment_id);
                            const room = rooms.find(r => r.id === cell.room_id);
                            return (
                              <div key={cell.id}
                                className="bg-[#1a3a6b]/08 border border-[#1a3a6b]/20 rounded-lg p-1.5 relative group">
                                <button onClick={() => removeCell(cell.id)}
                                  className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-all">
                                  <X className="w-3 h-3" />
                                </button>
                                <p className="font-bold text-[#1a3a6b] leading-tight">{asgn?.module_name}</p>
                                <p className="text-gray-500 leading-tight">{asgn?.professor_name}</p>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className={`px-1 rounded text-[9px] ${asgn?.teaching_type === 'محاضرة' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {asgn?.teaching_type === 'محاضرة' ? `م${asgn.section_number}` : `ف${asgn?.group_number}`}
                                  </span>
                                  {room && <span className="text-gray-400 text-[9px]">{room.name}</span>}
                                </div>
                              </div>
                            );
                          })}

                          {/* زر إضافة */}
                          {slotObj && (
                            isPicking ? (
                              <div className="bg-white border-2 border-[#1a3a6b] rounded-lg p-2 space-y-1.5">
                                <select value={pickingAssignment} onChange={e => setPickingAssignment(e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none bg-white">
                                  <option value="">اختر الإسناد...</option>
                                  {getFilteredAssignments().map(a => (
                                    <option key={a.id} value={a.id}>
                                      {a.module_name} — {a.teaching_type === 'محاضرة' ? `م${a.section_number}` : `ف${a.group_number}`} — {a.professor_name}
                                    </option>
                                  ))}
                                </select>
                                <select value={pickingRoom} onChange={e => setPickingRoom(e.target.value)}
                                  className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none bg-white">
                                  <option value="">اختر القاعة...</option>
                                  {rooms.map(r => <option key={r.id} value={r.id}>{r.name} ({r.capacity})</option>)}
                                </select>
                                <div className="flex gap-1">
                                  <button onClick={addCell} disabled={saving}
                                    className="flex-1 bg-[#1a3a6b] text-white rounded-lg py-1 text-[10px] font-bold disabled:opacity-50">
                                    {saving ? '...' : 'إضافة'}
                                  </button>
                                  <button onClick={() => setPickingCell(null)}
                                    className="px-2 bg-gray-100 rounded-lg text-[10px] text-gray-500">
                                    ✕
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setPickingCell({ day, slotId: slotObj.id })}
                                className="w-full h-8 border-2 border-dashed border-gray-200 rounded-lg text-gray-300 hover:border-[#1a3a6b] hover:text-[#1a3a6b] transition-all flex items-center justify-center">
                                <Plus className="w-3 h-3" />
                              </button>
                            )
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
    </div>
  );
}
