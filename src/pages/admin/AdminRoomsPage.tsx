import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import * as XLSX from 'xlsx';
import { Upload, Plus, Save, Trash2, CheckCircle, AlertCircle, Pencil, X, Grid3X3, Building2 } from 'lucide-react';

interface Room {
  id: string;
  code: string;
  name: string;
  capacity: number;
  floor: number;
  type: string;
  is_active: boolean;
}

interface TimeSlot {
  id: string;
  day: string;
  start_time: string;
  end_time: string;
  slot_number: number;
}

interface OccupancyEntry {
  room_id: string;
  time_slot_id: string;
  specialite: string;
  module_name: string;
  prof_name: string;
  teaching_type: string;
}

const ROOM_TYPES = ['مدرج', 'قاعة محاضرات', 'قاعة', 'مخبر'];
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

const emptyRoom = { code: '', name: '', capacity: 30, floor: 0, type: 'قاعة', is_active: true };

// ─── مكوّن حالة القاعات ──────────────────────────────────────────────────────

function RoomStatus({ rooms }: { rooms: Room[] }) {
  const [mode, setMode] = useState<'A' | 'B' | 'C'>('A');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // الوضع A
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  // الوضع B
  const [selectedDay, setSelectedDay] = useState<string>(DAYS[0]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  // الوضع C
  const [mapDay, setMapDay] = useState<string>(DAYS[0]);
  const [popupCell, setPopupCell] = useState<{ room: Room; slot: TimeSlot } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoadingData(true);

    // جلب الحصص الزمنية
    const { data: slotsData } = await supabase
      .from('time_slots')
      .select('*')
      .order('slot_number');

    // جلب الجداول: schedules يحتوي على assignment_id و room_id و time_slot_id
    const { data: schedulesData } = await supabase
      .from('schedules')
      .select('id, room_id, time_slot_id, assignment_id')
      .eq('academic_year', '2026-2027')
      .eq('semester', 1)
      .not('room_id', 'is', null);

    const slots = (slotsData ?? []) as TimeSlot[];
    setTimeSlots(slots);

    const schRows = (schedulesData ?? []) as any[];
    if (schRows.length === 0) { setOccupancy([]); setLoadingData(false); return; }

    // جلب تفاصيل الإسنادات دفعة واحدة
    const assignmentIds = [...new Set(schRows.map((s: any) => s.assignment_id).filter(Boolean))];
    const { data: assignmentsData } = await supabase
      .from('assignments')
      .select(`
        id,
        teaching_type,
        module:modules ( name_ar ),
        professor:professors ( last_name, first_name ),
        level:levels ( name_ar )
      `)
      .in('id', assignmentIds);

    const aMap = new Map((assignmentsData ?? []).map((a: any) => [a.id, a]));

    // تحويل البيانات إلى مصفوفة إشغال مسطّحة
    const entries: OccupancyEntry[] = [];
    for (const sch of schRows) {
      if (!sch.room_id || !sch.time_slot_id || !sch.assignment_id) continue;
      const a = aMap.get(sch.assignment_id) as any;
      if (!a) continue;
      entries.push({
        room_id: sch.room_id,
        time_slot_id: sch.time_slot_id,
        specialite: a.level?.name_ar ?? '—',
        module_name: a.module?.name_ar ?? '—',
        prof_name: a.professor
          ? `${a.professor.last_name} ${a.professor.first_name}`
          : '—',
        teaching_type: a.teaching_type ?? '—',
      });
    }
    setOccupancy(entries);
    setLoadingData(false);
  }

  function getEntry(roomId: string, slotId: string) {
    return occupancy.find(e => e.room_id === roomId && e.time_slot_id === slotId) ?? null;
  }

  function isOccupied(roomId: string, slotId: string) {
    return !!getEntry(roomId, slotId);
  }

  const activeRooms = rooms.filter(r => r.is_active);

  if (loadingData) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── شريط الأوضاع ─────────────────────────────────────────────────────────
  const modeButtons = [
    { key: 'A' as const, label: 'جدول قاعة', desc: 'اختر قاعة' },
    { key: 'B' as const, label: 'لحظة محددة', desc: 'يوم + حصة' },
    { key: 'C' as const, label: 'خريطة شاملة', desc: 'كل القاعات' },
  ];

  return (
    <div className="space-y-4">
      {/* شريط الأوضاع */}
      <div className="flex gap-2 flex-wrap">
        {modeButtons.map(m => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
              mode === m.key
                ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a6b] hover:text-[#1a3a6b]'
            }`}
          >
            <span>{m.label}</span>
            <span className={`text-xs mr-1 ${mode === m.key ? 'text-blue-200' : 'text-gray-400'}`}>
              — {m.desc}
            </span>
          </button>
        ))}
      </div>

      {/* ── الوضع A: جدول قاعة ─────────────────────────────────────────── */}
      {mode === 'A' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700">اختر القاعة:</label>
            <select
              value={selectedRoom}
              onChange={e => setSelectedRoom(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b] bg-white min-w-[180px]"
            >
              <option value="">— اختر —</option>
              {activeRooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.code ? ` (${r.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedRoom && (() => {
            const room = activeRooms.find(r => r.id === selectedRoom)!;
            const slotsByDay: Record<string, TimeSlot[]> = {};
            for (const day of DAYS) {
              slotsByDay[day] = timeSlots.filter(s => s.day === day).sort((a, b) => a.slot_number - b.slot_number);
            }
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="font-bold text-gray-800">{room.name}</span>
                  <span className="text-xs text-gray-500">{room.type} · الطاقة {toArabicNum(room.capacity)} مقعد</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-right font-semibold text-gray-500 border-b border-gray-100">الحصة</th>
                        {DAYS.map(day => (
                          <th key={day} className="px-3 py-2 text-center font-semibold text-gray-600 border-b border-gray-100 min-w-[110px]">
                            {day}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {Array.from(new Set(timeSlots.map(s => s.slot_number))).sort((a, b) => a - b).map(slotNum => {
                        const anySlot = timeSlots.find(s => s.slot_number === slotNum);
                        return (
                          <tr key={slotNum}>
                            <td className="px-3 py-2 text-gray-500 bg-gray-50 whitespace-nowrap">
                              <div className="font-medium">ح{toArabicNum(slotNum)}</div>
                              {anySlot && (
                                <div className="text-gray-400">{anySlot.start_time.slice(0,5)}–{anySlot.end_time.slice(0,5)}</div>
                              )}
                            </td>
                            {DAYS.map(day => {
                              const slot = slotsByDay[day]?.find(s => s.slot_number === slotNum);
                              if (!slot) return <td key={day} className="px-3 py-2 text-center text-gray-200">—</td>;
                              const entry = getEntry(room.id, slot.id);
                              return (
                                <td key={day} className="px-2 py-1.5">
                                  {entry ? (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-1.5 space-y-0.5">
                                      <div className="font-semibold text-red-700 text-[11px] leading-tight">{entry.module_name}</div>
                                      <div className="text-red-500 text-[10px]">{entry.specialite}</div>
                                      <div className="text-red-400 text-[10px]">{entry.prof_name}</div>
                                      <div className="text-red-400 text-[10px]">{entry.teaching_type}</div>
                                    </div>
                                  ) : (
                                    <div className="bg-green-50 border border-green-200 rounded-lg p-1.5 text-center text-green-600 text-[11px] font-medium">
                                      شاغرة
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {!selectedRoom && (
            <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              اختر قاعة لعرض جدولها الأسبوعي
            </div>
          )}
        </div>
      )}

      {/* ── الوضع B: لحظة محددة ─────────────────────────────────────────── */}
      {mode === 'B' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">اليوم:</label>
              <select
                value={selectedDay}
                onChange={e => { setSelectedDay(e.target.value); setSelectedSlot(''); }}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b] bg-white"
              >
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">الحصة:</label>
              <select
                value={selectedSlot}
                onChange={e => setSelectedSlot(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b] bg-white"
              >
                <option value="">— اختر —</option>
                {timeSlots
                  .filter(s => s.day === selectedDay)
                  .sort((a, b) => a.slot_number - b.slot_number)
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      ح{toArabicNum(s.slot_number)} ({s.start_time.slice(0,5)}–{s.end_time.slice(0,5)})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {selectedSlot && (() => {
            const slot = timeSlots.find(s => s.id === selectedSlot)!;
            const freeRooms = activeRooms.filter(r => !isOccupied(r.id, slot.id));
            const busyRooms = activeRooms.filter(r => isOccupied(r.id, slot.id));
            return (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* شاغرة */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
                    <span className="font-bold text-green-700">القاعات الشاغرة</span>
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      {toArabicNum(freeRooms.length)}
                    </span>
                  </div>
                  {freeRooms.length === 0 ? (
                    <p className="text-center py-6 text-gray-400 text-sm">لا توجد قاعات شاغرة</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {freeRooms.map(r => (
                        <div key={r.id} className="px-4 py-2.5 flex items-center justify-between">
                          <div>
                            <span className="font-medium text-sm text-gray-800">{r.name}</span>
                            {r.code && <span className="text-xs text-gray-400 mr-2">{r.code}</span>}
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-gray-500">{r.type}</span>
                            <span className="text-xs text-gray-400 mr-2">· {toArabicNum(r.capacity)} مقعد</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* مشغولة */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
                    <span className="font-bold text-red-700">القاعات المشغولة</span>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                      {toArabicNum(busyRooms.length)}
                    </span>
                  </div>
                  {busyRooms.length === 0 ? (
                    <p className="text-center py-6 text-gray-400 text-sm">لا توجد قاعات مشغولة</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {busyRooms.map(r => {
                        const entry = getEntry(r.id, slot.id)!;
                        return (
                          <div key={r.id} className="px-4 py-2.5">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm text-gray-800">{r.name}</span>
                              <span className="text-xs text-gray-500">{r.type}</span>
                            </div>
                            <div className="text-xs text-gray-600 space-y-0.5">
                              <div><span className="text-gray-400">الوحدة:</span> {entry.module_name}</div>
                              <div><span className="text-gray-400">التخصص:</span> {entry.specialite}</div>
                              <div><span className="text-gray-400">الأستاذ:</span> {entry.prof_name}</div>
                              <div><span className="text-gray-400">النوع:</span> {entry.teaching_type}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {!selectedSlot && (
            <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              اختر اليوم والحصة لعرض حالة القاعات
            </div>
          )}
        </div>
      )}

      {/* ── الوضع C: خريطة شاملة ─────────────────────────────────────────── */}
      {mode === 'C' && (
        <div className="space-y-3">
          {/* مفتاح الألوان + فلتر الأيام */}
          <div className="flex items-center gap-4 text-xs text-gray-500 bg-white rounded-xl px-4 py-2.5 border border-gray-100 shadow-sm flex-wrap">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-green-200 border border-green-300" />
              <span>شاغرة</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded bg-red-400 border border-red-500" />
              <span>مشغولة</span>
            </div>
            <span className="text-gray-400">· انقر على خلية مشغولة للتفاصيل</span>
          </div>

          {/* أزرار الأيام */}
          <div className="flex gap-2 flex-wrap">
            {DAYS.map(day => (
              <button
                key={day}
                onClick={() => setMapDay(day)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  mapDay === day
                    ? 'bg-[#1a3a6b] text-white'
                    : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {day}
              </button>
            ))}
          </div>

          {/* جدول اليوم المختار */}
          {(() => {
            const daySlots = timeSlots.filter(s => s.day === mapDay).sort((a, b) => a.slot_number - b.slot_number);
            if (daySlots.length === 0) return (
              <div className="text-center py-8 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
                لا توجد حصص لهذا اليوم
              </div>
            );
            return (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="font-bold text-gray-700 text-sm">{mapDay}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2 text-right font-semibold text-gray-500 border-b border-gray-100 min-w-[100px]">
                          القاعة
                        </th>
                        {daySlots.map(slot => (
                          <th key={slot.id} className="px-2 py-2 text-center font-semibold text-gray-600 border-b border-gray-100 min-w-[70px]">
                            <div>ح{toArabicNum(slot.slot_number)}</div>
                            <div className="text-[10px] text-gray-400 font-normal">
                              {slot.start_time.slice(0,5)}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {activeRooms.map(room => (
                        <tr key={room.id}>
                          <td className="px-3 py-2 bg-gray-50">
                            <div className="font-medium text-gray-700">{room.name}</div>
                            {room.code && <div className="text-gray-400 text-[10px]">{room.code}</div>}
                          </td>
                          {daySlots.map(slot => {
                            const entry = getEntry(room.id, slot.id);
                            return (
                              <td key={slot.id} className="px-1 py-1 text-center">
                                {entry ? (
                                  <button
                                    onClick={() => setPopupCell({ room, slot })}
                                    className="w-full h-8 rounded-lg bg-red-400 hover:bg-red-500 transition-colors border border-red-500 flex items-center justify-center"
                                    title={`${entry.module_name} — ${entry.specialite}`}
                                  >
                                    <span className="text-white text-[9px] font-bold leading-tight px-0.5 truncate">
                                      {entry.teaching_type}
                                    </span>
                                  </button>
                                ) : (
                                  <div className="w-full h-8 rounded-lg bg-green-100 border border-green-200" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* popup التفاصيل */}
          {popupCell && (() => {
            const entry = getEntry(popupCell.room.id, popupCell.slot.id);
            if (!entry) { setPopupCell(null); return null; }
            return (
              <div
                className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
                onClick={() => setPopupCell(null)}
              >
                <div
                  className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-3"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900">{popupCell.room.name}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {popupCell.slot.day} · {popupCell.slot.start_time.slice(0,5)}–{popupCell.slot.end_time.slice(0,5)}
                      </p>
                    </div>
                    <button onClick={() => setPopupCell(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="bg-red-50 rounded-xl p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">الوحدة</span>
                      <span className="font-medium text-gray-800 text-right">{entry.module_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">التخصص</span>
                      <span className="font-medium text-gray-800">{entry.specialite}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">الأستاذ</span>
                      <span className="font-medium text-gray-800">{entry.prof_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">نوع النشاط</span>
                      <span className="font-medium text-gray-800">{entry.teaching_type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">الطاقة</span>
                      <span className="font-medium text-gray-800">{toArabicNum(popupCell.room.capacity)} مقعد</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ─── الصفحة الرئيسية ─────────────────────────────────────────────────────────

export default function AdminRoomsPage() {
  const [activeTab, setActiveTab] = useState<'manage' | 'status'>('manage');

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyRoom);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyRoom);
  const [typeFilter, setTypeFilter] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadRooms(); }, []);

  async function loadRooms() {
    setLoading(true);
    const { data } = await supabase.from('rooms').select('*').order('floor').order('name');
    if (data) setRooms(data);
    setLoading(false);
  }

  async function addRoom() {
    if (!addForm.name.trim()) { setMessage({ type: 'error', text: 'يرجى إدخال اسم القاعة' }); return; }
    setSaving(true);
    const { error } = await supabase.from('rooms').insert(addForm);
    if (error) setMessage({ type: 'error', text: error.message });
    else { setMessage({ type: 'success', text: 'تمت إضافة القاعة' }); setAddForm(emptyRoom); setShowAddForm(false); await loadRooms(); }
    setSaving(false);
  }

  async function saveEdit() {
    if (!editForm.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('rooms').update(editForm).eq('id', editingId!);
    if (error) setMessage({ type: 'error', text: error.message });
    else { setMessage({ type: 'success', text: 'تم التعديل' }); setEditingId(null); await loadRooms(); }
    setSaving(false);
  }

  async function deleteRoom(id: string) {
    if (!window.confirm('حذف هذه القاعة؟')) return;
    await supabase.from('rooms').update({ is_active: false }).eq('id', id);
    await loadRooms();
  }

  function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const toInsert = raw.slice(1).filter(r => r[0]).map(r => ({
        code: String(r[0] || '').trim(),
        name: String(r[1] || '').trim(),
        capacity: Number(r[2]) || 30,
        floor: Number(r[3]) || 0,
        type: String(r[4] || 'قاعة').trim(),
        is_active: true,
      }));
      if (toInsert.length === 0) { setMessage({ type: 'error', text: 'لا توجد بيانات في الملف' }); return; }
      const { error } = await supabase.from('rooms').insert(toInsert);
      if (error) setMessage({ type: 'error', text: error.message });
      else { setMessage({ type: 'success', text: `تم استيراد ${toArabicNum(toInsert.length)} قاعة` }); await loadRooms(); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  const filtered = rooms.filter(r => r.is_active && (!typeFilter || r.type === typeFilter));

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      {/* تبويبا الصفحة */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 w-fit">
        <button
          onClick={() => setActiveTab('manage')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'manage' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          إدارة القاعات
        </button>
        <button
          onClick={() => setActiveTab('status')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'status' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Grid3X3 className="w-4 h-4" />
          حالة القاعات
        </button>
      </div>

      {/* ── تبويب إدارة القاعات ─────────────────────────────────────────── */}
      {activeTab === 'manage' && (
        <>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-gray-900 font-display">إدارة القاعات والمدرجات</h2>
              <p className="text-gray-500 text-sm mt-0.5">{toArabicNum(filtered.length)} قاعة نشطة</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
                <Upload className="w-4 h-4" /> استيراد Excel
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleExcel} className="hidden" />
              <button onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0d2040] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
                <Plus className="w-4 h-4" /> إضافة قاعة
              </button>
            </div>
          </div>

          {message && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {message.text}
            </div>
          )}

          {/* نموذج إضافة */}
          {showAddForm && (
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
              <h3 className="font-semibold text-gray-800">قاعة جديدة</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الرمز (كود)</label>
                  <input value={addForm.code} onChange={e => setAddForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b]" placeholder="R001" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">اسم القاعة</label>
                  <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b]" placeholder="مثال: قاعة 5" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الطاقة الاستيعابية</label>
                  <input type="number" value={addForm.capacity} onChange={e => setAddForm(f => ({ ...f, capacity: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الطابق</label>
                  <input type="number" value={addForm.floor} onChange={e => setAddForm(f => ({ ...f, floor: Number(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b]" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">النوع</label>
                  <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b] bg-white">
                    {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addRoom} disabled={saving}
                  className="flex items-center gap-2 bg-[#1a3a6b] text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
                  <Save className="w-4 h-4" /> حفظ
                </button>
                <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">إلغاء</button>
              </div>
            </div>
          )}

          {/* فلتر النوع */}
          <div className="flex gap-2 flex-wrap">
            {['', ...ROOM_TYPES].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${typeFilter === t ? 'bg-[#1a3a6b] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}`}>
                {t || 'الكل'}
              </button>
            ))}
          </div>

          {/* جدول القاعات */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الرمز</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">القاعة</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">النوع</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الطاقة</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الطابق</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(room => (
                  <tr key={room.id}>
                    {editingId === room.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input value={editForm.code} onChange={e => setEditForm(f => ({ ...f, code: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none" placeholder="R001" />
                        </td>
                        <td className="px-4 py-2">
                          <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-[#1a3a6b]" />
                        </td>
                        <td className="px-4 py-2">
                          <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none">
                            {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" value={editForm.capacity} onChange={e => setEditForm(f => ({ ...f, capacity: Number(e.target.value) }))}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none" />
                        </td>
                        <td className="px-4 py-2">
                          <input type="number" value={editForm.floor} onChange={e => setEditForm(f => ({ ...f, floor: Number(e.target.value) }))}
                            className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none" />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-2">
                            <button onClick={saveEdit} className="text-green-600 hover:text-green-700"><CheckCircle className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500 bg-gray-50">{room.code}</td>
                        <td className="px-4 py-3 font-medium text-gray-800">{room.name}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            room.type === 'مدرج' ? 'bg-purple-100 text-purple-700' :
                            room.type === 'قاعة محاضرات' ? 'bg-blue-100 text-blue-700' :
                            room.type === 'مخبر' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{room.type}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{toArabicNum(room.capacity)} مقعد</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">الطابق {toArabicNum(room.floor)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={() => { setEditingId(room.id); setEditForm({ code: room.code || '', name: room.name, capacity: room.capacity, floor: room.floor, type: room.type, is_active: room.is_active }); }}
                              className="text-gray-400 hover:text-[#1a3a6b] transition-colors"><Pencil className="w-4 h-4" /></button>
                            <button onClick={() => deleteRoom(room.id)}
                              className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-center py-10 text-gray-400 text-sm">لا توجد قاعات — أضف من Excel أو يدوياً</p>
            )}
          </div>

          {/* تعليمات Excel */}
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
            <strong>تنسيق ملف Excel:</strong> العمود A = الرمز (R001) | B = اسم القاعة | C = الطاقة | D = الطابق | E = النوع (مدرج / قاعة محاضرات / قاعة / مخبر)
          </div>
        </>
      )}

      {/* ── تبويب حالة القاعات ─────────────────────────────────────────── */}
      {activeTab === 'status' && (
        <>
          <div>
            <h2 className="text-xl font-bold text-gray-900 font-display">حالة القاعات</h2>
            <p className="text-gray-500 text-sm mt-0.5">الجدول الزمني الحالي — السنة الجامعية 2026-2027 · السداسي الأول</p>
          </div>
          <RoomStatus rooms={rooms} />
        </>
      )}
    </div>
  );
}
