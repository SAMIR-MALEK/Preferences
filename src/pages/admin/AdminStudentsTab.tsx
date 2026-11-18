import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Upload, Download, RefreshCw, Edit2, Key, X, Check, UserCheck, Printer, KeyRound } from 'lucide-react';
import AdminMoodleImport from './AdminMoodleImport';
import { useAuth } from '../../hooks/useAuth';
import * as XLSX from 'xlsx';

const SPECIALITES = [
  'أولى ليسانس', 'ثانية ليسانس', 'ثالثة ليسانس قانون عام', 'ثالثة ليسانس قانون خاص',
  'ماستر 1 قانون أعمال', 'ماستر 1 قانون الإعلام الآلي والإنترنت', 'ماستر 1 قانون الصحة',
  'ماستر 1 قانون جنائي', 'ماستر 1 قانون عقاري',
  'ماستر 2 قانون الأعمال', 'ماستر 2 قانون الإعلام الآلي والإنترنت',
  'ماستر 2 قانون التهيئة والتعمير', 'ماستر 2 قانون الصحة', 'ماستر 2 قانون جنائي',
];

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
  username: string;
  email: string;
  section: number | null;
  groupe: number | null;
  groupe_since?: string | null;   // تاريخ الإدراج في الفوج (YYYY-MM-DD)
  created_at: string;
}

