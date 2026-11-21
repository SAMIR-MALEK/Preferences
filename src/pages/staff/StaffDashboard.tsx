import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { GraduationCap, LogOut, Printer, Download, Search } from 'lucide-react';

// لوحة «مصلحة التدريس»: عرض وطباعة فقط — لا يوجد في هذه الصفحة أي إنشاء أو تعديل أو حذف،
// وقاعدة البيانات نفسها ترفض أي كتابة من هذه الحسابات.

const YEAR = '2026-2027';
type Tab = 'levels' | 'modules' | 'rooms' | 'professors' | 'timetable' | 'profschedule' | 'students' | 'insertions';
const TABS: { id: Tab; label: string }[] = [
  { id: 'levels', label: 'التخصصات والمجموعات' },
  { id: 'modules', label: 'المقاييس' },
  { id: 'rooms', label: 'القاعات' },
  { id: 'professors', label: 'الأساتذة' },
  { id: 'timetable', label: 'التوقيت' },
  { id: 'profschedule', label: 'برامج الأساتذة' },
  { id: 'students', label: 'الطلبة' },
  { id: 'insertions', label: 'الإدراجات في الأفواج' },
];
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

type Col = { key: string; label: string };

const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pad2 = (v: any) => (v == null || v === '' ? '—' : String(v).padStart(2, '0'));

