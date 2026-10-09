import { useState, useEffect, useRef } from 'react';
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
  const [viewMode, setViewMode] = useState<'cards' | 'classic'>('cards');
  const printRef = useRef<HTMLDivElement>(null);

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

    const { data: allAssignments } = await supabase.from('assignments')
      .select('id, module_id, teaching_type, section_number, group_number, professor_id')
      .eq('level_id', selectedLevel)
      .eq('section_number', selectedSection)
      .eq('academic_year', '2026-2027')
      .eq('semester', 1);

    if (!allAssignments || allAssignments.length === 0) { setRows([]); setLoading(false); return; }

    const filtered = allAssignments.filter((a: any) => {
      if (a.teaching_type === 'محاضرة') return true;
      if (!selectedGroup) return true;
      return a.group_number === selectedGroup;
    });

    const allIds = filtered.map((a: any) => a.id);
    const moduleIds = [...new Set(filtered.map((a: any) => a.module_id))];
    const profIds = [...new Set(filtered.map((a: any) => a.professor_id).filter(Boolean))];

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

    // فقط الحصص المبرمجة
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
      };
    }).filter(Boolean);

    const dayOrder = Object.fromEntries(DAYS.map((d, i) => [d, i]));
    scheduledRows.sort((a: any, b: any) => {
      const di = (dayOrder[a.day] ?? 99) - (dayOrder[b.day] ?? 99);
      return di !== 0 ? di : a.slot_number - b.slot_number;
    });

    setRows(scheduledRows);
    setLoading(false);
  }

  useEffect(() => {
    if (selectedLevel && selectedSection) loadSchedule();
  }, [selectedLevel, selectedSection, selectedGroup, timeSlots]);

  const byDay = DAYS.map(day => ({
    day,
    slots: rows.filter((s: any) => s.day === day).sort((a: any, b: any) => a.slot_number - b.slot_number),
  })).filter(d => d.slots.length > 0);

  // جميع أوقات الحصص الفريدة للجدول الكلاسيكي
  const uniqueSlots = [...new Map(
    rows.filter((r: any) => r.start_time).map((r: any) => [
      `${r.start_time}-${r.end_time}`,
      { start_time: r.start_time, end_time: r.end_time, slot_number: r.slot_number }
    ])
  ).values()].sort((a, b) => a.slot_number - b.slot_number);

  const levelName = levels.find(l => l.id === selectedLevel)?.name_ar || '';

  function handlePrint() {
    const title = `${levelName} — م${String(selectedSection).padStart(2,'0')}${selectedGroup ? ` — ف${String(selectedGroup).padStart(2,'0')}` : ''}`;

    const cardsHtml = byDay.map(({ day, slots }) => `
      <div style="margin-bottom:16px;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
        <div style="background:#1a3a6b;padding:10px 16px">
          <strong style="color:#fff;font-size:14px">${day}</strong>
        </div>
        ${slots.map(s => `
          <div style="display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:1px solid #f3f4f6">
            <div style="min-width:100px;text-align:center">
              <span style="color:#1a3a6b;font-weight:bold;font-size:13px">${s.start_time} — ${s.end_time}</span>
            </div>
            <div style="width:1px;height:36px;background:#e5e7eb"></div>
            <div style="flex:1">
              <p style="font-weight:bold;margin:0 0 4px;font-size:13px">${s.module_name}</p>
              <p style="color:#6b7280;font-size:12px;margin:0">
                ${s.prof_name !== '—' ? `أ. ${s.prof_name}` : '—'} • ${s.room} •
                <span style="background:${s.teaching_type === 'محاضرة' ? '#eff6ff' : '#f0fdfa'};color:${s.teaching_type === 'محاضرة' ? '#2563eb' : '#0d9488'};padding:1px 8px;border-radius:20px">
                  ${s.teaching_type === 'محاضرة' ? `محاضرة — م${String(s.section).padStart(2,'0')}` : `أعمال موجهة — ف${String(s.group).padStart(2,'0')}`}
                </span>
              </p>
            </div>
          </div>
        `).join('')}
      </div>
    `).join('');

    const classicRows = uniqueSlots.map(slot => {
      const cells = DAYS.map(day => {
        const entry = rows.find((r: any) => r.day === day && r.start_time === slot.start_time && r.end_time === slot.end_time);
        if (!entry) return '<td style="border:1px solid #e5e7eb;padding:8px;text-align:center;color:#d1d5db">—</td>';
        return `<td style="border:1px solid #e5e7eb;padding:8px;text-align:center;font-size:12px">
          <strong>${entry.module_name}</strong><br>
          <span style="color:#6b7280">${entry.prof_name !== '—' ? `أ. ${entry.prof_name}` : ''}</span><br>
          <span style="color:#1a3a6b">${entry.room}</span>
        </td>`;
      }).join('');
      return `<tr>
        <td style="border:1px solid #e5e7eb;padding:8px;text-align:center;font-weight:bold;font-size:12px;background:#f8fafc;white-space:nowrap">${slot.start_time}<br>${slot.end_time}</td>
        ${cells}
      </tr>`;
    }).join('');

    const classicHtml = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#1a3a6b;color:#fff">
            <th style="border:1px solid #1a3a6b;padding:10px;text-align:center">الوقت</th>
            ${DAYS.map(d => `<th style="border:1px solid #1a3a6b;padding:10px;text-align:center">${d}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${classicRows}</tbody>
      </table>
    `;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  body { font-family: Arial, Tahoma, sans-serif; margin: 20px; color: #1f2937; direction: rtl; }
  h1 { color: #1a3a6b; font-size: 18px; margin-bottom: 4px; }
  p { color: #6b7280; font-size: 13px; margin-bottom: 16px; }
  @media print { body { margin: 10px; } }
</style>
</head>
<body>
<h1>التوقيت الأسبوعي — ${title}</h1>
<p>كلية الحقوق والعلوم السياسية — الموسم الجامعي 2026/2027</p>
${viewMode === 'cards' ? cardsHtml : classicHtml}
<p style="margin-top:20px;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px">تحت إشراف نائب العميد د. عشاش حمزة</p>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  }

  const hasData = !loading && selectedLevel && selectedSection > 0 && selectedGroup > 0 && rows.length > 0;

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

        {hasData && (
          <div className="space-y-4">
            {/* شريط الأدوات */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* تبديل العرض */}
              <div className="flex gap-1 bg-white/10 p-1 rounded-xl">
                <button
                  onClick={() => setViewMode('cards')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'cards' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-white/70 hover:text-white'}`}>
                  <span>🗂️</span> بطاقات
                </button>
                <button
                  onClick={() => setViewMode('classic')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${viewMode === 'classic' ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-white/70 hover:text-white'}`}>
                  <span>📊</span> جدول كلاسيكي
                </button>
              </div>

              {/* زر PDF */}
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#b8911f] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg">
                <span>📄</span> تحميل PDF
              </button>
            </div>

            {/* عرض البطاقات */}
            {viewMode === 'cards' && (
              <div className="space-y-4">
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
              </div>
            )}

            {/* العرض الكلاسيكي */}
            {viewMode === 'classic' && (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse" style={{ minWidth: '600px' }}>
                    <thead>
                      <tr className="bg-[#1a3a6b] text-white">
                        <th className="border border-[#1a3a6b]/30 px-3 py-3 text-center font-bold">الوقت</th>
                        {DAYS.map(day => (
                          <th key={day} className="border border-[#1a3a6b]/30 px-3 py-3 text-center font-bold">{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uniqueSlots.map((slot, idx) => (
                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                          <td className="border border-gray-200 px-2 py-3 text-center font-bold text-[#1a3a6b] whitespace-nowrap bg-slate-50">
                            <p className="text-xs">{slot.start_time}</p>
                            <p className="text-xs text-gray-400">{slot.end_time}</p>
                          </td>
                          {DAYS.map(day => {
                            const entry = rows.find((r: any) => r.day === day && r.start_time === slot.start_time && r.end_time === slot.end_time);
                            if (!entry) return (
                              <td key={day} className="border border-gray-200 px-2 py-3 text-center text-gray-200">—</td>
                            );
                            return (
                              <td key={day} className="border border-gray-200 px-2 py-3 text-center">
                                <p className="font-bold text-gray-800 leading-tight mb-1">{entry.module_name}</p>
                                {entry.prof_name !== '—' && (
                                  <p className="text-gray-500 text-[11px] mb-0.5">أ. {entry.prof_name}</p>
                                )}
                                <p className="text-[#1a3a6b] text-[11px] font-medium">{entry.room}</p>
                                <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${entry.teaching_type === 'محاضرة' ? 'bg-blue-50 text-blue-600' : 'bg-teal-50 text-teal-600'}`}>
                                  {entry.teaching_type === 'محاضرة' ? 'م' : 'ت.م'}
                                </span>
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
