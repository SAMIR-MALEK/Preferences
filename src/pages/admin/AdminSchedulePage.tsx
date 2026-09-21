import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import { X, Save, CheckCircle, AlertCircle, RefreshCw, Plus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const ACADEMIC_YEAR = '2026-2027';
const SLOT_NUMBERS = [1, 2, 3, 4, 5];

interface TimeSlot { id: string; day: string; slot_number: number; start_time: string; end_time: string; }
interface Room { id: string; name: string; type: string; capacity: number; }
interface Level { id: string; name_ar: string; }
interface Assignment {
  id: string;
  professor_name: string;
  professor_id: string;
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
  assignment_id: string | null;
  room_id: string;
  time_slot_id: string;
  status: string;
  created_by_name?: string;
  // حصة مقترحة يدوية
  custom_module?: string;
  custom_professor?: string;
}
interface ModalState {
  day: string;
  slotId: string;
  slotLabel: string;
}

export default function AdminSchedulePage() {
  const { user } = useAuth();
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [schedule, setSchedule] = useState<ScheduleCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // فلاتر — إلزامية
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedSection, setSelectedSection] = useState<number>(1);

  // Modal
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalTab, setModalTab] = useState<'assigned' | 'custom'>('assigned');
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
        .select('id, section_number, group_number, teaching_type, weekly_hours, professor:professors(id, last_name, first_name), module:modules(name_ar), level:levels(id, name_ar)')
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
      professor_id: a.professor?.id || '',
      professor_name: a.professor ? a.professor.last_name + ' ' + a.professor.first_name : '—',
      module_name: a.module?.name_ar || '—',
      level_name: (a.level as any)?.name_ar || '—',
      level_id: (a.level as any)?.id || '',
      teaching_type: a.teaching_type,
      section_number: a.section_number,
      group_number: a.group_number,
      weekly_hours: a.weekly_hours,
    })));
    if (sched) setSchedule(sched.map((s: any) => ({
      id: s.id,
      assignment_id: s.assignment_id,
      room_id: s.room_id,
      time_slot_id: s.time_slot_id,
      status: s.status,
      custom_module: s.custom_module,
      custom_professor: s.custom_professor,
      created_by_name: s.created_by?.full_name,
    })));
    setLoading(false);
  }

  function getSlotId(day: string, slotNum: number): string | null {
    return timeSlots.find(ts => ts.day === day && ts.slot_number === slotNum)?.id || null;
  }

  function getSlotLabel(slotNum: number): string {
    const slot = timeSlots.find(ts => ts.slot_number === slotNum);
    if (!slot) return `فترة ${slotNum}`;
    const fmt = (t: string) => t.substring(0, 5);
    return `${fmt(slot.start_time)} — ${fmt(slot.end_time)}`;
  }

  function getCellSchedules(day: string, slotNum: number): ScheduleCell[] {
    const slotId = getSlotId(day, slotNum);
    if (!slotId) return [];
    const cells = schedule.filter(s => s.time_slot_id === slotId);
    if (!selectedLevel) return cells;
    // فلتر حسب المستوى والمجموعة
    return cells.filter(cell => {
      if (!cell.assignment_id) return true; // حصة مقترحة يدوية
      const asgn = assignments.find(a => a.id === cell.assignment_id);
      return asgn?.level_id === selectedLevel && asgn?.section_number === selectedSection;
    });
  }

  function getFilteredAssignments(): Assignment[] {
    let list = assignments.filter(a =>
      a.level_id === selectedLevel && a.section_number === selectedSection
    );
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
  }

  async function addCell() {
    if (!modal) return;
    if (modalTab === 'assigned' && (!modalAssignment || !modalRoom)) {
      setMessage({ type: 'error', text: 'يرجى اختيار الإسناد والقاعة' });
      return;
    }
    if (modalTab === 'custom' && (!customModule || !customProfessor || !modalRoom)) {
      setMessage({ type: 'error', text: 'يرجى ملء جميع الحقول' });
      return;
    }

    // تحقق من تعارض القاعة
    const roomConflict = schedule.find(s =>
      s.time_slot_id === modal.slotId && s.room_id === modalRoom
    );
    if (roomConflict) {
      setMessage({ type: 'error', text: 'تعارض — هذه القاعة محجوزة في هذا التوقيت' });
      return;
    }

    // تحقق من تعارض الأستاذ
    if (modalTab === 'assigned') {
      const asgnConflict = schedule.find(s =>
        s.time_slot_id === modal.slotId && s.assignment_id === modalAssignment
      );
      if (asgnConflict) {
        setMessage({ type: 'error', text: 'تعارض — هذا الإسناد موجود بالفعل في هذا التوقيت' });
        return;
      }
    }

    setSaving(true);
    const insertData: any = {
      room_id: modalRoom,
      time_slot_id: modal.slotId,
      academic_year: ACADEMIC_YEAR,
      semester: 1,
      status: 'مسودة',
      created_by: user?.admin?.id,
    };

    if (modalTab === 'assigned') {
      insertData.assignment_id = modalAssignment;
    } else {
      insertData.assignment_id = null;
      insertData.custom_module = customModule;
      insertData.custom_professor = customProfessor;
    }

    const { data, error } = await supabase.from('schedules').insert(insertData).select().single();
    if (error) {
      setMessage({ type: 'error', text: error.message });
    } else {
      setSchedule(prev => [...prev, { ...data, created_by_name: user?.admin?.full_name }]);
      setMessage({ type: 'success', text: 'تمت إضافة الحصة' });
      setModal(null);
      setModalAssignment('');
      setModalRoom('');
      setModalSearch('');
      setCustomModule('');
      setCustomProfessor('');
    }
    setSaving(false);
  }

  const levelName = levels.find(l => l.id === selectedLevel)?.name_ar || '';
  const canShowGrid = !!selectedLevel;

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
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
          <button onClick={() => setMessage(null)} className="mr-auto text-current opacity-50 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* فلاتر إلزامية */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">المستوى:</span>
          <select value={selectedLevel} onChange={e => { setSelectedLevel(e.target.value); setSelectedSection(1); }}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b] bg-white">
            <option value="">— اختر المستوى —</option>
            {levels.map(l => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
          </select>
        </div>
        {selectedLevel && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700">المجموعة:</span>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(s => (
                <button key={s} onClick={() => setSelectedSection(s)}
                  className={`w-9 h-9 rounded-xl text-sm font-bold transition-all ${selectedSection === s ? 'bg-[#1a3a6b] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-[#1a3a6b]'}`}>
                  {toArabicNum(s)}
                </button>
              ))}
            </div>
          </div>
        )}
        {selectedLevel && (
          <span className="text-xs text-gray-400 mr-auto">
            {levelName} — المجموعة {toArabicNum(selectedSection)}
          </span>
        )}
      </div>

      {/* تحذير اختيار المستوى */}
      {!canShowGrid && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 text-center">
          <p className="text-amber-700 font-medium">يرجى اختيار المستوى والمجموعة لعرض الجدول</p>
        </div>
      )}

      {/* الجدول */}
      {canShowGrid && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 900 }}>
              <thead>
                <tr className="bg-[#1a3a6b] text-white">
                  <th className="px-4 py-3 text-right font-semibold w-24 border-l border-white/10">اليوم</th>
                  {SLOT_NUMBERS.map(slotNum => (
                    <th key={slotNum} className="px-3 py-3 text-center font-semibold border-l border-white/10" style={{ minWidth: 160 }}>
                      <div className="text-sm font-bold">{getSlotLabel(slotNum)}</div>
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
                      return (
                        <td key={slotNum}
                          onClick={() => {
                            if (!slotId) return;
                            setModal({ day, slotId, slotLabel: getSlotLabel(slotNum) });
                            setModalTab('assigned');
                            setModalAssignment('');
                            setModalRoom('');
                            setModalSearch('');
                            setCustomModule('');
                            setCustomProfessor('');
                          }}
                          className="border border-gray-100 p-1.5 align-top cursor-pointer hover:bg-blue-50/40 transition-colors"
                          style={{ minWidth: 160, minHeight: 90 }}>
                          <div className="space-y-1 min-h-[80px]">
                            {cells.map(cell => {
                              const asgn = assignments.find(a => a.id === cell.assignment_id);
                              const room = rooms.find(r => r.id === cell.room_id);
                              const isCustom = !cell.assignment_id;
                              return (
                                <div key={cell.id}
                                  onClick={e => e.stopPropagation()}
                                  className={`rounded-lg p-1.5 relative group ${isCustom ? 'bg-amber-500/90 text-white' : 'bg-[#1a3a6b] text-white'}`}>
                                  <button
                                    onClick={e => { e.stopPropagation(); removeCell(cell.id); }}
                                    className="absolute top-0.5 left-0.5 opacity-0 group-hover:opacity-100 bg-red-500 rounded-full w-4 h-4 flex items-center justify-center transition-all">
                                    <X className="w-2.5 h-2.5 text-white" />
                                  </button>
                                  {isCustom ? (
                                    <>
                                      <p className="font-bold leading-tight text-[11px] ml-4">{cell.custom_module}</p>
                                      <p className="text-white/80 leading-tight text-[10px]">{cell.custom_professor}</p>
                                      <span className="text-[9px] bg-white/20 px-1 rounded">مقترح</span>
                                    </>
                                  ) : (
                                    <>
                                      <p className="font-bold leading-tight text-[11px] ml-4">{asgn?.module_name}</p>
                                      <p className="text-white/80 leading-tight text-[10px]">{asgn?.professor_name}</p>
                                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                        <span className="bg-white/20 px-1 rounded text-[9px]">
                                          {asgn?.teaching_type === 'محاضرة' ? `م${asgn.section_number}` : `ف${asgn?.group_number}`}
                                        </span>
                                        {room && <span className="bg-[#c9a227] text-white px-1 rounded text-[9px]">{room.name}</span>}
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                            {cells.length === 0 && (
                              <div className="flex items-center justify-center h-[80px] text-gray-200 hover:text-[#1a3a6b]/30 transition-colors">
                                <Plus className="w-5 h-5" />
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
      )}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-bold text-gray-900 text-lg">إضافة حصة</h3>
                <p className="text-gray-500 text-sm">{modal.day} — {modal.slotLabel} — {levelName} م{selectedSection}</p>
              </div>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* تبويبان */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setModalTab('assigned')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${modalTab === 'assigned' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500'}`}>
                من الإسناد الرسمي
              </button>
              <button onClick={() => setModalTab('custom')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${modalTab === 'custom' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500'}`}>
                اقتراح يدوي
              </button>
            </div>

            {modalTab === 'assigned' && (
              <>
                <input type="text" placeholder="ابحث عن مقياس أو أستاذ..." value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1a3a6b]" />
                <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {getFilteredAssignments().length === 0 ? (
                    <p className="text-center text-gray-400 py-6 text-sm">لا توجد إسنادات لهذا المستوى والمجموعة</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {getFilteredAssignments().map(a => (
                        <button key={a.id} onClick={() => setModalAssignment(a.id)}
                          className={`w-full text-right px-4 py-3 text-sm transition-all ${modalAssignment === a.id ? 'bg-[#1a3a6b] text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                          <div className="font-medium">{a.module_name}</div>
                          <div className={`text-xs mt-0.5 ${modalAssignment === a.id ? 'text-white/70' : 'text-gray-400'}`}>
                            {a.professor_name} — {a.teaching_type === 'محاضرة' ? `م${a.section_number}` : `ف${a.group_number}`}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {modalTab === 'custom' && (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
                  هذه الحصة ستُضاف كاقتراح (بلون مختلف) وتُسجَّل باسمك: <strong>{user?.admin?.full_name}</strong>
                </div>
                <input type="text" placeholder="اسم المقياس..." value={customModule}
                  onChange={e => setCustomModule(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400" />
                <input type="text" placeholder="اسم الأستاذ..." value={customProfessor}
                  onChange={e => setCustomProfessor(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-400" />
              </div>
            )}

            {/* القاعات */}
            <div>
              <label className="text-xs text-gray-500 mb-2 block font-medium">القاعة</label>
              <div className="flex flex-wrap gap-2">
                {rooms.map(r => (
                  <button key={r.id} onClick={() => setModalRoom(r.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition-all ${modalRoom === r.id ? 'bg-[#c9a227] text-white border-[#c9a227]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                    {r.name} <span className={`text-[10px] ${modalRoom === r.id ? 'text-white/70' : 'text-gray-400'}`}>({r.capacity})</span>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={addCell} disabled={saving}
              className={`w-full flex items-center justify-center gap-2 text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-40 ${modalTab === 'custom' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#1a3a6b] hover:bg-[#0d2040]'}`}>
              <Save className="w-4 h-4" />
              {saving ? 'جارٍ الحفظ...' : modalTab === 'custom' ? 'إضافة اقتراح' : 'إضافة الحصة'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
