import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Upload, Download, RefreshCw, Edit2, Key, X, Check, UserCheck, Printer, KeyRound, Activity, Megaphone } from 'lucide-react';
import AdminMoodleImport from './AdminMoodleImport';
import AdminLoginStats from './AdminLoginStats';
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
  mat_etudiant: string | null;
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


// ══ استيراد الأفواج من عدة ملفات (مجلد) ═══════════════════════════════
interface GrpRow { mat: string; year: number | null; sec: number | null; grp: number | null; nom: string; pre: string; }
interface GrpUnit { id: string; label: string; rows: GrpRow[]; }

// تطبيع اسم العمود: بلا حركات ولا مسافات ولا رموز
function normHeader(h: any): string {
  return String(h ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9؀-ۿ]/g, '');
}

// قراءة ورقة واحدة (سطر الرؤوس قد يكون في أي سطر)
function parseGroupSheet(ws: XLSX.WorkSheet): { rows?: GrpRow[]; error?: string } {
  const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  let hi = -1;
  for (let i = 0; i < raw.length; i++) {
    const hs = raw[i].map(normHeader);
    if (hs.includes('matricule') && hs.includes('section')) { hi = i; break; }
  }
  if (hi < 0) return { error: 'noheader' };
  const hdr = raw[hi].map(normHeader);
  const col = (names: string[]) => hdr.findIndex(h => names.includes(h));
  const cMat = col(['matricule']);
  const cYear = col(['anneebac', 'anneedubac', 'annebac']);
  const cSec = col(['section']);
  const cGrp = col(['groupe']);
  const cNom = col(['nom']);
  const cPre = col(['prenom']);
  if (cMat < 0 || cSec < 0 || cGrp < 0) return { error: 'cols' };
  if (cYear < 0) return { error: 'noyear' };
  const rows: GrpRow[] = [];
  for (const r of raw.slice(hi + 1)) {
    const mat = String(r[cMat] ?? '').trim();
    if (!mat) continue;
    const y = String(r[cYear] ?? '').match(/\d{4}/);
    const sc = String(r[cSec] ?? '').match(/\d+/);
    const g = String(r[cGrp] ?? '').match(/\d+/);
    rows.push({
      mat,
      year: y ? Number(y[0]) : null,
      sec: sc ? Number(sc[0]) : null,
      grp: g ? Number(g[0]) : null,
      nom: cNom >= 0 ? String(r[cNom] ?? '').trim() : '',
      pre: cPre >= 0 ? String(r[cPre] ?? '').trim() : '',
    });
  }
  return { rows };
}