// تاريخ YYYY-MM-DD ← DD/MM/YYYY (بدون تحويل مناطق زمنية)
function fmtDate(d?: string | null): string {
  if (!d) return '';
  const [y, m, day] = String(d).slice(0, 10).split('-');
  return y && m && day ? `${day}/${m}/${y}` : String(d);
}
function todayISO(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export default function AdminStudentsTab() {
  const { user } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSpec, setFilterSpec] = useState('');
  const [filterSection, setFilterSection] = useState('');   // '' = الكل | 'none' = غير موزّعين | رقم المجموعة
  const [filterGroupe, setFilterGroupe] = useState('');     // '' = الكل | رقم الفوج
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importingGroups, setImportingGroups] = useState(false);
  const [moodleOpen, setMoodleOpen] = useState(false);
  const isSuperAdmin = user?.admin?.role === 'super_admin';
  const [sortCol, setSortCol] = useState<keyof Student>('last_name');
  const [sortAsc, setSortAsc] = useState(true);
  // ── الإدراج في فوج ──
  const [insStudent, setInsStudent] = useState<Student | null>(null);
  const [insGroupe, setInsGroupe] = useState('');
  const [insDate, setInsDate] = useState('');
  const [insNote, setInsNote] = useState('');
  const [insSaving, setInsSaving] = useState(false);
  const [insError, setInsError] = useState('');
  const [insDone, setInsDone] = useState<Student | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const groupsFileRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 50;

  useEffect(() => { loadStudents(); }, []);

  async function loadStudents() {
    setLoading(true);
    let all: Student[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase.from('students').select('*').order('last_name').range(from, from + 999);
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < 1000) break;
      from += 1000;
    }
    setStudents(all);
    setLoading(false);
  }

  async function importExcel(file: File) {
    setImporting(true);
    setImportMsg('جارٍ القراءة...');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      setImportMsg(`${rows.length} سطر — جارٍ المعالجة...`);

      // جلب كل الطلبة الحاليين للمقارنة
      let existing: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from('students').select('id, mat_bac, mat_etudiant').range(from, from + 999);
        if (!data || data.length === 0) break;
        existing = [...existing, ...data];
        if (data.length < 1000) break;
        from += 1000;
      }
      const existingMap = new Map(existing.map((s: any) => [`${String(s.mat_bac).trim()}`, s.id]));

      const toInsert: any[] = [];
      const toUpdate: any[] = [];

      for (const r of rows) {
        const matBac = String(r['Mat. BAC'] || '').trim();
        const matEtudiant = String(r['Mat. Etudiant'] || '').trim();
        const anneeBacRaw = r['Année du bac'] || r['Annee du bac'] || r['année du bac'] || r['annee_bac'] || '';
        const sitIns = String(r["Sit. d'ins."] || r["Sit d'ins"] || r['sit_ins'] || '').trim() || null;
        const record = {
          mat_bac: matBac,
          annee_bac: anneeBacRaw ? Number(String(anneeBacRaw).trim()) || null : null,
          mat_etudiant: matEtudiant,
          sit_ins: sitIns,
          specialite: String(r['specialité'] || r['specialite'] || '').trim(),
          phone: String(r['N° de téléphone'] || '').trim(),
          last_name: String(r['Nom'] || r['اللقب'] || '').trim(),
          first_name: String(r['Prénom'] || r['الإسم'] || '').trim(),
          carte_rfid: String(r['carte rfid'] || '').trim() || null,
          username: String(r['USER'] || '').trim() || null,
          password: String(r['PASSWORD'] || '').trim() || matBac,
          email: String(r['MAIL'] || '').trim() || null,
          section: r['Section'] ? Number(r['Section']) : null,
          groupe: r['Groupe'] ? Number(r['Groupe']) : null,
        };

        const existingId = existingMap.get(matBac);
        if (existingId) {
          toUpdate.push({ id: existingId, ...record });
        } else {
          toInsert.push(record);
        }
      }

      // INSERT الجدد
      let inserted = 0;
      const BATCH = 300;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const { error } = await supabase.from('students').insert(toInsert.slice(i, i + BATCH));
        if (error) {
          setImportMsg(`خطأ في الإضافة: ${error.message} | code: ${error.code}`);
          setImporting(false);
          return;
        }
        inserted += Math.min(BATCH, toInsert.length - i);
        setImportMsg(`إضافة ${inserted}/${toInsert.length} جديد...`);
      }

      // UPDATE الموجودين
      let updated = 0;
      for (const s of toUpdate) {
        const { id, ...fields } = s;
        await supabase.from('students').update(fields).eq('id', id);
        updated++;
        if (updated % 100 === 0) setImportMsg(`تحديث ${updated}/${toUpdate.length}...`);
      }

      setImportMsg(`✓ تم: إضافة ${inserted} جديد + تحديث ${updated} طالب`);
      await loadStudents();
    } catch (e: any) {
      setImportMsg('خطأ: ' + e.message);
    }
    setImporting(false);
  }

  function exportExcel() {
    const data = filtered.map(s => ({
      'Mat. BAC': s.mat_bac,
      'Année du bac': s.annee_bac,
      'Mat. Etudiant': s.mat_etudiant,
      "Sit. d'ins.": s.sit_ins,
      'Spécialité': s.specialite,
      'Nom': s.last_name,
      'Prénom': s.first_name,
      'Téléphone': s.phone,
      'USER': s.username,
      'MAIL': s.email,
      'Section': s.section,
      'Groupe': s.groupe,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Étudiants');
    const scope = [
      filterSpec || 'كل',
      filterSection ? (filterSection === 'none' ? 'غير_موزعين' : `م${filterSection}`) : '',
      filterGroupe ? `ف${filterGroupe}` : '',
    ].filter(Boolean).join('_');
    XLSX.writeFile(wb, `طلبة_${scope}_${new Date().toLocaleDateString('fr')}.xlsx`);
  }

  async function importGroups(file: File) {
    setImportingGroups(true);
    setImportMsg('جارٍ قراءة ملف الأفواج...');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      // البحث عن سطر الرؤوس — قد يكون في أي صف (الملف الرسمي يبدأ من السطر 7)
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // إيجاد السطر الذي يحتوي على "Matricule" أو "Section"
      let headerRowIdx = -1;
      for (let i = 0; i < rawRows.length; i++) {
        const rowStr = String(rawRows[i]).toLowerCase();
        if (rowStr.includes('matricule') && rowStr.includes('section')) {
          headerRowIdx = i;
          break;
        }
      }

      // إذا لم نجد سطر الرؤوس، نحاول قراءة عادية
      let rows: any[];
      if (headerRowIdx >= 0) {
        const headers: string[] = rawRows[headerRowIdx].map((h: any) => String(h).trim());
        rows = rawRows.slice(headerRowIdx + 1).map((row: any[]) => {
          const obj: any = {};
          headers.forEach((h, i) => { obj[h] = row[i] ?? ''; });
          return obj;
        });
      } else {
        rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      }

      // استخراج الصفوف التي تحتوي على بيانات طلبة
      const updates: { mat_bac: string; section: number; groupe: number }[] = [];
      for (const r of rows) {
        const mat = String(r['Matricule'] || r['matricule'] || '').trim();
        const secRaw = String(r['Section'] || '').trim(); // المجموعة 01
        const grpRaw = String(r['Groupe'] || '').trim();  // الفوج 02
        if (!mat || !secRaw || !grpRaw) continue;
        const secMatch = secRaw.match(/\d+/);
        const grpMatch = grpRaw.match(/\d+/);
        if (!secMatch || !grpMatch) continue;
        updates.push({ mat_bac: mat, section: Number(secMatch[0]), groupe: Number(grpMatch[0]) });
      }

      if (updates.length === 0) {
        setImportMsg('لم يتم العثور على بيانات أفواج في الملف');
        setImportingGroups(false);
        return;
      }

      setImportMsg(`${updates.length} طالب — جارٍ التحديث...`);
      let updated = 0;
      const BATCH = 50;
      for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        await Promise.all(batch.map(u =>
          supabase.from('students').update({ section: u.section, groupe: u.groupe }).eq('mat_bac', u.mat_bac)
        ));
        updated += batch.length;
        setImportMsg(`تحديث ${updated}/${updates.length}...`);
      }

      setImportMsg(`✓ تم تحديث أفواج ${updated} طالب`);
      await loadStudents();
    } catch (e: any) {
      setImportMsg('خطأ: ' + e.message);
    }
    setImportingGroups(false);
  }

  async function deleteAllStudents() {
    setDeleting(true);
    await supabase.from('students').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setStudents([]);
    setConfirmDelete(false);
    setDeleting(false);
  }

  async function saveEdit() {
    if (!editStudent) return;
    setSaving(true);
    await supabase.from('students').update({
      last_name: editStudent.last_name,
      first_name: editStudent.first_name,
      specialite: editStudent.specialite,
      phone: editStudent.phone,
      email: editStudent.email,
      section: editStudent.section,
      groupe: editStudent.groupe,
      ...(newPassword ? { password: newPassword } : {}),
    }).eq('id', editStudent.id);
    setStudents(prev => prev.map(s => s.id === editStudent.id ? { ...editStudent } : s));
    setEditStudent(null);
    setNewPassword('');
    setSaving(false);
  }

  // ══ الإدراج في فوج ══════════════════════════════════════════════════
  // أفواج تخصص الطالب، مع مجموعة كل فوج وعدد طلبته
  function groupsOfSpec(spec: string) {
    const m = new Map<number, { count: number; sections: Map<number, number> }>();
    for (const st of students) {
      if (st.specialite !== spec || !st.groupe) continue;
      if (!m.has(st.groupe)) m.set(st.groupe, { count: 0, sections: new Map() });
      const g = m.get(st.groupe)!;
      g.count++;
      if (st.section) g.sections.set(st.section, (g.sections.get(st.section) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([groupe, g]) => {
      let section: number | null = null, best = 0;
      g.sections.forEach((n, sec) => { if (n > best) { best = n; section = sec; } });
      return { groupe, section: section as number | null, count: g.count };
    });
  }

  function openInsertion(st: Student) {
    setInsStudent(st);
    setInsGroupe(st.groupe ? String(st.groupe) : '');
    setInsDate(st.groupe_since ? String(st.groupe_since).slice(0, 10) : todayISO());
    setInsNote('');
    setInsError('');
    setInsDone(null);
  }

  function closeInsertion() {
    if (insSaving) return;
    setInsStudent(null);
    setInsDone(null);
    setInsError('');
  }

  async function saveInsertion() {
    if (!insStudent) return;
    const newGroupe = Number(insGroupe);
    if (!newGroupe || newGroupe < 1) { setInsError('اختر الفوج'); return; }
    if (!insDate) { setInsError('حدد تاريخ الإدراج'); return; }
    setInsSaving(true);
    setInsError('');

    const target = groupsOfSpec(insStudent.specialite).find(g => g.groupe === newGroupe);
    const newSection = target?.section ?? insStudent.section;

    const { error } = await supabase.from('students')
      .update({ section: newSection, groupe: newGroupe, groupe_since: insDate })
      .eq('id', insStudent.id);
    if (error) {
      setInsError('تعذّر الحفظ: ' + error.message);
      setInsSaving(false);
      return;
    }

    // سجل دائم للإدراجات
    const { error: logErr } = await supabase.from('group_insertions').insert({
      student_id: insStudent.id,
      from_section: insStudent.section,
      from_groupe: insStudent.groupe,
      to_section: newSection,
      to_groupe: newGroupe,
      effective_date: insDate,
      note: insNote.trim() || null,
      created_by: (user as any)?.admin?.full_name || (user as any)?.admin?.username || null,
    });

    const updated: Student = { ...insStudent, section: newSection, groupe: newGroupe, groupe_since: insDate };
    setStudents(prev => prev.map(st => st.id === updated.id ? updated : st));
    setInsDone(updated);
    if (logErr) setInsError('تم الإدراج، لكن تعذّر تسجيله في السجل: ' + logErr.message);
    setInsSaving(false);
  }

  function printInsertion(st: Student) {
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const dept = (user as any)?.admin?.department;
    const deptLine = dept === 'عام' ? 'قسم القانون العام' : dept === 'خاص' ? 'قسم القانون الخاص' : '';
    const today = fmtDate(todayISO());
    const w = window.open('', '_blank');
    if (!w) { alert('المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع'); return; }
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>إدراج طالب</title>
    <style>
      @page{size:A4 portrait;margin:20mm 18mm}
      body{font-family:Arial,sans-serif;direction:rtl;color:#000;font-size:15px}
      .header{text-align:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:34px;line-height:1.7}
      .header .u{font-weight:bold;font-size:16px}
      h1{text-align:center;font-size:24px;margin:0 0 36px;letter-spacing:1px}
      .intro{font-size:17px;font-weight:bold;margin-bottom:18px}
      table{width:100%;border-collapse:collapse}
      td{padding:11px 8px;font-size:16px;border-bottom:1px dotted #777;vertical-align:top}
      td.l{width:34%;font-weight:bold}
      .sign{margin-top:70px;display:flex;justify-content:space-between;font-size:15px}
      .sign .box{text-align:center;min-width:220px}
      .sign .box p{margin:0 0 60px;font-weight:bold}
    </style></head><body>
      <div class="header">
        <div class="u">جامعة محمد البشير الإبراهيمي — برج بوعريريج</div>
        <div class="u">كلية الحقوق والعلوم السياسية</div>
        ${deptLine ? `<div>${deptLine}</div>` : ''}
      </div>
      <h1>إدراج طالب</h1>
      <div class="intro">يُدرج الطالب:</div>
      <table>
        <tr><td class="l">اللقب والاسم</td><td>${esc(st.last_name)} ${esc(st.first_name)}</td></tr>
        <tr><td class="l">رقم التسجيل</td><td dir="ltr" style="text-align:right">${esc(st.mat_etudiant)}</td></tr>
        <tr><td class="l">المستوى والتخصص</td><td>${esc(st.specialite)}</td></tr>
        <tr><td class="l">في الفوج</td><td>${esc(String(st.groupe ?? '').padStart(2, '0'))}</td></tr>
        <tr><td class="l">ابتداءً من تاريخ</td><td>${esc(fmtDate(st.groupe_since))}</td></tr>
      </table>
      <div class="sign">
        <div>حُرّر بتاريخ: ${today}</div>
        <div class="box"><p>رئيس القسم</p></div>
      </div>
      <script>window.onload=function(){window.print();}<\/script>
    </body></html>`);
    w.document.close();
  }

  const filtered = students
    .filter(s => {
      const matchSearch = !search || `${s.last_name} ${s.first_name} ${s.username} ${s.mat_etudiant} ${s.mat_bac}`.toLowerCase().includes(search.toLowerCase());
      const matchSpec = !filterSpec || s.specialite === filterSpec;
      const matchSection = !filterSection
        || (filterSection === 'none' ? !s.section : String(s.section) === filterSection);
      const matchGroupe = !filterGroupe || String(s.groupe) === filterGroupe;
      return matchSearch && matchSpec && matchSection && matchGroupe;
    })
    .sort((a, b) => {
      const av = a[sortCol] ?? '';
      const bv = b[sortCol] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'ar');
      return sortAsc ? cmp : -cmp;
    });

  function toggleSort(col: keyof Student) {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(true); }
  }

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // ── فلتر المجموعة ثم الفوج (متسلسل: التخصص ← المجموعة ← الفوج) ──
  const specStudents = filterSpec ? students.filter(s => s.specialite === filterSpec) : [];
  const sectionCounts = new Map<number, number>();
  specStudents.forEach(s => { if (s.section) sectionCounts.set(s.section, (sectionCounts.get(s.section) || 0) + 1); });
  const sectionOptions = [...sectionCounts.keys()].sort((a, b) => a - b);
  const unassignedCount = specStudents.filter(s => !s.section).length;

  const sectionStudents = filterSection && filterSection !== 'none'
    ? specStudents.filter(s => String(s.section) === filterSection) : [];
  const groupeCounts = new Map<number, number>();
  sectionStudents.forEach(s => { if (s.groupe) groupeCounts.set(s.groupe, (groupeCounts.get(s.groupe) || 0) + 1); });
  const groupeOptions = [...groupeCounts.keys()].sort((a, b) => a - b);

  // أول مجموعة في تخصص، وأول فوج في مجموعة (للتحديد التلقائي)
  function firstSectionOf(spec: string): string {
    const nums = students.filter(s => s.specialite === spec && s.section).map(s => s.section as number);
    return nums.length ? String(Math.min(...nums)) : '';
  }
  function firstGroupeOf(spec: string, section: string): string {
    if (!section || section === 'none') return '';
    const nums = students
      .filter(s => s.specialite === spec && String(s.section) === section && s.groupe)
      .map(s => s.groupe as number);
    return nums.length ? String(Math.min(...nums)) : '';
  }
  // اختيار التخصص ← تتحدد مباشرة المجموعة الأولى والفوج الأول
  function onSpecChange(spec: string) {
    const sec = spec ? firstSectionOf(spec) : '';
    setFilterSpec(spec);
    setFilterSection(sec);
    setFilterGroupe(spec ? firstGroupeOf(spec, sec) : '');
    setPage(0);
  }
  // اختيار المجموعة ← يتحدد مباشرة فوجها الأول
  function onSectionChange(section: string) {
    setFilterSection(section);
    setFilterGroupe(firstGroupeOf(filterSpec, section));
    setPage(0);
  }

  const hasFilters = !!(search || filterSpec || filterSection || filterGroupe);
  function clearFilters() {
    setSearch(''); setFilterSpec(''); setFilterSection(''); setFilterGroupe(''); setPage(0);
  }

  const specCounts = SPECIALITES.reduce((acc, s) => { acc[s] = students.filter(st => st.specialite === s).length; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">إدارة الطلبة</h2>
          <p className="text-gray-500 text-sm">{students.length} طالب مسجّل</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { if (e.target.files?.[0]) importExcel(e.target.files[0]); }} />
          <input ref={groupsFileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { if (e.target.files?.[0]) importGroups(e.target.files[0]); e.target.value = ''; }} />
          <div className="relative group">
            <button onClick={() => fileRef.current?.click()} disabled={importing}
              className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-50">
              <Upload className="w-4 h-4" /> {importing ? 'جارٍ الاستيراد...' : 'استيراد Excel'}
            </button>
            <div className="absolute top-full mt-2 right-0 z-50 hidden group-hover:block w-72 bg-gray-900 text-gray-200 text-xs rounded-xl p-3 shadow-xl" dir="ltr">
              <p className="text-gray-400 mb-2 text-right font-bold" dir="rtl">أعمدة الملف المطلوبة بالترتيب:</p>
              <div className="flex flex-wrap gap-1">
                {["Mat. BAC","Année du bac","Mat. Etudiant","specialité","N° de téléphone","اللقب","الإسم","Sit. d'ins.","carte rfid","Section","Groupe","USER","PASSWORD","MAIL"].map((c,i) => (
                  <span key={c} className="bg-gray-700 rounded px-1.5 py-0.5 font-mono">{i+1}. {c}</span>
                ))}
              </div>
            </div>
          </div>
          <button onClick={() => groupsFileRef.current?.click()} disabled={importingGroups}
            className="flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-50">
            <Upload className="w-4 h-4" /> {importingGroups ? 'جارٍ الاستيراد...' : 'استيراد الأفواج'}
          </button>
          {isSuperAdmin && (
            <button onClick={() => setMoodleOpen(true)}
              className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0a1628] text-white px-3 py-2 rounded-xl text-sm transition-colors">
              <KeyRound className="w-4 h-4" /> حسابات موودل
            </button>
          )}
          <button onClick={exportExcel}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-xl text-sm transition-colors">
            <Download className="w-4 h-4" /> تحميل Excel
          </button>
          <button onClick={loadStudents}
            className="flex items-center gap-2 bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-sm hover:bg-gray-200">
            <RefreshCw className="w-4 h-4" /> تحديث
          </button>
          <button onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-xl text-sm transition-colors">
            <X className="w-4 h-4" /> حذف الكل
          </button>
        </div>
      </div>

      {moodleOpen && <AdminMoodleImport onClose={() => setMoodleOpen(false)} />}

      {importMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${importMsg.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : importMsg.startsWith('خطأ') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-blue-50 text-blue-700'}`}>
          {importMsg}
        </div>
      )}


      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="بحث بالاسم أو رقم التسجيل..."
            className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
        </div>
        <select value={filterSpec}
          onChange={e => onSpecChange(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-white">
          <option value="">كل التخصصات ({students.length})</option>
          {SPECIALITES.map(s => <option key={s} value={s}>{s} ({specCounts[s] || 0})</option>)}
        </select>

        {/* المجموعة — تُفعَّل بعد اختيار التخصص */}
        <select value={filterSection} disabled={!filterSpec}
          onChange={e => onSectionChange(e.target.value)}
          title={!filterSpec ? 'اختر التخصص أولاً' : ''}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-white disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed">
          <option value="">{filterSpec ? `كل المجموعات (${specStudents.length})` : 'المجموعة'}</option>
          {sectionOptions.map(n => <option key={n} value={String(n)}>المجموعة {n} ({sectionCounts.get(n)})</option>)}
          {filterSpec && unassignedCount > 0 && <option value="none">غير موزّعين ({unassignedCount})</option>}
        </select>

        {/* الفوج — يُفعَّل بعد اختيار المجموعة */}
        <select value={filterGroupe} disabled={!filterSection || filterSection === 'none'}
          onChange={e => { setFilterGroupe(e.target.value); setPage(0); }}
          title={!filterSection || filterSection === 'none' ? 'اختر المجموعة أولاً' : ''}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-white disabled:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed">
          <option value="">{filterSection && filterSection !== 'none' ? `كل الأفواج (${sectionStudents.length})` : 'الفوج'}</option>
          {groupeOptions.map(n => <option key={n} value={String(n)}>الفوج {n} ({groupeCounts.get(n)})</option>)}
        </select>

        {hasFilters && (
          <button onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">
            <X className="w-3.5 h-3.5" /> مسح الفلاتر
          </button>
        )}
      </div>

      {/* شارات الفلاتر النشطة */}
      {(filterSpec || filterSection || filterGroupe) && (
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-gray-400">العرض الحالي:</span>
          {filterSpec && <span className="bg-[#1a3a6b]/10 text-[#1a3a6b] font-medium px-2.5 py-1 rounded-full">{filterSpec}</span>}
          {filterSection && (
            <span className="bg-blue-50 text-blue-700 font-medium px-2.5 py-1 rounded-full">
              {filterSection === 'none' ? 'غير موزّعين' : `المجموعة ${filterSection}`}
            </span>
          )}
          {filterGroupe && <span className="bg-amber-50 text-amber-700 font-medium px-2.5 py-1 rounded-full">الفوج {filterGroupe}</span>}
          <span className="text-gray-500 font-bold">{filtered.length} طالب</span>
        </div>
      )}

      <p className="text-xs text-gray-400">{filtered.length} نتيجة — صفحة {page+1}/{Math.max(1,totalPages)}</p>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {([
                  { label: 'اللقب والاسم', col: 'last_name' },
                  { label: 'التخصص', col: 'specialite' },
                  { label: 'الوضعية', col: 'sit_ins' },
                  { label: 'م/ف', col: 'section' },
                  { label: 'الهاتف', col: 'phone' },
                  { label: 'إجراءات', col: null },
                ] as { label: string; col: keyof Student | null }[]).map(({ label, col }) => (
                  <th key={label}
                    onClick={() => col && toggleSort(col)}
                    className={`text-right px-4 py-3 text-xs font-bold text-gray-500 ${col ? 'cursor-pointer hover:text-[#1a3a6b] select-none' : ''}`}>
                    {label}
                    {col && sortCol === col && <span className="mr-1">{sortAsc ? '↑' : '↓'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">جارٍ التحميل...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد نتائج</td></tr>
              ) : paginated.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{s.last_name} {s.first_name}</p>
                    <p className="text-xs text-gray-400">{s.mat_etudiant}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{s.specialite}</td>
                  <td className="px-4 py-3 text-xs text-center">
                    {s.sit_ins === 'Validée' && <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">Validée</span>}
                    {s.sit_ins === 'Générée' && <span className="bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Générée</span>}
                    {s.sit_ins === 'Enregistrée' && <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">Enregistrée</span>}
                    {!s.sit_ins && <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-center">
                    {s.section ? <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">م{s.section}/ف{s.groupe}</span> : <span className="text-gray-300">—</span>}
                    {s.groupe_since && (
                      <p className="text-[10px] text-amber-600 mt-1 whitespace-nowrap">إدراج {fmtDate(s.groupe_since)}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.phone || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => { setEditStudent(s); setNewPassword(''); }} title="تعديل البيانات"
                      className="text-gray-400 hover:text-[#1a3a6b] transition-colors p-1">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => openInsertion(s)} title="إدراج في فوج"
                      className="text-gray-400 hover:text-amber-600 transition-colors p-1">
                      <UserCheck className="w-4 h-4" />
                    </button>
                    {s.groupe_since && s.groupe && (
                      <button onClick={() => printInsertion(s)} title="طباعة الإدراج"
                        className="text-gray-400 hover:text-[#1a3a6b] transition-colors p-1">
                        <Printer className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
            className="px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40">السابق</button>
          <span className="px-3 py-1.5 text-sm text-gray-500">{page+1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1}
            className="px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40">التالي</button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <X className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="font-bold text-gray-800 text-lg">حذف جميع الطلبة</h3>
              <p className="text-gray-500 text-sm mt-1">سيتم حذف <span className="font-bold text-red-500">{students.length}</span> طالب نهائياً. هذا الإجراء لا يمكن التراجع عنه.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={deleteAllStudents} disabled={deleting}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                {deleting ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
              </button>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {insStudent && (() => {
        const opts = groupsOfSpec(insStudent.specialite);
        const chosen = opts.find(g => String(g.groupe) === insGroupe);
        const sameGroup = !!insStudent.groupe && Number(insGroupe) === insStudent.groupe;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeInsertion}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" dir="rtl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-amber-600" /> إدراج طالب في فوج
                </h3>
                <button onClick={closeInsertion} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                <p className="font-bold text-gray-800 text-sm">{insStudent.last_name} {insStudent.first_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{insStudent.mat_etudiant} — {insStudent.specialite}</p>
                <p className="text-xs text-gray-500 mt-1">
                  الفوج الحالي: <span className="font-bold text-[#1a3a6b]">{insStudent.groupe ? `ف${insStudent.groupe}` : 'غير موزّع'}</span>
                  {insStudent.groupe_since && <span className="text-amber-600"> — إدراج سابق {fmtDate(insStudent.groupe_since)}</span>}
                </p>
              </div>

              {insDone ? (
                <div className="space-y-3">
                  <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
                    ✓ أُدرج الطالب في الفوج <span className="font-bold">{insDone.groupe}</span> ابتداءً من <span className="font-bold">{fmtDate(insDone.groupe_since)}</span>
                  </div>
                  {insError && <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-2 text-xs">{insError}</div>}
                  <div className="flex gap-2">
                    <button onClick={() => printInsertion(insDone)}
                      className="flex-1 flex items-center justify-center gap-2 bg-[#1a3a6b] hover:bg-[#0a1628] text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
                      <Printer className="w-4 h-4" /> طباعة الإدراج
                    </button>
                    <button onClick={closeInsertion}
                      className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                      إغلاق
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">في الفوج</label>
                    {opts.length > 0 ? (
                      <select value={insGroupe} onChange={e => setInsGroupe(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white focus:ring-2 focus:ring-[#1a3a6b]/30">
                        <option value="">— اختر الفوج —</option>
                        {opts.map(g => (
                          <option key={g.groupe} value={String(g.groupe)}>
                            الفوج {g.groupe}{g.section ? ` (المجموعة ${g.section})` : ''} — {g.count} طالب{g.groupe === insStudent.groupe ? ' — الحالي' : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input type="number" min={1} value={insGroupe} onChange={e => setInsGroupe(e.target.value)}
                        placeholder="رقم الفوج"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
                    )}
                    {sameGroup && (
                      <p className="text-[11px] text-gray-400 mt-1">نفس الفوج الحالي — سيُحدَّث تاريخ الإدراج فقط.</p>
                    )}
                    {!sameGroup && chosen && chosen.section && insStudent.section && chosen.section !== insStudent.section && (
                      <p className="text-[11px] text-amber-600 mt-1">هذا الفوج تابع للمجموعة {chosen.section} — ستتغير مجموعة الطالب معه.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ابتداءً من تاريخ</label>
                    <input type="date" value={insDate} onChange={e => setInsDate(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">ملاحظة (اختياري — تُحفظ في السجل فقط)</label>
                    <input value={insNote} onChange={e => setInsNote(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                  </div>
                  {insError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-2 text-xs">{insError}</div>}
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveInsertion} disabled={insSaving}
                      className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                      {insSaving ? 'جارٍ الحفظ...' : 'تأكيد الإدراج'}
                    </button>
                    <button onClick={closeInsertion} disabled={insSaving}
                      className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                      إلغاء
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {editStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditStudent(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">تعديل بيانات الطالب</h3>
              <button onClick={() => setEditStudent(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">اللقب</label>
                  <input value={editStudent.last_name} onChange={e => setEditStudent({...editStudent, last_name: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الاسم</label>
                  <input value={editStudent.first_name} onChange={e => setEditStudent({...editStudent, first_name: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">التخصص</label>
                <select value={editStudent.specialite} onChange={e => setEditStudent({...editStudent, specialite: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white focus:ring-2 focus:ring-[#1a3a6b]/30">
                  {SPECIALITES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">المجموعة</label>
                  <input type="number" value={editStudent.section || ''} onChange={e => setEditStudent({...editStudent, section: Number(e.target.value) || null})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الفوج</label>
                  <input type="number" value={editStudent.groupe || ''} onChange={e => setEditStudent({...editStudent, groupe: Number(e.target.value) || null})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">الهاتف</label>
                <input value={editStudent.phone || ''} onChange={e => setEditStudent({...editStudent, phone: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1"><Key className="w-3 h-3" /> كلمة مرور جديدة (اختياري)</label>
                <input value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="اتركه فارغاً للإبقاء على كلمة المرور الحالية"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-[#1a3a6b] text-white py-2 rounded-xl text-sm font-bold disabled:opacity-50">
                <Check className="w-4 h-4" /> {saving ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => setEditStudent(null)}
                className="flex-1 py-2 rounded-xl text-sm border border-gray-200 text-gray-600">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
