import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

export default function TimetablePage() {
  const [levels, setLevels] = useState<any[]>([]);
  const [sections, setSections] = useState<number[]>([]);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedSection, setSelectedSection] = useState(0);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('levels').select('id, name_ar')
      .in('name_ar', ['أولى ليسانس', 'ثانية ليسانس', 'ثالثة ليسانس قانون عام', 'ثالثة ليسانس قانون خاص'])
      .order('name_ar')
      .then(({ data }) => { if (data) setLevels(data); });

    supabase.from('time_slots').select('*').order('day').order('slot_number')
      .then(({ data }) => { if (data) setTimeSlots(data); });
  }, []);

  async function loadSections(levelId: string) {
    const { data } = await supabase.from('level_semesters')
      .select('num_sections').eq('level_id', levelId).eq('semester', 1).single();
    if (data) setSections(Array.from({ length: data.num_sections }, (_, i) => i + 1));
  }

  async function loadSchedule() {
    if (!selectedLevel || !selectedSection) return;
    setLoading(true);

    // جلب إسنادات المستوى والمجموعة أولاً
    const { data: assignments } = await supabase.from('assignments')
      .select('id, module_id, teaching_type, section_number, level_id')
      .eq('level_id', selectedLevel)
      .eq('section_number', selectedSection)
      .eq('teaching_type', 'محاضرة')
      .eq('academic_year', '2026-2027')
      .eq('semester', 1);

    if (!assignments || assignments.length === 0) { setSchedule([]); setLoading(false); return; }

    const assignmentIds = assignments.map((a: any) => a.id);

    // جلب الحصص من schedules
    const { data: sch } = await supabase.from('schedules')
      .select('id, assignment_id, time_slot_id, room_id')
      .in('assignment_id', assignmentIds)
      .eq('academic_year', '2026-2027')
      .eq('semester', 1);

    if (!sch || sch.length === 0) { setSchedule([]); setLoading(false); return; }

    // جلب المعلومات المرتبطة
    const moduleIds = [...new Set(assignments.map((a: any) => a.module_id))];
    const roomIds = [...new Set(sch.map((s: any) => s.room_id).filter(Boolean))];
    const profAssignmentIds = assignmentIds;

    const [{ data: modules }, { data: rooms }, { data: profs }] = await Promise.all([
      supabase.from('modules').select('id, name_ar').in('id', moduleIds),
      roomIds.length > 0 ? supabase.from('rooms').select('id, name').in('id', roomIds) : Promise.resolve({ data: [] }),
      supabase.from('assignments').select('id, professor:professors(last_name, first_name)').in('id', profAssignmentIds),
    ]);

    const modMap = new Map((modules || []).map((m: any) => [m.id, m.name_ar]));
    const roomMap = new Map((rooms || []).map((r: any) => [r.id, r.name]));
    const profMap = new Map((profs || []).map((a: any) => [a.id, a.professor]));
    const assignMap = new Map(assignments.map((a: any) => [a.id, a]));
    const tsMap = new Map(timeSlots.map(ts => [ts.id, ts]));

    const result = sch.map((s: any) => {
      const a = assignMap.get(s.assignment_id);
      const prof = profMap.get(s.assignment_id);
      const ts = tsMap.get(s.time_slot_id);
      return {
        id: s.id,
        ts,
        module_name: modMap.get(a?.module_id) || '—',
        prof_name: prof ? `${prof.last_name} ${prof.first_name}` : '—',
        room: roomMap.get(s.room_id) || '—',
      };
    }).filter((s: any) => s.ts);

    setSchedule(result);
    setLoading(false);
  }

  useEffect(() => {
    if (selectedLevel && selectedSection) loadSchedule();
  }, [selectedLevel, selectedSection, timeSlots]);

  const byDay = DAYS.map(day => ({
    day,
    slots: schedule
      .filter((s: any) => s.ts?.day === day)
      .sort((a: any, b: any) => a.ts?.slot_number - b.ts?.slot_number),
  })).filter(d => d.slots.length > 0);

  const levelName = levels.find(l => l.id === selectedLevel)?.name_ar || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1628] to-[#1a3a6b] py-8 px-4" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#c9a227] flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">📅</span>
          </div>
          <h1 className="text-white font-bold text-2xl">التوقيت الأسبوعي</h1>
          <p className="text-[#c9a227] text-sm mt-1">كلية الحقوق والعلوم السياسية — الموسم الجامعي 2026/2027</p>
          <p className="text-amber-300 text-xs mt-2 bg-amber-900/30 px-4 py-1.5 rounded-full inline-block">
            ⚠ التوقيت مؤقت وقابل للتغيير
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 mb-6 shadow-xl">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">المستوى</label>
              <select value={selectedLevel} onChange={e => {
                setSelectedLevel(e.target.value);
                setSelectedSection(0);
                setSchedule([]);
                loadSections(e.target.value);
              }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30">
                <option value="">— اختر المستوى —</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">المجموعة</label>
              <select value={selectedSection} onChange={e => setSelectedSection(Number(e.target.value))}
                disabled={!selectedLevel}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 disabled:opacity-50">
                <option value={0}>— اختر المجموعة —</option>
                {sections.map(s => <option key={s} value={s}>المجموعة {s.toString().padStart(2, '0')}</option>)}
              </select>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && selectedLevel && selectedSection > 0 && (
          <>
            {byDay.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-gray-400">
                لا يوجد توقيت مُدخَل بعد لهذه المجموعة
              </div>
            ) : (
              <div className="space-y-4">
                {byDay.map(({ day, slots }) => (
                  <div key={day} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-[#1a3a6b] px-5 py-3">
                      <h3 className="text-white font-bold text-sm">{day}</h3>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {slots.map((s: any) => (
                        <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                          <div className="text-center min-w-[80px]">
                            <p className="text-[#1a3a6b] font-bold text-sm">{s.ts?.start_time?.slice(0,5)}</p>
                            <p className="text-gray-400 text-xs">{s.ts?.end_time?.slice(0,5)}</p>
                          </div>
                          <div className="w-px h-10 bg-gray-200" />
                          <div className="flex-1">
                            <p className="font-bold text-gray-800 text-sm">{s.module_name}</p>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-xs text-[#1a3a6b] font-medium">{s.prof_name !== '—' ? `أ. ${s.prof_name}` : '—'}</span>
                              <span className="text-xs text-gray-400">•</span>
                              <span className="text-xs text-gray-500">{s.room}</span>
                              <span className="text-xs text-gray-400">•</span>
                              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">محاضرة</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="bg-white/10 rounded-2xl p-4 text-center">
                  <p className="text-white text-sm font-medium">{levelName} — المجموعة {String(selectedSection).padStart(2,'0')}</p>
                  <p className="text-gray-300 text-xs mt-1">الأعمال الموجهة: سيُعلَن عن توقيتها لاحقاً</p>
                  <p className="text-amber-300 text-xs mt-1">⚠ مقياس اللغة الأجنبية (الإنجليزية) سيُجرى عن بُعد</p>
                </div>
              </div>
            )}
          </>
        )}
        <p className="text-center text-gray-500 text-xs mt-6">تحت إشراف نائب العميد د. عشاش حمزة</p>
      </div>
    </div>
  );
}