// بناء المعاينة: مقارنة كل سطر برقم البكالوريا + سنة البكالوريا (لا يُحفظ شيء هنا)
function computeGroupPlan(units: GrpUnit[], unitSpec: Record<string, string>, db: any[]) {
  const index = new Map<string, any[]>();
  for (const st of db) {
    const k = `${String(st.mat_bac).trim()}|${st.annee_bac ?? ''}`;
    index.set(k, [...(index.get(k) || []), st]);
  }
  const changes = new Map<string, any>();   // طلبة موجودون: تغيير فوج و/أو تثبيت الوضعية
  const adds = new Map<string, any>();      // طلبة غير موجودين: يُضافون
  const conflicts = new Set<string>();
  const seenSig = new Map<string, string>();
  const seenIds = new Set<string>();
  const mismatches: any[] = [];
  const perUnit: Record<string, { rows: number; same: number; change: number; add: number; skipped: number }> = {};
  let rowsRead = 0, same = 0, ambiguous = 0, incomplete = 0, needSpec = 0;

  for (const u of units) {
    const spec = unitSpec[u.id] || '';
    const stat = { rows: 0, same: 0, change: 0, add: 0, skipped: 0 };
    perUnit[u.id] = stat;
    for (const r of u.rows) {
      rowsRead++; stat.rows++;
      if (!r.year || !r.sec || !r.grp) { incomplete++; stat.skipped++; continue; }
      const key = `${r.mat}|${r.year}`;
      const sig = `${r.sec}-${r.grp}-${spec}`;
      if (seenSig.has(key)) {
        if (seenSig.get(key) !== sig) conflicts.add(key);
        continue;
      }
      seenSig.set(key, sig);

      const list = index.get(key);
      if (!list) {
        if (!spec) { needSpec++; stat.skipped++; continue; }
        adds.set(key, { key, mat: r.mat, year: r.year, nom: r.nom, pre: r.pre, spec, sec: r.sec, grp: r.grp });
        stat.add++;
        continue;
      }
      if (list.length > 1) { ambiguous++; stat.skipped++; continue; }
      const st = list[0];
      seenIds.add(st.id);
      if (spec && st.specialite && st.specialite !== spec) {
        mismatches.push({ key, name: `${st.last_name} ${st.first_name}`.trim(), dbSpec: st.specialite, fileSpec: spec, label: u.label });
        stat.skipped++;
        continue;
      }
      const needGroup = !(st.section === r.sec && st.groupe === r.grp);
      const needValidate = st.sit_ins !== 'Validée';
      if (!needGroup && !needValidate) { same++; stat.same++; continue; }
      changes.set(st.id, {
        id: st.id, key,
        name: `${st.last_name} ${st.first_name}`.trim(),
        spec: st.specialite,
        fromSec: st.section, fromGrp: st.groupe,
        toSec: r.sec, toGrp: r.grp,
        needGroup, needValidate,
        fromSit: st.sit_ins || null,
        since: st.groupe_since || null,
      });
      stat.change++;
    }
  }

  // طلبة المنصة في المستويات المغطاة بالملفات ولا ذكر لهم فيها (للعلم فقط — لا يُمَسّون)
  const covered = new Set(Object.values(unitSpec).filter(Boolean));
  const notInFiles: Record<string, number> = {};
  for (const st of db) {
    if (covered.has(st.specialite) && !seenIds.has(st.id)) notInFiles[st.specialite] = (notInFiles[st.specialite] || 0) + 1;
  }

  return {
    rowsRead, same, ambiguous, incomplete, needSpec,
    conflicts: conflicts.size,
    changes: Array.from(changes.values()).filter(c => !conflicts.has(c.key)),
    adds: Array.from(adds.values()).filter(a => !conflicts.has(a.key)),
    mismatches: mismatches.filter(m => !conflicts.has(m.key)),
    perUnit, notInFiles,
  };
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
  // ── استيراد الأفواج (عدة ملفات) ──
  const [grpUnits, setGrpUnits] = useState<GrpUnit[] | null>(null);   // null = لا معاينة مفتوحة
  const [grpDb, setGrpDb] = useState<any[]>([]);
  const [unitSpec, setUnitSpec] = useState<Record<string, string>>({});
  const [manualNums, setManualNums] = useState<Record<string, string>>({});
  const [grpProblems, setGrpProblems] = useState<string[]>([]);
  const [grpApplying, setGrpApplying] = useState(false);
  // ── طلبة بلا رقم تسجيل ──
  const [noNumOpen, setNoNumOpen] = useState(false);
  const [numDraft, setNumDraft] = useState<Record<string, string>>({});
  const [numMsg, setNumMsg] = useState<Record<string, string>>({});
  const folderRef = useRef<HTMLInputElement>(null);
  const [moodleOpen, setMoodleOpen] = useState(false);
  const [loginsOpen, setLoginsOpen] = useState(false);
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

  const grpPlan = useMemo(
    () => (grpUnits ? computeGroupPlan(grpUnits, unitSpec, grpDb) : null),
    [grpUnits, unitSpec, grpDb],
  );
  const grpNumErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (!grpPlan) return errs;
    const dbNums = new Set(grpDb.map((x: any) => String(x.mat_etudiant || '').trim()).filter(Boolean));
    const used = new Map<string, string>();
    for (const a of grpPlan.adds) {
      const v = (manualNums[a.key] || '').trim();
      if (!v) continue;
      if (dbNums.has(v)) errs[a.key] = 'الرقم مستعمل لطالب آخر';
      else if (used.has(v)) { errs[a.key] = 'مكرر في هذه القائمة'; errs[used.get(v)!] = 'مكرر في هذه القائمة'; }
      else used.set(v, a.key);
    }
    return errs;
  }, [grpPlan, manualNums, grpDb]);

  useEffect(() => { loadStudents(); loadReps(); }, []);

  // ── ممثلو الأفواج (من السجل؛ يفشل بصمت لمن ليست له الصلاحية) ──
  const [repGroups, setRepGroups] = useState<any[]>([]);
  const [repFor, setRepFor] = useState<Student | null>(null);
  const [repBusy, setRepBusy] = useState(false);
  const [repErr, setRepErr] = useState('');
  async function loadReps() {
    const { data, error } = await supabase.rpc('gr_registry');
    if (!error) setRepGroups((data as any[]) || []);
  }
  const repRole = useMemo(() => {
    const m = new Map<string, string>();
    repGroups.forEach(g => { if (g.rep) m.set(g.rep.id, 'ممثل الفوج'); if (g.deputy) m.set(g.deputy.id, 'نائب الممثل'); });
    return m;
  }, [repGroups]);
  const repGroupOf = (st: Student) => repGroups.find(g => g.level_name === st.specialite && g.section === st.section && g.groupe === st.groupe);
  async function setRep(st: Student, role: 'ممثل' | 'نائب', remove: boolean) {
    const g = repGroupOf(st); if (!g) return;
    setRepBusy(true); setRepErr('');
    const { error } = await supabase.rpc('gr_assign', { p_level: g.level_id, p_section: g.section, p_groupe: g.groupe, p_role: role, p_student: remove ? null : st.id });
    setRepBusy(false);
    if (error) { setRepErr(error.message); return; }
    await loadReps(); setRepFor(null);
  }

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
        const { data } = await supabase.from('students').select('id, mat_bac, annee_bac, mat_etudiant').order('id').range(from, from + 999);
        if (!data || data.length === 0) break;
        existing = [...existing, ...data];
        if (data.length < 1000) break;
        from += 1000;
      }
      // الطالب يُعرَّف برقم البكالوريا + سنة البكالوريا معا (رقم البكالوريا وحده قد يتكرر بين سنوات مختلفة)
      const byKey = new Map<string, string>();
      const byBac = new Map<string, string[]>();
      for (const e of existing) {
        const b = String(e.mat_bac).trim();
        byKey.set(`${b}|${e.annee_bac ?? ''}`, e.id);
        byBac.set(b, [...(byBac.get(b) || []), e.id]);
      }
      let ambiguous = 0;
      let dupInFile = 0;
      const seenKeys = new Set<string>();

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
          mat_etudiant: matEtudiant || null,
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

        const rowKey = `${matBac}|${record.annee_bac ?? ''}`;
        if (seenKeys.has(rowKey)) { dupInFile++; continue; }
        seenKeys.add(rowKey);

        let existingId: string | undefined;
        if (record.annee_bac) {
          existingId = byKey.get(rowKey);           // نفس الرقم ونفس السنة = نفس الطالب؛ سنة أخرى = طالب آخر (إضافة)
        } else {
          const ids = byBac.get(matBac) || [];
          if (ids.length > 1) { ambiguous++; continue; }   // سنة غير مذكورة ورقم مكرر: لا نخمّن
          existingId = ids[0];
        }
        if (existingId) {
          // لا نمحو القسم/الفوج إذا لم يكن في الملف
          const upd: any = { ...record };
          if (!matEtudiant) delete upd.mat_etudiant;   // لا نمحو رقم التسجيل الموجود إذا لم يكن في الملف
          if (!r['Section']) delete upd.section;
          if (!r['Groupe']) delete upd.groupe;
          toUpdate.push({ id: existingId, ...upd });
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
      let updFail = 0;
      for (const s of toUpdate) {
        const { id, ...fields } = s;
        const { error: ue } = await supabase.from('students').update(fields).eq('id', id);
        if (ue) updFail++; else updated++;
        if ((updated + updFail) % 100 === 0) setImportMsg(`تحديث ${updated + updFail}/${toUpdate.length}...`);
      }

      setImportMsg(`✓ تم: إضافة ${inserted} جديد + تحديث ${updated} طالب` + (ambiguous ? ` — تجاوز ${ambiguous} سطر غامض (رقم مكرر دون سنة)` : '') + (dupInFile ? ` — تجاوز ${dupInFile} سطر مكرر في الملف` : '') + (updFail ? ` — تعذّر تحديث ${updFail} طالب (رقم تسجيل مكرر غالبا)` : ''));
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

  // الخطوة 1: قراءة ملفات الأفواج (ملف أو عدة ملفات أو مجلد) وبناء المعاينة — لا يُحفظ شيء هنا
  async function importGroupFiles(files: File[]) {
    setImportingGroups(true);
    setImportMsg('جارٍ قراءة ملفات الأفواج...');
    try {
      const xl = files
        .filter(f => /\.(xlsx|xls)$/i.test(f.name) && !f.name.startsWith('~$'))
        .sort((a, b) => String((a as any).webkitRelativePath || a.name).localeCompare(String((b as any).webkitRelativePath || b.name), 'ar'));
      if (xl.length === 0) {
        setImportMsg('خطأ: لا يوجد ملف Excel (xlsx / xls) في الاختيار');
        setImportingGroups(false);
        return;
      }

      const units: GrpUnit[] = [];
      const problems: string[] = [];
      for (const f of xl) {
        const wb = XLSX.read(await f.arrayBuffer());
        for (const sn of wb.SheetNames) {
          const label = wb.SheetNames.length > 1 ? `${f.name} — ${sn}` : f.name;
          const res = parseGroupSheet(wb.Sheets[sn]);
          if (res.error === 'noheader') { if (wb.SheetNames.length === 1) problems.push(`${label}: لم يُعثر على سطر الرؤوس (Matricule / Section)`); continue; }
          if (res.error === 'cols') { problems.push(`${label}: أعمدة ناقصة (المطلوب Matricule, Section, Groupe)`); continue; }
          if (res.error === 'noyear') { problems.push(`${label}: عمود «Année Bac» غير موجود`); continue; }
          if (res.rows && res.rows.length > 0) units.push({ id: String(units.length), label, rows: res.rows });
        }
      }
      if (units.length === 0) {
        setImportMsg('خطأ: لا توجد بيانات أفواج صالحة — ' + (problems.join(' | ') || 'الملفات فارغة'));
        setImportingGroups(false);
        return;
      }

      // الطلبة الحاليون
      let all: any[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase.from('students')
          .select('id, mat_bac, annee_bac, mat_etudiant, last_name, first_name, specialite, section, groupe, groupe_since, sit_ins')
          .order('id').range(from, from + 999);
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < 1000) break;
        from += 1000;
      }

      // استنتاج مستوى كل ملف: التخصص الغالب بين طلبته الموجودين في المنصة
      const idx = new Map<string, any[]>();
      for (const st of all) {
        const k = `${String(st.mat_bac).trim()}|${st.annee_bac ?? ''}`;
        idx.set(k, [...(idx.get(k) || []), st]);
      }
      const inferred: Record<string, string> = {};
      for (const u of units) {
        const cnt = new Map<string, number>();
        let tot = 0;
        for (const r of u.rows) {
          if (!r.year) continue;
          const l = idx.get(`${r.mat}|${r.year}`);
          if (l && l.length === 1 && l[0].specialite) { cnt.set(l[0].specialite, (cnt.get(l[0].specialite) || 0) + 1); tot++; }
        }
        let best = '', bc = 0;
        cnt.forEach((c, k) => { if (c > bc) { bc = c; best = k; } });
        inferred[u.id] = tot >= 3 && bc / tot >= 0.6 ? best : '';
      }

      setGrpDb(all);
      setUnitSpec(inferred);
      setManualNums({});
      setGrpProblems(problems);
      setGrpUnits(units);
      setImportMsg('');
    } catch (e: any) {
      setImportMsg('خطأ: ' + e.message);
    }
    setImportingGroups(false);
  }

  function closeGrpPreview() {
    setGrpUnits(null);
    setGrpDb([]);
    setUnitSpec({});
    setManualNums({});
    setGrpProblems([]);
  }

  // الخطوة 2: بعد التأكيد — تغيير القسم/الفوج وتثبيت الوضعية للموجودين، وإضافة الجدد.
  // لا تُمَسّ تواريخ الإدراج ولا الغيابات ولا تسجيلات الحصص.
  async function applyGroupPlan() {
    if (!grpPlan) return;
    setGrpApplying(true);
    const rep = { added: [] as any[], validated: [] as any[], regrouped: [] as any[], failed: [] as any[] };

    // 1) الموجودون
    const list: any[] = grpPlan.changes;
    const BATCH = 25;
    for (let i = 0; i < list.length; i += BATCH) {
      const batch = list.slice(i, i + BATCH);
      const res = await Promise.all(batch.map(async (c: any) => {
        const patch: any = {};
        if (c.needGroup) { patch.section = c.toSec; patch.groupe = c.toGrp; }
        if (c.needValidate) patch.sit_ins = 'Validée';
        const { error } = await supabase.from('students').update(patch).eq('id', c.id);
        return { c, error };
      }));
      res.forEach(({ c, error }) => {
        if (error) { rep.failed.push({ name: c.name, op: 'تحديث', err: error.message }); return; }
        if (c.needGroup) rep.regrouped.push(c);
        if (c.needValidate) rep.validated.push(c);
      });
      setImportMsg(`تحديث ${Math.min(i + BATCH, list.length)}/${list.length}...`);
    }

    // 2) الجدد
    const adds: any[] = grpPlan.adds;
    for (let i = 0; i < adds.length; i += 20) {
      const batch = adds.slice(i, i + 20);
      const res = await Promise.all(batch.map(async (a: any) => {
        const num = (manualNums[a.key] || '').trim() || null;
        const { error } = await supabase.from('students').insert({
          mat_bac: a.mat,
          annee_bac: a.year,
          mat_etudiant: num,
          specialite: a.spec,
          last_name: a.nom,
          first_name: a.pre,
          section: a.sec,
          groupe: a.grp,
          sit_ins: 'Validée',
          password: a.mat,
          phone: '',
          username: null,
          email: null,
          carte_rfid: null,
        });
        return { a, error, num };
      }));
      res.forEach(({ a, error, num }) => {
        if (error) rep.failed.push({ name: `${a.nom} ${a.pre}`.trim(), op: 'إضافة', err: error.message });
        else rep.added.push({ ...a, num });
      });
      setImportMsg(`إضافة ${Math.min(i + 20, adds.length)}/${adds.length}...`);
    }

    // تقرير Excel بما تم
    try {
      const wb = XLSX.utils.book_new();
      const sheet = (name: string, head: string[], rows: any[][]) => {
        if (rows.length === 0) return;
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows]), name);
      };
      sheet('أُضيفوا', ['اللقب', 'الاسم', 'رقم البكالوريا', 'سنة البكالوريا', 'التخصص', 'القسم', 'الفوج', 'رقم التسجيل'],
        rep.added.map(a => [a.nom, a.pre, a.mat, a.year, a.spec, a.sec, a.grp, a.num || '']));
      sheet('ثُبّتت وضعيتهم', ['الاسم', 'التخصص', 'الوضعية السابقة'],
        rep.validated.map(c => [c.name, c.spec, c.fromSit || '—']));
      sheet('تغيّر فوجهم', ['الاسم', 'التخصص', 'من قسم', 'من فوج', 'إلى قسم', 'إلى فوج', 'تاريخ الإدراج (محفوظ)'],
        rep.regrouped.map(c => [c.name, c.spec, c.fromSec ?? '', c.fromGrp ?? '', c.toSec, c.toGrp, c.since ? fmtDate(c.since) : '']));
      sheet('تعارض المستوى (لم يُمَسّوا)', ['الاسم', 'تخصصه في المنصة', 'مستوى الملف', 'الملف'],
        grpPlan.mismatches.map((m: any) => [m.name, m.dbSpec, m.fileSpec, m.label]));
      sheet('أخطاء', ['الاسم', 'العملية', 'الخطأ'], rep.failed.map(f => [f.name, f.op, f.err]));
      if (wb.SheetNames.length > 0) XLSX.writeFile(wb, `تقرير_الأفواج_${todayISO()}.xlsx`);
    } catch { /* التقرير اختياري */ }

    closeGrpPreview();
    setGrpApplying(false);
    const base = `أُضيف ${rep.added.length} طالب جديد — ثُبّتت وضعية ${rep.validated.length} — تغيّر فوج ${rep.regrouped.length} — تواريخ الإدراج والغيابات لم تُمَسّ`;
    setImportMsg(rep.failed.length ? `خطأ: فشلت ${rep.failed.length} عملية (راجع ورقة «أخطاء» في التقرير) — ${base}` : `✓ ${base}`);
    await loadStudents();
  }

  // إدخال رقم التسجيل يدويا لطالب بلا رقم
  async function saveMatEtu(st: Student, raw: string) {
    const v = (raw || '').trim();
    if (!v) return;
    const { error } = await supabase.from('students').update({ mat_etudiant: v }).eq('id', st.id);
    if (error) {
      setNumMsg(p => ({ ...p, [st.id]: error.code === '23505' ? 'هذا الرقم مستعمل لطالب آخر' : error.message }));
      return;
    }
    setNumMsg(p => { const n = { ...p }; delete n[st.id]; return n; });
    setNumDraft(p => { const n = { ...p }; delete n[st.id]; return n; });
    setStudents(prev => prev.map(x => x.id === st.id ? { ...x, mat_etudiant: v } : x));
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
    const { error: saveErr } = await supabase.from('students').update({
      last_name: editStudent.last_name,
      mat_etudiant: (editStudent.mat_etudiant || '').trim() || null,
      first_name: editStudent.first_name,
      specialite: editStudent.specialite,
      phone: editStudent.phone,
      email: editStudent.email,
      section: editStudent.section,
      groupe: editStudent.groupe,
      ...(newPassword ? { password: newPassword } : {}),
    }).eq('id', editStudent.id);
    if (saveErr) {
      setImportMsg('خطأ: ' + (saveErr.code === '23505' ? 'رقم التسجيل مستعمل لطالب آخر' : saveErr.message));
      setSaving(false);
      return;
    }
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
    if (user?.admin?.readOnly) return;
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
      const matchSearch = !search || `${s.last_name} ${s.first_name} ${s.username ?? ''} ${s.mat_etudiant ?? ''} ${s.mat_bac}`.toLowerCase().includes(search.toLowerCase());
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
          <input ref={groupsFileRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
            onChange={e => { const fl = Array.from(e.target.files || []); e.target.value = ''; if (fl.length) importGroupFiles(fl); }} />
          <input ref={folderRef} type="file" multiple className="hidden" {...({ webkitdirectory: '', directory: '' } as any)}
            onChange={e => { const fl = Array.from(e.target.files || []); e.target.value = ''; if (fl.length) importGroupFiles(fl); }} />
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
          <button onClick={() => folderRef.current?.click()} disabled={importingGroups}
            className="flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-50">
            <Upload className="w-4 h-4" /> {importingGroups ? 'جارٍ القراءة...' : 'استيراد الأفواج (مجلد)'}
          </button>
          <button onClick={() => groupsFileRef.current?.click()} disabled={importingGroups}
            className="flex items-center gap-2 bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-50">
            <Upload className="w-4 h-4" /> ملفات
          </button>
          {students.some(x => !x.mat_etudiant) && (
            <button onClick={() => setNoNumOpen(true)}
              className="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 px-3 py-2 rounded-xl text-sm transition-colors">
              <Edit2 className="w-4 h-4" /> بلا رقم تسجيل ({students.filter(x => !x.mat_etudiant).length})
            </button>
          )}
          {isSuperAdmin && (
            <button onClick={() => setMoodleOpen(true)}
              className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0a1628] text-white px-3 py-2 rounded-xl text-sm transition-colors">
              <KeyRound className="w-4 h-4" /> حسابات موودل
            </button>
          )}
          {isSuperAdmin && (
            <button onClick={() => setLoginsOpen(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-xl text-sm transition-colors">
              <Activity className="w-4 h-4" /> دخول الطلبة
            </button>
          )}
          <button onClick={exportExcel}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-xl text-sm transition-colors">
            <Download className="w-4 h-4" /> تحميل Excel
          </button>
          {!user?.admin?.readOnly && <button onClick={loadStudents}
            className="flex items-center gap-2 bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-sm hover:bg-gray-200">
            <RefreshCw className="w-4 h-4" /> تحديث
          </button>}
          <button onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-xl text-sm transition-colors">
            <X className="w-4 h-4" /> حذف الكل
          </button>
        </div>
      </div>

      {moodleOpen && <AdminMoodleImport onClose={() => setMoodleOpen(false)} />}
      {loginsOpen && <AdminLoginStats onClose={() => setLoginsOpen(false)} />}

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
                    {repRole.get(s.id) && <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200"><Megaphone className="w-3 h-3" />{repRole.get(s.id)}</span>}
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
                    {!user?.admin?.readOnly && <button onClick={() => openInsertion(s)} title="إدراج في فوج"
                      className="text-gray-400 hover:text-amber-600 transition-colors p-1">
                      <UserCheck className="w-4 h-4" />
                    </button>}
                    {!user?.admin?.readOnly && repGroupOf(s) && <button onClick={() => { setRepFor(s); setRepErr(''); }} title="ممثل الفوج"
                      className="text-gray-400 hover:text-amber-600 transition-colors p-1">
                      <Megaphone className="w-4 h-4" />
                    </button>}
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

      {repFor && (() => {
        const g = repGroupOf(repFor);
        if (!g) return null;
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !repBusy && setRepFor(null)}>
            <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-3" dir="rtl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-800 flex items-center gap-2"><Megaphone className="w-4 h-4 text-amber-600" /> ممثل الفوج</h3>
                <button onClick={() => setRepFor(null)} className="text-gray-400"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-700"><b>{repFor.last_name} {repFor.first_name}</b>
                <span className="block text-xs text-gray-500 mt-0.5">{g.level_name} — المجموعة {g.section} — الفوج {g.groupe}</span></p>
              {(['ممثل', 'نائب'] as const).map(role => {
                const holder = role === 'ممثل' ? g.rep : g.deputy;
                const mine = holder?.id === repFor.id;
                return (
                  <button key={role} disabled={repBusy} onClick={() => setRep(repFor, role, mine)}
                    className={`w-full rounded-xl py-2.5 px-3 text-sm font-semibold border text-right disabled:opacity-50 ${mine ? 'border-red-200 text-red-600 bg-red-50' : 'border-[#1a3a6b]/20 text-[#1a3a6b] bg-white'}`}>
                    {mine ? (role === 'ممثل' ? 'إلغاء صفة الممثل' : 'إلغاء صفة النائب') : (role === 'ممثل' ? 'تعيينه ممثلا للفوج' : 'تعيينه نائبا للممثل')}
                    {!mine && holder && <span className="block text-xs font-normal text-gray-500 mt-0.5">بدلا من: {holder.name}</span>}
                  </button>
                );
              })}
              {repErr && <p className="text-xs text-red-600">{repErr}</p>}
            </div>
          </div>
        );
      })()}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
            className="px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40">السابق</button>
          <span className="px-3 py-1.5 text-sm text-gray-500">{page+1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1}
            className="px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40">التالي</button>
        </div>
      )}

      {grpPlan && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !grpApplying && closeGrpPreview()}>
          <div className="bg-white rounded-2xl p-5 max-w-3xl w-full shadow-2xl max-h-[92vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-800">معاينة استيراد الأفواج</h3>
              <button onClick={() => !grpApplying && closeGrpPreview()} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">المقارنة برقم البكالوريا + سنة البكالوريا. لم يُحفظ أي شيء بعد.</p>

            {grpProblems.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 text-xs mb-3 space-y-0.5">
                {grpProblems.map((pr, i) => <p key={i}>⚠ {pr}</p>)}
              </div>
            )}

            <div className="mb-3">
              <p className="text-xs font-bold text-gray-600 mb-1">الملفات ({grpUnits?.length}) — تأكد من مستوى كل ملف:</p>
              <div className="space-y-1.5">
                {grpUnits?.map(u => {
                  const st = grpPlan.perUnit[u.id];
                  const cur = unitSpec[u.id] || '';
                  const opts = cur && !SPECIALITES.includes(cur) ? [cur, ...SPECIALITES] : SPECIALITES;
                  return (
                    <div key={u.id} className={`rounded-xl p-2.5 border ${cur ? 'border-gray-200 bg-gray-50' : 'border-amber-300 bg-amber-50'}`}>
                      <p className="text-xs font-bold text-gray-700 break-all" dir="ltr" style={{ textAlign: 'right' }}>{u.label}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <select value={cur} onChange={e => setUnitSpec(prev => ({ ...prev, [u.id]: e.target.value }))}
                          className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white">
                          <option value="">— اختر المستوى —</option>
                          {opts.map(sp => <option key={sp} value={sp}>{sp}</option>)}
                        </select>
                        <span className="text-[11px] text-gray-500">
                          {st.rows} سطر · بلا تغيير {st.same} · تحديث {st.change} · إضافة {st.add}{st.skipped ? ` · متجاوَز ${st.skipped}` : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-2.5">سطور الملفات<p className="font-bold text-gray-800 text-lg">{grpPlan.rowsRead}</p></div>
              <div className="bg-gray-50 rounded-xl p-2.5">بلا تغيير<p className="font-bold text-gray-800 text-lg">{grpPlan.same}</p></div>
              <div className="bg-green-50 rounded-xl p-2.5 text-green-700">
                تحديث طلبة موجودين<p className="font-bold text-lg">{grpPlan.changes.length}</p>
                <p className="text-[11px] font-normal">فوج: {grpPlan.changes.filter((c: any) => c.needGroup).length} · وضعية: {grpPlan.changes.filter((c: any) => c.needValidate).length}</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-2.5 text-blue-700">طلبة جدد يُضافون<p className="font-bold text-lg">{grpPlan.adds.length}</p></div>
              <div className="bg-amber-50 rounded-xl p-2.5 text-amber-700">تعارض مستوى<p className="font-bold text-lg">{grpPlan.mismatches.length}</p></div>
              <div className="bg-amber-50 rounded-xl p-2.5 text-amber-700">
                غامض / ناقص / متعارض<p className="font-bold text-lg">{grpPlan.ambiguous + grpPlan.incomplete + grpPlan.conflicts}</p>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl px-3 py-2 text-xs mb-2">
              تُحفظ تواريخ الإدراج كما هي، ولا تُمَسّ الغيابات ولا تسجيلات الحصص. الموجودون في الملف يصبحون «Validée»، ولا يُخفَّض أحد.
            </div>
            {grpPlan.changes.some((c: any) => c.since) && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-3 py-2 text-xs mb-2">
                {grpPlan.changes.filter((c: any) => c.since).length} طالب منهم لديهم تاريخ إدراج: يتغيّر فوجهم حسب الملف ويبقى تاريخ الإدراج محفوظا.
              </div>
            )}
            {grpPlan.needSpec > 0 && (
              <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-3 py-2 text-xs mb-2">
                {grpPlan.needSpec} طالب غير موجود في المنصة لا يمكن إضافته لأن مستوى ملفه غير محدد — اختر المستوى أعلاه.
              </div>
            )}

            {grpPlan.adds.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold text-blue-700 mb-1">طلبة جدد يُضافون ({grpPlan.adds.length}) — رقم التسجيل اختياري، ويمكن إكماله لاحقا:</p>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {grpPlan.adds.map((a: any) => (
                    <div key={a.key} className="bg-blue-50 rounded-lg px-2 py-1.5 flex flex-wrap items-center gap-2">
                      <div className="flex-1 min-w-[10rem]">
                        <p className="text-xs font-bold text-gray-700">{a.nom} {a.pre}</p>
                        <p className="text-[11px] text-gray-500">{a.spec} — م{a.sec}/ف{a.grp} — {a.mat} ({a.year})</p>
                      </div>
                      <div>
                        <input dir="ltr" placeholder="رقم التسجيل (اختياري)" value={manualNums[a.key] || ''}
                          onChange={e => setManualNums(prev => ({ ...prev, [a.key]: e.target.value }))}
                          className={`w-44 border rounded-lg px-2 py-1 text-xs ${grpNumErrors[a.key] ? 'border-red-400' : 'border-gray-200'}`} />
                        {grpNumErrors[a.key] && <p className="text-[10px] text-red-500 mt-0.5">{grpNumErrors[a.key]}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {grpPlan.changes.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold text-gray-600 mb-1">أمثلة على التحديث ({Math.min(8, grpPlan.changes.length)} من {grpPlan.changes.length}):</p>
                <div className="space-y-1">
                  {grpPlan.changes.slice(0, 8).map((c: any) => (
                    <p key={c.id} className="text-xs text-gray-600 bg-gray-50 rounded-lg px-2 py-1">
                      {c.name} —
                      {c.needGroup && <> {c.fromGrp ? `م${c.fromSec}/ف${c.fromGrp}` : 'غير موزّع'} ← <span className="font-bold text-[#1a3a6b]">م{c.toSec}/ف{c.toGrp}</span></>}
                      {c.needValidate && <span className="text-green-700"> · الوضعية: {c.fromSit || '—'} ← Validée</span>}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {grpPlan.mismatches.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold text-amber-700 mb-1">تعارض مستوى — لن يُمَسّوا ({Math.min(8, grpPlan.mismatches.length)} من {grpPlan.mismatches.length}):</p>
                <div className="space-y-1">
                  {grpPlan.mismatches.slice(0, 8).map((m: any, i: number) => (
                    <p key={i} className="text-xs text-gray-600 bg-amber-50 rounded-lg px-2 py-1">{m.name} — في المنصة: {m.dbSpec} · في الملف: {m.fileSpec}</p>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(grpPlan.notInFiles).length > 0 && (
              <p className="text-[11px] text-gray-500 mb-3">
                للعلم (لا يُمَسّون): طلبة في المنصة ولا ذكر لهم في الملفات — {Object.entries(grpPlan.notInFiles).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </p>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={applyGroupPlan}
                disabled={grpApplying || (grpPlan.changes.length + grpPlan.adds.length) === 0 || Object.keys(grpNumErrors).length > 0}
                className="flex-1 bg-[#1a3a6b] hover:bg-[#0a1628] text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                {grpApplying ? 'جارٍ التنفيذ...' : (grpPlan.changes.length + grpPlan.adds.length) === 0 ? 'لا شيء للتنفيذ' : `تأكيد: تحديث ${grpPlan.changes.length} وإضافة ${grpPlan.adds.length}`}
              </button>
              <button onClick={closeGrpPreview} disabled={grpApplying}
                className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {noNumOpen && (() => {
        const list = students.filter(x => !x.mat_etudiant);
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setNoNumOpen(false)}>
            <div className="bg-white rounded-2xl p-5 max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col" dir="rtl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-gray-800">طلبة بلا رقم تسجيل ({list.length})</h3>
                <button onClick={() => setNoNumOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-xs text-gray-500 mb-3">اكتب الرقم ثم Enter للحفظ والانتقال إلى الطالب التالي. يمكن أيضا إكماله باستيراد ملف Excel العام.</p>
              <div className="overflow-y-auto space-y-2">
                {list.length === 0 && <p className="text-sm text-green-700 text-center py-6">✓ كل الطلبة لهم رقم تسجيل</p>}
                {list.map(st => (
                  <div key={st.id} data-row="1" className="flex flex-wrap items-center gap-2 bg-gray-50 rounded-xl p-2">
                    <div className="flex-1 min-w-[10rem]">
                      <p className="text-sm font-bold text-gray-800">{st.last_name} {st.first_name}</p>
                      <p className="text-[11px] text-gray-500">{st.specialite} — {st.mat_bac} ({st.annee_bac ?? '—'})</p>
                      {numMsg[st.id] && <p className="text-[11px] text-red-500">{numMsg[st.id]}</p>}
                    </div>
                    <input dir="ltr" placeholder="رقم التسجيل" value={numDraft[st.id] || ''}
                      onChange={e => setNumDraft(prev => ({ ...prev, [st.id]: e.target.value }))}
                      onKeyDown={e => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const next = (e.currentTarget.closest('[data-row]')?.nextElementSibling?.querySelector('input') as HTMLInputElement | null);
                        saveMatEtu(st, numDraft[st.id] || '');
                        next?.focus();
                      }}
                      className="w-44 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                    <button onClick={() => saveMatEtu(st, numDraft[st.id] || '')}
                      className="bg-[#1a3a6b] text-white rounded-lg px-2.5 py-1.5 text-xs"><Check className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

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
                <label className="text-xs text-gray-500 mb-1 block">رقم التسجيل</label>
                <input value={editStudent.mat_etudiant || ''} onChange={e => setEditStudent({...editStudent, mat_etudiant: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
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