function printRows(title: string, subtitle: string, cols: Col[], rows: any[]) {
  const w = window.open('', '_blank');
  if (!w) { alert('المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع'); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${esc(title)}</title>
  <style>
    @page{size:A4 landscape;margin:12mm}
    body{font-family:Arial,sans-serif;direction:rtl;color:#000;font-size:12px}
    .h{text-align:center;line-height:1.7;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px}
    .h b{font-size:14px}
    h1{text-align:center;font-size:17px;margin:6px 0}
    .s{text-align:center;color:#444;margin-bottom:8px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #444;padding:4px 6px;text-align:right;vertical-align:top}
    th{background:#e8ecf4}
    tr{page-break-inside:avoid}
  </style></head><body>
  <div class="h"><b>جامعة محمد البشير الإبراهيمي — برج بوعريريج</b><br><b>كلية الحقوق والعلوم السياسية</b></div>
  <h1>${esc(title)}</h1><div class="s">${esc(subtitle)} — ${rows.length} سجل</div>
  <table><thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

function downloadCsv(name: string, cols: Col[], rows: any[]) {
  const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + [cols.map(c => q(c.label)).join(','), ...rows.map(r => cols.map(c => q(r[c.key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function DataTable({ title, subtitle, cols, rows, extra }: {
  title: string; subtitle?: string; cols: Col[]; rows: any[]; extra?: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(200);
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r => cols.some(c => String(r[c.key] ?? '').toLowerCase().includes(t)));
  }, [rows, q, cols]);
  useEffect(() => { setLimit(200); }, [q, rows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث..."
            className="w-full bg-white border border-gray-200 rounded-xl pr-9 pl-3 py-2 text-sm outline-none focus:border-[#1a3a6b]" />
        </div>
        {extra}
        <button onClick={() => printRows(title, subtitle || '', cols, filtered)}
          className="flex items-center gap-1.5 bg-[#1a3a6b] text-white rounded-xl px-3 py-2 text-xs font-bold">
          <Printer className="w-3.5 h-3.5" /> طباعة
        </button>
        <button onClick={() => downloadCsv(title, cols, filtered)}
          className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl px-3 py-2 text-xs font-bold">
          <Download className="w-3.5 h-3.5" /> تصدير
        </button>
      </div>
      <p className="text-xs text-gray-500">{filtered.length} سجل</p>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 text-gray-500">
              {cols.map(c => <th key={c.key} className="text-right font-bold px-3 py-2 whitespace-nowrap">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((r, i) => (
              <tr key={r.id ?? i} className="border-t border-gray-50">
                {cols.map(c => <td key={c.key} className="px-3 py-2 text-gray-800 align-top">{String(r[c.key] ?? '—')}</td>)}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={cols.length} className="text-center text-gray-400 py-8">لا توجد بيانات</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > limit && (
        <button onClick={() => setLimit(l => l + 200)}
          className="w-full bg-white border border-gray-200 rounded-xl py-2 text-xs text-[#1a3a6b] font-bold">
          عرض المزيد ({filtered.length - limit} متبقٍّ) — الطباعة والتصدير يشملان الكل
        </button>
      )}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder: string;
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none max-w-full">
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function StaffDashboard() {
  const { user, signOut } = useAuth();
  const staff = user?.staff;
  const dept = staff?.department || null;     // null = الكلية كلها
  const [tab, setTab] = useState<Tab>('levels');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [levels, setLevels] = useState<any[]>([]);
  const [levelSems, setLevelSems] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [profs, setProfs] = useState<any[]>([]);
  const [sched, setSched] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [insertions, setInsertions] = useState<any[]>([]);

  // فلاتر
  const [fLevel, setFLevel] = useState('');
  const [fSem, setFSem] = useState('1');
  const [fProf, setFProf] = useState('');
  const [fSpec, setFSpec] = useState('');
  const [fSection, setFSection] = useState('');
  const [fGroup, setFGroup] = useState('');

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  async function loadAll() {
    setLoading(true); setError('');
    try {
      const [lv, ls, md, rm, pr, sc, st, ins] = await Promise.all([
        supabase.from('levels').select('id, code, name_ar, department, degree_type, speciality').order('display_order'),
        supabase.from('level_semesters').select('level_id, semester, num_sections, num_groups'),
        supabase.from('modules').select('id, level_id, code, name_ar, semester, has_lectures, has_td, is_active, display_order').order('display_order'),
        supabase.from('rooms').select('id, name, code, capacity, floor, type, is_active').order('name'),
        supabase.from('professors').select('id, last_name, first_name, rank, degree_speciality, email, phone, is_active').order('last_name'),
        supabase.from('schedules').select(`id, semester, status, custom_module, custom_professor,
          assignment:assignments ( id, teaching_type, section_number, group_number, professor_id,
            module:modules ( name_ar ), level:levels ( id, name_ar, code, department ),
            professor:professors ( last_name, first_name ) ),
          time_slot:time_slots ( day, start_time, end_time, slot_number ), room:rooms ( name )`)
          .eq('academic_year', YEAR).limit(5000),
        supabase.rpc('sv_students'),
        supabase.rpc('sv_insertions'),
      ]);
      const firstErr = [lv, ls, md, rm, pr, sc, st, ins].find((r: any) => r.error);
      if (firstErr) throw (firstErr as any).error;
      const inScope = (d: string | null | undefined) => !dept || d === dept;
      const lvls = (lv.data || []).filter((l: any) => inScope(l.department));
      const ids = new Set(lvls.map((l: any) => l.id));
      setLevels(lvls);
      setLevelSems((ls.data || []).filter((x: any) => ids.has(x.level_id)));
      setModules((md.data || []).filter((m: any) => ids.has(m.level_id)));
      setRooms(rm.data || []);
      setProfs(pr.data || []);
      setSched((sc.data || []) as any[]);
      setStudents((st.data as any[]) || []);
      setInsertions((ins.data as any[]) || []);
    } catch (e: any) {
      setError('تعذّر تحميل البيانات: ' + (e?.message || ''));
    }
    setLoading(false);
  }

  const levelName = useMemo(() => new Map(levels.map(l => [l.id, l.name_ar])), [levels]);
  const levelOpts = levels.map(l => ({ value: l.id, label: l.name_ar }));
  const specOpts = [...new Set(students.map(s => s.specialite).filter(Boolean))].sort().map(s => ({ value: s, label: s }));
  const scopeLabel = dept ? `قسم القانون ${dept}` : 'جميع الأقسام';

  // ── صفوف كل تبويب ──
  const levelRows = useMemo(() => levels.map(l => {
    const s1 = levelSems.find(x => x.level_id === l.id && x.semester === 1);
    const s2 = levelSems.find(x => x.level_id === l.id && x.semester === 2);
    return {
      id: l.id, code: l.code, name: l.name_ar, dept: l.department, type: l.degree_type,
      s1: s1 ? `${s1.num_sections} مجموعة × ${s1.num_groups} فوج` : '—',
      s2: s2 ? `${s2.num_sections} مجموعة × ${s2.num_groups} فوج` : '—',
    };
  }), [levels, levelSems]);

  const moduleRows = useMemo(() => modules
    .filter(m => (!fLevel || m.level_id === fLevel) && (!fSem || String(m.semester) === fSem))
    .map(m => ({
      id: m.id, level: levelName.get(m.level_id) || '—', code: m.code, name: m.name_ar, sem: m.semester,
      kinds: [m.has_lectures ? 'محاضرة' : '', m.has_td ? 'أعمال موجهة' : ''].filter(Boolean).join(' + '),
      active: m.is_active === false ? 'غير نشط' : 'نشط',
    })), [modules, fLevel, fSem, levelName]);

  const roomRows = useMemo(() => rooms.map(r => ({
    id: r.id, name: r.name, code: r.code, capacity: r.capacity, floor: r.floor, type: r.type,
    active: r.is_active === false ? 'غير نشطة' : 'نشطة',
  })), [rooms]);

  const profRows = useMemo(() => profs.map(p => ({
    id: p.id, name: `${p.last_name || ''} ${p.first_name || ''}`.trim(), rank: p.rank, spec: p.degree_speciality,
    email: p.email, phone: p.phone, active: p.is_active === false ? 'غير نشط' : 'نشط',
  })), [profs]);

  // صفوف التوقيت (محاضرات عن بعد: بلا وقت ولا قاعة)
  const schedRows = useMemo(() => sched.map((s: any) => {
    const a = s.assignment;
    const ts = s.time_slot;
    const prof = a?.professor ? `${a.professor.last_name || ''} ${a.professor.first_name || ''}`.trim() : (s.custom_professor || '—');
    return {
      id: s.id, levelId: a?.level?.id || '', profId: a?.professor_id || '', sem: s.semester,
      level: a?.level?.name_ar || '—',
      day: ts?.day || 'عن بعد', order: ts?.slot_number ?? 99,
      time: ts ? `${String(ts.start_time).slice(0, 5)} — ${String(ts.end_time).slice(0, 5)}` : 'عن بعد',
      module: a?.module?.name_ar || s.custom_module || '—',
      kind: a?.teaching_type || '—',
      sg: a ? (a.teaching_type === 'محاضرة' ? `م${pad2(a.section_number)}` : `ف${pad2(a.group_number)}`) : '—',
      prof, room: s.room?.name || 'عن بعد',
    };
  }), [sched]);

  const sortSched = (arr: any[]) => [...arr].sort((a, b) =>
    (DAYS.indexOf(a.day) < 0 ? 99 : DAYS.indexOf(a.day)) - (DAYS.indexOf(b.day) < 0 ? 99 : DAYS.indexOf(b.day)) || a.order - b.order);

  const timetableRows = useMemo(() => sortSched(schedRows.filter(r =>
    (!fSem || String(r.sem) === fSem) && (!fLevel || r.levelId === fLevel))), [schedRows, fSem, fLevel]);

  const profOpts = profs.map(p => ({ value: p.id, label: `${p.last_name || ''} ${p.first_name || ''}`.trim() }));
  const profSchedRows = useMemo(() => fProf ? sortSched(schedRows.filter(r =>
    r.profId === fProf && (!fSem || String(r.sem) === fSem))) : [], [schedRows, fProf, fSem]);

  const studentRows = useMemo(() => students
    .filter(s => (!fSpec || s.specialite === fSpec) && (!fSection || String(s.section) === fSection) && (!fGroup || String(s.groupe) === fGroup))
    .map(s => ({
      id: s.id, mat: s.mat_etudiant, name: `${s.last_name || ''} ${s.first_name || ''}`.trim(), spec: s.specialite,
      section: pad2(s.section), group: pad2(s.groupe), sit: s.sit_ins, since: s.groupe_since || '',
    })), [students, fSpec, fSection, fGroup]);

  const insRows = useMemo(() => insertions.map(i => ({
    id: i.id, name: `${i.last_name || ''} ${i.first_name || ''}`.trim(), mat: i.mat_etudiant, spec: i.specialite,
    from: `م${pad2(i.from_section)} / ف${pad2(i.from_groupe)}`, to: `م${pad2(i.to_section)} / ف${pad2(i.to_groupe)}`,
    date: i.effective_date || '', note: i.note || '', by: i.created_by || '',
  })), [insertions]);

  const semSelect = (
    <Select value={fSem} onChange={setFSem} placeholder="كل السداسيات"
      options={[{ value: '1', label: 'السداسي 1' }, { value: '2', label: 'السداسي 2' }]} />
  );
  const sectionGroupSelects = (
    <>
      <Select value={fSection} onChange={setFSection} placeholder="كل المجموعات"
        options={[...new Set(students.map(s => s.section).filter(v => v != null))].sort((a, b) => a - b).map(v => ({ value: String(v), label: 'مجموعة ' + pad2(v) }))} />
      <Select value={fGroup} onChange={setFGroup} placeholder="كل الأفواج"
        options={[...new Set(students.map(s => s.groupe).filter(v => v != null))].sort((a, b) => a - b).map(v => ({ value: String(v), label: 'فوج ' + pad2(v) }))} />
    </>
  );

  return (
    <div className="min-h-screen bg-[#eef1f7]" dir="rtl">
      <header className="bg-gradient-to-l from-[#0d2040] to-[#1a3a6b] text-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#c9a227] flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm truncate">{staff?.full_name}</p>
              <p className="text-[#c9a227] text-[11px] truncate">{staff?.service} — {YEAR} — عرض فقط</p>
            </div>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white flex-shrink-0">
            <LogOut className="w-4 h-4" /> خروج
          </button>
        </div>
        <div className="max-w-6xl mx-auto px-4 pb-2 overflow-x-auto">
          <div className="flex gap-1.5 w-max">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${tab === t.id ? 'bg-[#c9a227] text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4">
        {loading && <p className="text-center text-gray-400 text-sm py-16">جارٍ التحميل...</p>}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
            <button onClick={loadAll} className="block mt-2 text-xs underline">إعادة المحاولة</button>
          </div>
        )}
        {!loading && !error && (
          <>
            {tab === 'levels' && <DataTable title="التخصصات والمجموعات" subtitle={scopeLabel} rows={levelRows}
              cols={[{ key: 'code', label: 'الرمز' }, { key: 'name', label: 'المستوى / التخصص' }, { key: 'dept', label: 'القسم' },
                { key: 'type', label: 'الطور' }, { key: 's1', label: 'السداسي 1' }, { key: 's2', label: 'السداسي 2' }]} />}

            {tab === 'modules' && <DataTable title="المقاييس" subtitle={scopeLabel} rows={moduleRows}
              extra={<><Select value={fLevel} onChange={setFLevel} placeholder="كل المستويات" options={levelOpts} />{semSelect}</>}
              cols={[{ key: 'level', label: 'المستوى' }, { key: 'code', label: 'الرمز' }, { key: 'name', label: 'المقياس' },
                { key: 'sem', label: 'السداسي' }, { key: 'kinds', label: 'النوع' }, { key: 'active', label: 'الحالة' }]} />}

            {tab === 'rooms' && <DataTable title="القاعات" rows={roomRows}
              cols={[{ key: 'name', label: 'القاعة' }, { key: 'code', label: 'الرمز' }, { key: 'capacity', label: 'السعة' },
                { key: 'floor', label: 'الطابق' }, { key: 'type', label: 'النوع' }, { key: 'active', label: 'الحالة' }]} />}

            {tab === 'professors' && <DataTable title="الأساتذة" rows={profRows}
              cols={[{ key: 'name', label: 'اللقب والاسم' }, { key: 'rank', label: 'الرتبة' }, { key: 'spec', label: 'التخصص' },
                { key: 'email', label: 'البريد' }, { key: 'phone', label: 'الهاتف' }, { key: 'active', label: 'الحالة' }]} />}

            {tab === 'timetable' && <DataTable title="التوقيت" subtitle={`${scopeLabel} — ${fLevel ? levelName.get(fLevel) : 'كل المستويات'}`} rows={timetableRows}
              extra={<><Select value={fLevel} onChange={setFLevel} placeholder="كل المستويات" options={levelOpts} />{semSelect}</>}
              cols={[{ key: 'level', label: 'المستوى' }, { key: 'day', label: 'اليوم' }, { key: 'time', label: 'التوقيت' },
                { key: 'module', label: 'المقياس' }, { key: 'kind', label: 'النوع' }, { key: 'sg', label: 'م/ف' },
                { key: 'prof', label: 'الأستاذ' }, { key: 'room', label: 'القاعة' }]} />}

            {tab === 'profschedule' && (
              <DataTable title="برنامج أستاذ" subtitle={profOpts.find(p => p.value === fProf)?.label || 'اختر أستاذاً'} rows={profSchedRows}
                extra={<><Select value={fProf} onChange={setFProf} placeholder="— اختر أستاذاً —" options={profOpts} />{semSelect}</>}
                cols={[{ key: 'day', label: 'اليوم' }, { key: 'time', label: 'التوقيت' }, { key: 'level', label: 'المستوى' },
                  { key: 'module', label: 'المقياس' }, { key: 'kind', label: 'النوع' }, { key: 'sg', label: 'م/ف' }, { key: 'room', label: 'القاعة' }]} />
            )}

            {tab === 'students' && <DataTable title="قائمة الطلبة" subtitle={`${scopeLabel}${fSpec ? ' — ' + fSpec : ''}`} rows={studentRows}
              extra={<><Select value={fSpec} onChange={setFSpec} placeholder="كل التخصصات" options={specOpts} />{sectionGroupSelects}</>}
              cols={[{ key: 'mat', label: 'رقم التسجيل' }, { key: 'name', label: 'اللقب والاسم' }, { key: 'spec', label: 'التخصص' },
                { key: 'section', label: 'المجموعة' }, { key: 'group', label: 'الفوج' }, { key: 'sit', label: 'الوضعية' }, { key: 'since', label: 'مدرج في الفوج منذ' }]} />}

            {tab === 'insertions' && <DataTable title="الإدراجات في الأفواج" subtitle={scopeLabel} rows={insRows}
              cols={[{ key: 'date', label: 'التاريخ' }, { key: 'name', label: 'اللقب والاسم' }, { key: 'mat', label: 'رقم التسجيل' },
                { key: 'spec', label: 'التخصص' }, { key: 'from', label: 'من' }, { key: 'to', label: 'إلى' }, { key: 'note', label: 'ملاحظة' }, { key: 'by', label: 'سجّله' }]} />}
          </>
        )}
      </main>
    </div>
  );
}

