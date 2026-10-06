import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

export default function TimetablePage() {
  const [levels, setLevels] = useState<any[]>([]);
  const [sections, setSections] = useState<number[]>([]);
  const [groups, setGroups] = useState<number[]>([]);
  const [selectedLevel, setSelectedLevel] = useState('');
  const [selectedSection, setSelectedSection] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const LEVEL_ORDER = [
      'أولى ليسانس',
      'ثانية ليسانس',
      'ثالثة ليسانس قانون خاص',
      'ثالثة ليسانس قانون عام',
      'ماستر 1 قانون أعمال', 'ماستر 2 قانون أعمال',
      'ماستر 1 قانون جنائي', 'ماستر 2 قانون جنائي',
      'ماستر 1 قانون الإعلام الآلي والإنترنت', 'ماستر 2 قانون الإعلام الآلي والإنترنت',
      'ماستر 1 قانون الصحة', 'ماستر 2 قانون الصحة',
      'ماستر 1 قانون عقاري',
      'ماستر 1 قانون التهيئة والتعمير', 'ماستر 2 قانون التهيئة والتعمير',
      'ماستر 1 قانون عام', 'ماستر 2 قانون عام',
      'ماستر 1 قانون خاص', 'ماستر 2 قانون خاص',
    ];
    supabase.from('levels').select('id, name_ar').order('name_ar')
      .then(({ data }) => {
        if (data) setLevels([...data].sort((a, b) => LEVEL_ORDER.indexOf(a.name_ar) - LEVEL_ORDER.indexOf(b.name_ar)));
      });
    supabase.from('time_slots').select('*').order('day').order('slot_number')
      .then(({ data }) => { if (data) setTimeSlots(data); });
  }, []);

  async function loadSections(levelId: string) {
    const { data } = await supabase.from('level_semesters')
      .select('num_sections, num_groups').eq('level_id', levelId).eq('semester', 1).single();
    if (data) {
      setSections(Array.from({ length: data.num_sections }, (_, i) => i + 1));
      setGroups([]);
    }
  }

  function loadGroups(sec: number, autoSelect = false) {
    supabase.from('level_semesters')
      .select('num_groups').eq('level_id', selectedLevel).eq('semester', 1).single()
      .then(({ data }) => {
        if (data) {
          const start = (sec - 1) * data.num_groups + 1;
          const end = sec * data.num_groups;
          const grps = Array.from({ length: end - start + 1 }, (_, i) => start + i);
          setGroups(grps);
          if (autoSelect && grps.length > 0) setSelectedGroup(grps[0]);
        }
      });
  }

  async function loadSchedule() {
    if (!selectedLevel || !selectedSection) return;
    setLoading(true);

    // جلب كل إسنادات المستوى والمجموعة (محاضرات + أعمال موجهة)
    const { data: allAssignments } = await supabase.from('assignments')
      .select('id, module_id, teaching_type, section_number, group_number, professor_id')
      .eq('level_id', selectedLevel)
      .eq('section_number', selectedSection)
      .eq('academic_year', '2026-2027')
      .eq('semester', 1);

    if (!allAssignments || allAssignments.length === 0) { setRows([]); setLoading(false); return; }

    // فلترة الأعمال الموجهة حسب الفوج إن كان محدداً
    const filtered = allAssignments.filter((a: any) => {
      if (a.teaching_type === 'محاضرة') return true;
      if (!selectedGroup) return true; // إن لم يختر فوجاً اعرض كل TD
      return a.group_number === selectedGroup;
    });

    const allIds = filtered.map((a: any) => a.id);
    const moduleIds = [...new Set(filtered.map((a: any) => a.module_id))];
    const profIds = [...new Set(filtered.map((a: any) => a.professor_id).filter(Boolean))];

    // جلب الحصص المبرمجة
    const { data: sch } = await supabase.from('schedules')
      .select('id, assignment_id, time_slot_id, room_id')
      .in('assignment_id', allIds)
      .eq('academic_year', '2026-2027')
      .eq('semester', 1);

    const roomIds = [...new Set((sch || []).map((s: any) => s.room_id).filter(Boolean))];

    const [{ data: modules }, { data: rooms }, { data: profs }] = await Promise.all([
      supabase.from('modules').select('id, name_ar').in('id', moduleIds),
      roomIds.length > 0 ? supabase.from('rooms').select('id, name').in('id', roomIds) : Promise.resolve({ data: [] }),
      profIds.length > 0 ? supabase.from('professors').select('id, last_name, first_name').in('id', profIds) : Promise.resolve({ data: [] }),
    ]);

    const modMap = new Map((modules || []).map((m: any) => [m.id, m.name_ar]));
    const roomMap = new Map((rooms || []).map((r: any) => [r.id, r.name]));
    const profMap = new Map((profs || []).map((p: any) => [p.id, `${p.last_name} ${p.first_name}`]));
    const tsMap = new Map(timeSlots.map(ts => [ts.id, ts]));

    // بناء الصفوف — كل حصة في schedules = صف منفصل
    const scheduledRows: any[] = (sch || []).map((s: any) => {
      const a = filtered.find((x: any) => x.id === s.assignment_id);
      if (!a) return null;
      const ts = tsMap.get(s.time_slot_id);
      return {
        id: s.id,
        module_name: modMap.get(a.module_id) || '—',
        teaching_type: a.teaching_type,
        section: a.section_number,
        group: a.group_number,
        prof_name: a.professor_id ? (profMap.get(a.professor_id) || '—') : '—',
        room: roomMap.get(s.room_id) || '—',
        day: ts?.day || null,
        start_time: ts?.start_time?.slice(0, 5) || null,
        end_time: ts?.end_time?.slice(0, 5) || null,
        slot_number: ts?.slot_number || 9999,
        scheduled: true,
      };
    }).filter(Boolean);

    // الإسنادات غير المبرمجة
    const scheduledAssignmentIds = new Set((sch || []).map((s: any) => s.assignment_id));
    const unscheduledRows: any[] = filtered
      .filter((a: any) => !scheduledAssignmentIds.has(a.id))
      .map((a: any) => ({
        id: a.id,
        module_name: modMap.get(a.module_id) || '—',
        teaching_type: a.teaching_type,
        section: a.section_number,
        group: a.group_number,
        prof_name: a.professor_id ? (profMap.get(a.professor_id) || '—') : '—',
        room: '—',
        day: null,
        start_time: null,
        end_time: null,
        slot_number: 9999,
        scheduled: false,
      }));

    const result = [...scheduledRows, ...unscheduledRows];

    const dayOrder = Object.fromEntries(DAYS.map((d, i) => [d, i]));
    scheduledRows.sort((a: any, b: any) => {
      const di = (dayOrder[a.day] ?? 99) - (dayOrder[b.day] ?? 99);
      return di !== 0 ? di : a.slot_number - b.slot_number;
    });

    setRows(result);
    setLoading(false);
  }

  useEffect(() => {
    if (selectedLevel && selectedSection) loadSchedule();
  }, [selectedLevel, selectedSection, selectedGroup, timeSlots]);

  const scheduled = rows.filter((r: any) => r.scheduled);
  const unscheduled = rows.filter((r: any) => !r.scheduled);
  const byDay = DAYS.map(day => ({
    day,
    slots: scheduled.filter((s: any) => s.day === day).sort((a: any, b: any) => a.slot_number - b.slot_number),
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
        </div>

        {/* فلاتر */}
        <div className="bg-white rounded-2xl p-5 mb-6 shadow-xl">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">المستوى</label>
              <select value={selectedLevel} onChange={e => {
                setSelectedLevel(e.target.value);
                setSelectedSection(0);
                setSelectedGroup(0);
                setRows([]);
                loadSections(e.target.value);
              }} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30">
                <option value="">— المستوى —</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">المجموعة</label>
              <select value={selectedSection} onChange={e => {
                const sec = Number(e.target.value);
                setSelectedSection(sec);
                setSelectedGroup(0);
                if (sec) loadGroups(sec, true);
              }} disabled={!selectedLevel}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 disabled:opacity-50">
                <option value={0}>— المجموعة —</option>
                {sections.map(s => <option key={s} value={s}>م{String(s).padStart(2,'0')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block font-medium">الفوج (للأعمال الموجهة)</label>
              <select value={selectedGroup} onChange={e => setSelectedGroup(Number(e.target.value))}
                disabled={!selectedSection}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 disabled:opacity-50">
                <option value={0}>— الفوج —</option>
                {groups.map(g => <option key={g} value={g}>ف{String(g).padStart(2,'0')}</option>)}
              </select>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && selectedLevel && selectedSection > 0 && selectedGroup > 0 && rows.length > 0 && (
          <div className="space-y-4">
            {/* الحصص المبرمجة */}
            {byDay.map(({ day, slots }) => (
              <div key={day} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-[#1a3a6b] px-5 py-3">
                  <h3 className="text-white font-bold text-sm">{day}</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {slots.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-4 px-5 py-4">
                      <div className="text-center min-w-[110px]">
                        <p className="text-[#1a3a6b] font-bold text-sm">{s.start_time} — {s.end_time}</p>
                      </div>
                      <div className="w-px h-10 bg-gray-200" />
                      <div className="flex-1">
                        <p className="font-bold text-gray-800 text-sm">{s.module_name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-500">
                          <span>{s.prof_name !== '—' ? `أ. ${s.prof_name}` : '—'}</span>
                          <span>•</span>
                          <span>{s.room}</span>
                          <span>•</span>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${s.teaching_type === 'محاضرة' ? 'bg-blue-50 text-blue-600' : 'bg-teal-50 text-teal-600'}`}>
                            {s.teaching_type === 'محاضرة' ? `محاضرة — م${String(s.section).padStart(2,'0')}` : `أعمال موجهة — ف${String(s.group).padStart(2,'0')}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* غير المبرمجة — تظهر كصفوف عادية بـ — */}
            {unscheduled.length > 0 && (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="bg-gray-500 px-5 py-3">
                  <h3 className="text-white font-bold text-sm">—</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {unscheduled.map((s: any) => (
                    <div key={s.id} className="flex items-center gap-4 px-5 py-4 opacity-60">
                      <div className="text-center min-w-[110px]">
                        <p className="text-gray-400 font-bold text-sm">— • —</p>
                      </div>
                      <div className="w-px h-10 bg-gray-200" />
                      <div className="flex-1">
                        <p className="font-bold text-gray-700 text-sm">{s.module_name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-gray-400">
                          <span>{s.prof_name !== '—' ? `أ. ${s.prof_name}` : '—'}</span>
                          <span>•</span>
                          <span>—</span>
                          <span>•</span>
                          <span className={`px-2 py-0.5 rounded-full font-medium ${s.teaching_type === 'محاضرة' ? 'bg-blue-50 text-blue-400' : 'bg-teal-50 text-teal-400'}`}>
                            {s.teaching_type === 'محاضرة' ? `محاضرة — م${String(s.section).padStart(2,'0')}` : `أعمال موجهة — ف${String(s.group).padStart(2,'0')}`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white/10 rounded-2xl p-4 text-center">
              <p className="text-white text-sm font-medium">{levelName} — المجموعة {String(selectedSection).padStart(2,'0')}{selectedGroup ? ` — الفوج ${String(selectedGroup).padStart(2,'0')}` : ''}</p>
              <p className="text-amber-300 text-xs mt-1">⚠ مقياس اللغة الأجنبية (الإنجليزية) سيُجرى عن بُعد</p>
            </div>
          </div>
        )}

        {!loading && selectedLevel && selectedSection > 0 && selectedGroup > 0 && rows.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-400">
            لا توجد إسنادات لهذه المجموعة
          </div>
        )}

        <p className="text-center text-gray-500 text-xs mt-6">تحت إشراف نائب العميد د. عشاش حمزة</p>
      </div>
    </div>
  );
}
