import { Fragment, useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  ATT_YEAR, ABSENCE_LIMIT, ABSENCE_WARN, ST_ABSENT, J_PENDING, J_ACCEPTED, J_REJECTED, KIND_ILLNESS,
  AttRecord, AttSession, Justification,
  fmtDay, fmtDayShort, todayISO, dayOnly, recordCounts, justificationFor,
  absenceLevel, LEVEL_STYLE, J_STYLE, fetchAll, fetchByIds, escHtml,
} from '../../lib/attendance';
import {
  Search, Printer, RefreshCw, Check, X, Eye, FileText, AlertTriangle,
  ChevronDown, ChevronUp, UserX, ClipboardList, Users,
} from 'lucide-react';

type Tab = 'follow' | 'justs' | 'views' | 'profs';

const normalize = (s: string) => String(s || '').replace(/\s+/g, ' ').replace(/ال/g, '').trim();

export default function AdminAttendancePage() {
  const { user } = useAuth();
  const admin = (user as any)?.admin;
  const isDeptHead = admin?.role === 'dept_head';
  const department: string | null = isDeptHead ? (admin?.department ?? null) : null;
  const adminName: string = admin?.full_name || admin?.username || 'الإدارة';

  const [tab, setTab] = useState<Tab>('follow');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [levels, setLevels] = useState<any[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [sessions, setSessions] = useState<AttSession[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [exclusions, setExclusions] = useState<any[]>([]);
  const [justs, setJusts] = useState<Justification[]>([]);
  const [viewReqs, setViewReqs] = useState<any[]>([]);
  const [profs, setProfs] = useState<any[]>([]);
  const [tdAssignments, setTdAssignments] = useState<any[]>([]);

  // فلاتر المتابعة
  const [fLevel, setFLevel] = useState('');
  const [fModule, setFModule] = useState('');
  const [fStatus, setFStatus] = useState<'all' | 'warn' | 'limit' | 'excluded'>('all');
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  // فلاتر التبريرات
  const [jFilter, setJFilter] = useState<string>(J_PENDING);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [onlyMissing, setOnlyMissing] = useState(false);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { data: lv, error: lvErr } = await supabase.from('levels')
        .select('id, name_ar, department, display_order').order('display_order');
      if (lvErr) throw new Error(lvErr.message);
      setLevels(lv || []);

      const mods = await fetchAll<any>(() => supabase.from('modules')
        .select('id, name_ar, level_id, semester').order('id'));
      setModules(mods);

      const recs = await fetchAll<AttRecord>(() => supabase.from('attendance_records')
        .select('id, session_id, student_id, status, module_id, group_number, session_date, is_makeup')
        .eq('status', ST_ABSENT).order('id'));
      setRecords(recs);

      const sess = await fetchAll<AttSession>(() => supabase.from('attendance_sessions')
        .select('*').eq('academic_year', ATT_YEAR).order('id'));
      setSessions(sess);

      const exc = await fetchAll<any>(() => supabase.from('attendance_exclusions')
        .select('*').eq('academic_year', ATT_YEAR).order('id'));
      setExclusions(exc);

      const js = await fetchAll<Justification>(() => supabase.from('absence_justifications')
        .select('*').order('created_at', { ascending: false }).order('id'));
      setJusts(js);

      const vr = await fetchAll<any>(() => supabase.from('justification_view_requests')
        .select('*').order('created_at', { ascending: false }).order('id'));
      setViewReqs(vr);

      const stIds = [...new Set([...recs.map(r => r.student_id), ...js.map(j => j.student_id), ...exc.map(e => e.student_id)])];
      const sts = stIds.length > 0
        ? await fetchByIds<any>('students', 'id, last_name, first_name, mat_etudiant, specialite, section, groupe, groupe_since', 'id', stIds)
        : [];
      setStudents(sts);

      const td = await fetchAll<any>(() => supabase.from('assignments')
        .select('id, professor_id, module_id, level_id, section_number, group_number, teaching_type')
        .eq('academic_year', ATT_YEAR).eq('semester', 1).eq('teaching_type', 'أعمال موجهة').order('id'));
      setTdAssignments(td);

      const pr = await fetchAll<any>(() => supabase.from('professors')
        .select('id, last_name, first_name').order('id'));
      setProfs(pr);
    } catch (e: any) {
      setError('تعذّر تحميل بيانات الغيابات: ' + (e?.message || e));
    }
    setLoading(false);
  }

  // ── فهارس ومجال رئيس القسم ───────────────────────────────────────────────
  const levelMap = useMemo(() => new Map(levels.map(l => [l.id, l])), [levels]);
  const moduleMap = useMemo(() => new Map(modules.map(m => [m.id, m])), [modules]);
  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
  const profMap = useMemo(() => new Map(profs.map(p => [p.id, `${p.last_name} ${p.first_name}`])), [profs]);

  const scopeLevelIds = useMemo(
    () => new Set(levels.filter(l => !department || l.department === department).map(l => l.id)),
    [levels, department],
  );
  const inScopeModule = (moduleId: string) => {
    const m = moduleMap.get(moduleId);
    return !!m && scopeLevelIds.has(m.level_id);
  };
  // مطابقة تخصص الطالب (نص) مع المستوى لمعرفة القسم
  const levelByName = useMemo(() => new Map(levels.map(l => [normalize(l.name_ar), l])), [levels]);
  const inScopeStudent = (st: any) => {
    if (!department) return true;
    const l = levelByName.get(normalize(st?.specialite));
    return !l || l.department === department;   // غير المطابَق يُعرض ولا يُخفى
  };

  const justsByStudent = useMemo(() => {
    const m = new Map<string, Justification[]>();
    for (const j of justs) { if (!m.has(j.student_id)) m.set(j.student_id, []); m.get(j.student_id)!.push(j); }
    return m;
  }, [justs]);

  const exclusionMap = useMemo(
    () => new Map(exclusions.map(e => [`${e.student_id}|${e.module_id}`, e])),
    [exclusions],
  );

  // ── صفوف المتابعة: طالب × مقياس ──────────────────────────────────────────
  const rows = useMemo(() => {
    const m = new Map<string, any>();
    for (const r of records) {
      if (!inScopeModule(r.module_id)) continue;
      const st = studentMap.get(r.student_id);
      if (!st) continue;
      const key = `${r.student_id}|${r.module_id}`;
      if (!m.has(key)) m.set(key, { key, student: st, module: moduleMap.get(r.module_id), count: 0, justified: 0, pending: 0, absences: [] as any[] });
      const row = m.get(key);
      const counts = recordCounts(r, st);
      const j = justificationFor(r.session_date, justsByStudent.get(r.student_id));
      row.absences.push({ ...r, counts, j });
      if (counts) {
        row.count++;
        if (j?.status === J_ACCEPTED) row.justified++;
        if (j?.status === J_PENDING) row.pending++;
      }
    }
    // مقصون مثبَّتون لا تظهر لهم غيابات (احتياط)
    const out = [...m.values()].map(row => {
      const exc = exclusionMap.get(row.key);
      const level = levelMap.get(row.module?.level_id);
      row.absences.sort((a: any, b: any) => dayOnly(a.session_date).localeCompare(dayOnly(b.session_date)));
      return { ...row, level, exclusion: exc || null, lvl: absenceLevel(row.count, !!exc) };
    }).filter(row => row.count > 0 || row.exclusion);
    out.sort((a, b) => (b.count - a.count)
      || (a.student.last_name || '').localeCompare(b.student.last_name || '', 'ar'));
    return out;
    /* eslint-disable-next-line */
  }, [records, studentMap, moduleMap, levelMap, justsByStudent, exclusionMap, scopeLevelIds]);

  const stats = useMemo(() => ({
    withAbs: new Set(rows.map(r => r.student.id)).size,
    warn: rows.filter(r => r.lvl === 'warn').length,
    limit: rows.filter(r => r.lvl === 'limit').length,
    excluded: rows.filter(r => r.lvl === 'excluded').length,
  }), [rows]);

  const scopedLevels = levels.filter(l => scopeLevelIds.has(l.id));
  const modulesOfLevel = modules
    .filter(m => (!fLevel || m.level_id === fLevel) && scopeLevelIds.has(m.level_id) && rows.some(r => r.module?.id === m.id))
    .sort((a, b) => (a.name_ar || '').localeCompare(b.name_ar || '', 'ar'));

  const shownRows = rows.filter(r => {
    if (fLevel && r.module?.level_id !== fLevel) return false;
    if (fModule && r.module?.id !== fModule) return false;
    if (fStatus === 'warn' && r.lvl !== 'warn') return false;
    if (fStatus === 'limit' && r.lvl !== 'limit') return false;
    if (fStatus === 'excluded' && r.lvl !== 'excluded') return false;
    if (q.trim()) {
      const t = `${r.student.last_name} ${r.student.first_name} ${r.student.mat_etudiant}`;
      if (!t.includes(q.trim())) return false;
    }
    return true;
  });

  // ── الإقصاء ──────────────────────────────────────────────────────────────
  async function confirmExclusion(row: any) {
    setBusy(row.key);
    const { error } = await supabase.from('attendance_exclusions').insert({
      student_id: row.student.id, module_id: row.module.id, academic_year: ATT_YEAR,
      absences_count: row.count, confirmed_by: adminName,
    });
    if (error) setMsg({ type: 'err', text: 'تعذّر تثبيت الإقصاء: ' + error.message });
    else { setMsg({ type: 'ok', text: `ثُبّت إقصاء ${row.student.last_name} ${row.student.first_name} من مقياس ${row.module.name_ar}` }); await load(); }
    setConfirmKey(null);
    setBusy(null);
  }

  async function cancelExclusion(row: any) {
    if (!row.exclusion) return;
    setBusy(row.key);
    const { error } = await supabase.from('attendance_exclusions').delete().eq('id', row.exclusion.id);
    if (error) setMsg({ type: 'err', text: 'تعذّر إلغاء الإقصاء: ' + error.message });
    else { setMsg({ type: 'ok', text: 'أُلغي تثبيت الإقصاء' }); await load(); }
    setConfirmKey(null);
    setBusy(null);
  }

  function printList(kind: 'excluded' | 'limit') {
    const list = rows.filter(r => r.lvl === kind
      && (!fLevel || r.module?.level_id === fLevel) && (!fModule || r.module?.id === fModule));
    if (list.length === 0) { setMsg({ type: 'err', text: 'لا يوجد طلبة في هذه القائمة' }); return; }
    const groups = new Map<string, any[]>();
    for (const r of list) {
      const k = `${r.level?.name_ar || ''} — ${r.module?.name_ar || ''}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const title = kind === 'excluded' ? 'قائمة الطلبة المقصيين' : 'قائمة الطلبة الذين بلغوا حد الإقصاء';
    const deptLine = department === 'عام' ? 'قسم القانون العام' : department === 'خاص' ? 'قسم القانون الخاص' : '';
    const body = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ar')).map(([k, rs]) => `
      <h3>${escHtml(k)}</h3>
      <table><thead><tr><th class="c" style="width:34px">الرقم</th><th>اللقب والاسم</th><th class="c">رقم التسجيل</th><th class="c" style="width:50px">الفوج</th><th class="c" style="width:70px">الغيابات</th><th>تواريخ الغياب</th></tr></thead><tbody>
      ${rs.sort((a, b) => (a.student.last_name || '').localeCompare(b.student.last_name || '', 'ar')).map((r, i) => `<tr>
        <td class="c">${i + 1}</td><td>${escHtml(r.student.last_name)} ${escHtml(r.student.first_name)}</td>
        <td class="c" dir="ltr">${escHtml(r.student.mat_etudiant)}</td><td class="c">${escHtml(r.student.groupe ?? '')}</td>
        <td class="c">${r.count}</td>
        <td>${r.absences.filter((a: any) => a.counts).map((a: any) => escHtml(fmtDayShort(a.session_date))).join('، ')}</td></tr>`).join('')}
      </tbody></table>`).join('');
    const w = window.open('', '_blank');
    if (!w) { setMsg({ type: 'err', text: 'المتصفح منع فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة لهذا الموقع' }); return; }
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
      @page{size:A4 portrait;margin:14mm 12mm}
      body{font-family:Arial,sans-serif;direction:rtl;color:#000;font-size:12px}
      .header{text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px;line-height:1.6;font-weight:bold;font-size:14px}
      h1{text-align:center;font-size:17px;margin:0 0 4px}
      .sub{text-align:center;font-size:12px;margin-bottom:12px}
      h3{font-size:13px;margin:14px 0 6px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #000;padding:5px 7px;text-align:right}
      th{background:#e5e5e5}.c{text-align:center}
      .sign{margin-top:40px;display:flex;justify-content:space-between}
      .sign .box{text-align:center;min-width:200px;font-weight:bold}
    </style></head><body>
      <div class="header"><div>جامعة محمد البشير الإبراهيمي — برج بوعريريج</div><div>كلية الحقوق والعلوم السياسية</div>${deptLine ? `<div>${deptLine}</div>` : ''}</div>
      <h1>${title}</h1>
      <div class="sub">السنة الجامعية ${ATT_YEAR.replace('-', '/')} — السداسي الأول — الأعمال الموجهة</div>
      ${body}
      <div class="sign"><div>حُرّر بتاريخ: ${fmtDay(todayISO())}</div><div class="box">رئيس القسم</div></div>
      <script>window.onload=function(){window.print();}<\/script>
    </body></html>`);
    w.document.close();
  }

  // ── التبريرات ────────────────────────────────────────────────────────────
  const scopedJusts = justs.filter(j => inScopeStudent(studentMap.get(j.student_id)));
  const pendingJusts = scopedJusts.filter(j => j.status === J_PENDING).length;
  const shownJusts = scopedJusts.filter(j => jFilter === 'all' || j.status === jFilter);

  function absencesCovered(j: Justification) {
    return records.filter(r => r.student_id === j.student_id
      && dayOnly(j.date_from) <= dayOnly(r.session_date) && dayOnly(r.session_date) <= dayOnly(j.date_to));
  }

  async function decideJust(j: Justification, status: string) {
    setBusy(j.id);
    const { error } = await supabase.from('absence_justifications').update({
      status, decided_by: adminName, decided_at: new Date().toISOString(),
      decision_note: (notes[j.id] || '').trim() || null,
    }).eq('id', j.id);
    if (error) setMsg({ type: 'err', text: 'تعذّر الحفظ: ' + error.message });
    else { setMsg({ type: 'ok', text: status === J_ACCEPTED ? 'قُبل التبرير' : 'رُفض التبرير' }); await load(); }
    setBusy(null);
  }

  // ── طلبات الاطلاع ────────────────────────────────────────────────────────
  const justMap = useMemo(() => new Map(justs.map(j => [j.id, j])), [justs]);
  const scopedViews = viewReqs.filter(v => {
    const j = justMap.get(v.justification_id);
    return j && inScopeStudent(studentMap.get(j.student_id));
  });
  const pendingViews = scopedViews.filter(v => v.status === J_PENDING).length;

  async function decideView(v: any, status: string) {
    setBusy(v.id);
    const { error } = await supabase.from('justification_view_requests').update({
      status, decided_by: adminName, decided_at: new Date().toISOString(),
    }).eq('id', v.id);
    if (error) setMsg({ type: 'err', text: 'تعذّر الحفظ: ' + error.message });
    else { setMsg({ type: 'ok', text: status === J_ACCEPTED ? 'سُمح للأستاذ بالاطلاع على الوثيقة' : 'رُفض طلب الاطلاع' }); await load(); }
    setBusy(null);
  }

  // ── تسجيل الأساتذة ───────────────────────────────────────────────────────
  const profRows = useMemo(() => {
    const sessByKey = new Map<string, AttSession[]>();
    for (const s of sessions) {
      const k = `${s.module_id}|${s.group_number}`;
      if (!sessByKey.has(k)) sessByKey.set(k, []);
      sessByKey.get(k)!.push(s);
    }
    const seen = new Set<string>();
    const out: any[] = [];
    for (const a of tdAssignments) {
      if (!scopeLevelIds.has(a.level_id)) continue;
      const k = `${a.module_id}|${a.group_number}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const ss = sessByKey.get(k) || [];
      const last = ss.map(s => dayOnly(s.session_date)).sort().pop() || '';
      out.push({
        key: k, level: levelMap.get(a.level_id), module: moduleMap.get(a.module_id),
        section: a.section_number, group: a.group_number,
        prof: a.professor_id ? (profMap.get(a.professor_id) || '—') : 'غير مُسنَد',
        count: ss.length, last,
      });
    }
    out.sort((a, b) => ((a.level?.display_order ?? 99) - (b.level?.display_order ?? 99))
      || (a.module?.name_ar || '').localeCompare(b.module?.name_ar || '', 'ar')
      || (a.group - b.group));
    return out;
  }, [tdAssignments, sessions, scopeLevelIds, levelMap, moduleMap, profMap]);
  const missingCount = profRows.filter(r => r.count === 0).length;

  // ═══════════════════════════════════════════════════════════════════════
  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-4 text-sm" dir="rtl">
      <p className="font-bold mb-1">{error}</p>
      <p className="text-xs">إن كانت هذه أول مرة، تأكد من تنفيذ استعلام SQL الخاص بالغيابات في Supabase ثم أعد تحميل الصفحة.</p>
      <button onClick={load} className="mt-3 flex items-center gap-2 bg-white border border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold">
        <RefreshCw className="w-3.5 h-3.5" /> إعادة المحاولة
      </button>
    </div>
  );

  const tabs: { key: Tab; label: string; icon: any; badge?: number }[] = [
    { key: 'follow', label: 'متابعة الغيابات', icon: UserX, badge: stats.limit },
    { key: 'justs', label: 'التبريرات', icon: FileText, badge: pendingJusts },
    { key: 'views', label: 'طلبات الاطلاع', icon: Eye, badge: pendingViews },
    { key: 'profs', label: 'تسجيل الأساتذة', icon: ClipboardList, badge: missingCount },
  ];

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      {/* ── الرأس ── */}
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UserX className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 text-xs font-semibold">الغيابات — الأعمال الموجهة</span>
            </div>
            <h2 className="font-bold text-base">
              {department === 'عام' ? 'قسم القانون العام' : department === 'خاص' ? 'قسم القانون الخاص' : 'جميع الأقسام'} — {ATT_YEAR}
            </h2>
            <p className="text-xs text-gray-300 mt-1">حد الإقصاء: {ABSENCE_LIMIT} غيابات، مبررة أو غير مبررة. الإقصاء لا يُعتمد إلا بعد تثبيته هنا.</p>
          </div>
          <button onClick={load} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="bg-white/10 rounded-xl p-3 text-center"><p className="text-xl font-bold">{stats.withAbs}</p><p className="text-[10px] text-gray-300 mt-0.5">طلبة لهم غيابات</p></div>
          <div className="bg-white/10 rounded-xl p-3 text-center"><p className="text-xl font-bold text-amber-300">{stats.warn}</p><p className="text-[10px] text-amber-200 mt-0.5">تحذير ({ABSENCE_WARN} أو {ABSENCE_LIMIT - 1} غيابات)</p></div>
          <div className="bg-white/10 rounded-xl p-3 text-center"><p className="text-xl font-bold text-red-300">{stats.limit}</p><p className="text-[10px] text-red-200 mt-0.5">بلغوا الحد — ينتظرون التثبيت</p></div>
          <div className="bg-white/10 rounded-xl p-3 text-center"><p className="text-xl font-bold">{stats.excluded}</p><p className="text-[10px] text-gray-300 mt-0.5">مقصون (مثبَّتون)</p></div>
        </div>
      </div>

      {/* ── التبويبات ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 flex flex-wrap gap-1">
        {tabs.map(({ key, label, icon: Icon, badge }) => (
          <button key={key} onClick={() => { setTab(key); setMsg(null); }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors ${
              tab === key ? 'bg-[#1a3a6b] text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            <Icon className="w-4 h-4" />
            {label}
            {!!badge && badge > 0 && (
              <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] flex items-center justify-center font-bold ${tab === key ? 'bg-white text-[#1a3a6b]' : 'bg-red-500 text-white'}`}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm border flex items-start justify-between gap-3 ${msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ════════ المتابعة ════════ */}
      {tab === 'follow' && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث بالاسم أو رقم التسجيل..."
                className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
            </div>
            <select value={fLevel} onChange={e => { setFLevel(e.target.value); setFModule(''); }}
              className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
              <option value="">كل المستويات</option>
              {scopedLevels.map(l => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
            </select>
            <select value={fModule} onChange={e => setFModule(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 max-w-[220px]">
              <option value="">كل المقاييس</option>
              {modulesOfLevel.map(m => <option key={m.id} value={m.id}>{m.name_ar}</option>)}
            </select>
            <select value={fStatus} onChange={e => setFStatus(e.target.value as any)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400">
              <option value="all">كل الحالات</option>
              <option value="warn">تحذير</option>
              <option value="limit">بلغ حد الإقصاء</option>
              <option value="excluded">مقصى</option>
            </select>
            <button onClick={() => printList('limit')}
              className="flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 px-3 py-2 rounded-xl text-xs font-bold">
              <Printer className="w-3.5 h-3.5" /> من بلغوا الحد
            </button>
            <button onClick={() => printList('excluded')}
              className="flex items-center gap-1.5 bg-[#1a3a6b] text-white hover:bg-[#0a1628] px-3 py-2 rounded-xl text-xs font-bold">
              <Printer className="w-3.5 h-3.5" /> قائمة المقصيين
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {shownRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                <UserX className="w-10 h-10 mb-3" />
                <p className="text-sm">{rows.length === 0 ? 'لم يُسجَّل أي غياب بعد' : 'لا توجد نتائج مطابقة'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#1a3a6b]/5 border-b border-gray-100 text-xs text-[#1a3a6b]">
                      <th className="px-3 py-2.5 text-right font-bold">الطالب</th>
                      <th className="px-3 py-2.5 text-right font-bold">المستوى</th>
                      <th className="px-3 py-2.5 text-center font-bold">الفوج</th>
                      <th className="px-3 py-2.5 text-right font-bold">المقياس</th>
                      <th className="px-3 py-2.5 text-center font-bold">الغيابات</th>
                      <th className="px-3 py-2.5 text-center font-bold">الحالة</th>
                      <th className="px-3 py-2.5 text-center font-bold">إجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {shownRows.map(r => {
                      const st = LEVEL_STYLE[r.lvl as keyof typeof LEVEL_STYLE];
                      const open = expanded === r.key;
                      return (
                        <Fragment key={r.key}>
                          <tr className="hover:bg-gray-50/60">
                            <td className="px-3 py-3">
                              <button onClick={() => setExpanded(open ? null : r.key)} className="flex items-center gap-1.5 text-right">
                                {open ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                                <span>
                                  <span className="block font-bold text-gray-800 text-xs">{r.student.last_name} {r.student.first_name}</span>
                                  <span className="block text-[10px] text-gray-400" dir="ltr" style={{ textAlign: 'right' }}>{r.student.mat_etudiant}</span>
                                </span>
                              </button>
                            </td>
                            <td className="px-3 py-3 text-xs text-gray-600">{r.level?.name_ar || '—'}</td>
                            <td className="px-3 py-3 text-xs text-center text-gray-600">{r.student.groupe ?? '—'}</td>
                            <td className="px-3 py-3 text-xs text-gray-800">{r.module?.name_ar || '—'}</td>
                            <td className="px-3 py-3 text-center whitespace-nowrap">
                              <span className="font-bold text-sm text-gray-800">{r.count}</span>
                              <span className="text-xs text-gray-400"> / {ABSENCE_LIMIT}</span>
                              {(r.justified > 0 || r.pending > 0) && (
                                <span className="block text-[10px] text-gray-400">
                                  {r.justified > 0 ? `${r.justified} مبرَّر` : ''}{r.justified > 0 && r.pending > 0 ? ' · ' : ''}{r.pending > 0 ? `${r.pending} قيد الدراسة` : ''}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full border whitespace-nowrap"
                                style={{ background: st.bg, color: st.color, borderColor: st.border }}>{st.label}</span>
                            </td>
                            <td className="px-3 py-3 text-center whitespace-nowrap">
                              {r.lvl === 'limit' && confirmKey !== r.key && (
                                <button onClick={() => setConfirmKey(r.key)}
                                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700">تثبيت الإقصاء</button>
                              )}
                              {r.lvl === 'limit' && confirmKey === r.key && (
                                <span className="inline-flex gap-1">
                                  <button onClick={() => confirmExclusion(r)} disabled={busy === r.key}
                                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-red-700 text-white disabled:opacity-50">تأكيد</button>
                                  <button onClick={() => setConfirmKey(null)}
                                    className="text-[11px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600">إلغاء</button>
                                </span>
                              )}
                              {r.lvl === 'excluded' && confirmKey !== r.key && (
                                <button onClick={() => setConfirmKey(r.key)}
                                  className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">إلغاء الإقصاء</button>
                              )}
                              {r.lvl === 'excluded' && confirmKey === r.key && (
                                <span className="inline-flex gap-1">
                                  <button onClick={() => cancelExclusion(r)} disabled={busy === r.key}
                                    className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gray-700 text-white disabled:opacity-50">تأكيد الإلغاء</button>
                                  <button onClick={() => setConfirmKey(null)}
                                    className="text-[11px] px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600">تراجع</button>
                                </span>
                              )}
                              {(r.lvl === 'ok' || r.lvl === 'warn') && <span className="text-gray-300">—</span>}
                            </td>
                          </tr>
                          {open && (
                            <tr className="bg-gray-50/70">
                              <td colSpan={7} className="px-5 py-3">
                                <p className="text-[11px] text-gray-500 mb-2">
                                  تواريخ الغياب
                                  {r.exclusion && <span className="text-red-700 font-bold"> — ثبّت الإقصاء: {r.exclusion.confirmed_by || '—'} يوم {fmtDay(r.exclusion.confirmed_at)}</span>}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {r.absences.map((a: any) => {
                                    const js = a.j ? J_STYLE[a.j.status] : null;
                                    return (
                                      <span key={a.id} className={`text-[11px] px-2.5 py-1 rounded-lg border ${a.counts ? 'bg-white border-gray-200 text-gray-700' : 'bg-gray-100 border-gray-200 text-gray-400 line-through'}`}
                                        title={a.counts ? '' : 'غير محتسب — قبل تاريخ الإدراج'}>
                                        {fmtDay(a.session_date)}{a.is_makeup ? ' (تعويضية)' : ''} — ف{a.group_number}
                                        {a.j && js && (
                                          <span className="mr-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border" style={{ background: js.bg, color: js.color, borderColor: js.border }}>
                                            {a.j.status === J_ACCEPTED ? 'مبرَّر' : a.j.status === J_PENDING ? 'قيد الدراسة' : 'تبرير مرفوض'}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════ التبريرات ════════ */}
      {tab === 'justs' && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
            {[[J_PENDING, 'تنتظر التأشير'], [J_ACCEPTED, 'مقبولة'], [J_REJECTED, 'مرفوضة'], ['all', 'الكل']].map(([k, l]) => (
              <button key={k} onClick={() => setJFilter(k)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${jFilter === k ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                {l} ({k === 'all' ? scopedJusts.length : scopedJusts.filter(j => j.status === k).length})
              </button>
            ))}
          </div>

          {shownJusts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-16 text-gray-300">
              <FileText className="w-10 h-10 mb-3" /><p className="text-sm">لا توجد تبريرات في هذه القائمة</p>
            </div>
          ) : shownJusts.map(j => {
            const st = studentMap.get(j.student_id);
            const js = J_STYLE[j.status] || J_STYLE[J_PENDING];
            const cov = absencesCovered(j);
            return (
              <div key={j.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{st ? `${st.last_name} ${st.first_name}` : '—'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{st?.specialite || ''}{st?.groupe ? ` — الفوج ${st.groupe}` : ''} — <span dir="ltr">{st?.mat_etudiant}</span></p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full border" style={{ background: js.bg, color: js.color, borderColor: js.border }}>{j.status}</span>
                </div>

                <div className="grid sm:grid-cols-3 gap-2 mt-3">
                  <div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] text-gray-400 mb-1">نوع المبرر</p><p className="text-sm font-bold text-gray-800">{j.kind}</p></div>
                  <div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] text-gray-400 mb-1">المدة</p><p className="text-sm font-bold text-gray-800">من {fmtDay(j.date_from)} إلى {fmtDay(j.date_to)}</p></div>
                  <div className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] text-gray-400 mb-1">تاريخ الإيداع</p><p className="text-sm font-bold text-gray-800">{fmtDay(j.created_at)}</p></div>
                </div>

                {j.reason && <p className="text-sm text-gray-700 mt-3 bg-gray-50 rounded-xl p-3 leading-relaxed">{j.reason}</p>}

                <p className="text-xs text-gray-500 mt-3">
                  {cov.length === 0
                    ? 'لا يغطي حالياً أي غياب مسجّل (قد يسجّل الأساتذة حصص هذه المدة لاحقاً).'
                    : <>يغطي {cov.length} غياب: {cov.map(r => `${moduleMap.get(r.module_id)?.name_ar || '—'} (${fmtDayShort(r.session_date)})`).join('، ')}</>}
                </p>

                {j.kind === KIND_ILLNESS && j.status === J_PENDING && (
                  <div className="mt-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>الشهادة المرضية يجب أن تكون ممنوحة أو مصادقاً عليها من طبيب المؤسسة الجامعية أو المؤسسة الاستشفائية المتعاقدة معها (المادة 37).</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  {j.file_url
                    ? <a href={j.file_url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border border-[#1a3a6b]/30 text-[#1a3a6b] hover:bg-[#1a3a6b]/5">
                        <Eye className="w-3.5 h-3.5" /> عرض الوثيقة
                      </a>
                    : <span className="text-xs text-red-500">لا توجد وثيقة مرفقة</span>}

                  {j.status === J_PENDING ? (
                    <>
                      <input value={notes[j.id] || ''} onChange={e => setNotes(n => ({ ...n, [j.id]: e.target.value }))}
                        placeholder="ملاحظة (اختياري)"
                        className="flex-1 min-w-[160px] border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400" />
                      <button onClick={() => decideJust(j, J_ACCEPTED)} disabled={busy === j.id}
                        className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50">
                        <Check className="w-3.5 h-3.5" /> قبول
                      </button>
                      <button onClick={() => decideJust(j, J_REJECTED)} disabled={busy === j.id}
                        className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50">
                        <X className="w-3.5 h-3.5" /> رفض
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-gray-500">
                      أشّر عليه: {j.decided_by || '—'} يوم {fmtDay(j.decided_at)}{j.decision_note ? ` — ${j.decision_note}` : ''}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* ════════ طلبات الاطلاع ════════ */}
      {tab === 'views' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {scopedViews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
              <Eye className="w-10 h-10 mb-3" /><p className="text-sm">لا توجد طلبات اطلاع</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {scopedViews.map(v => {
                const j = justMap.get(v.justification_id)!;
                const st = studentMap.get(j.student_id);
                const js = J_STYLE[v.status] || J_STYLE[J_PENDING];
                return (
                  <div key={v.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="flex-1 min-w-[220px]">
                      <p className="text-sm text-gray-800">
                        الأستاذ <span className="font-bold">{profMap.get(v.professor_id) || '—'}</span> يطلب الاطلاع على تبرير الطالب <span className="font-bold">{st ? `${st.last_name} ${st.first_name}` : '—'}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{j.kind} — من {fmtDay(j.date_from)} إلى {fmtDay(j.date_to)} — أُرسل الطلب يوم {fmtDay(v.created_at)}</p>
                    </div>
                    {v.status === J_PENDING ? (
                      <>
                        <button onClick={() => decideView(v, J_ACCEPTED)} disabled={busy === v.id}
                          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50">
                          <Check className="w-3.5 h-3.5" /> موافقة
                        </button>
                        <button onClick={() => decideView(v, J_REJECTED)} disabled={busy === v.id}
                          className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50">
                          <X className="w-3.5 h-3.5" /> رفض
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full border" style={{ background: js.bg, color: js.color, borderColor: js.border }}>
                        {v.status === J_ACCEPTED ? 'سُمح بالاطلاع' : 'رُفض الطلب'}{v.decided_by ? ` — ${v.decided_by}` : ''}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════ تسجيل الأساتذة ════════ */}
      {tab === 'profs' && (
        <>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-3">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-xs text-gray-600">{profRows.length} فوج أعمال موجهة — <span className="font-bold text-red-600">{missingCount}</span> لم تُسجَّل فيه أي حصة</span>
            <button onClick={() => setOnlyMissing(v => !v)}
              className={`mr-auto px-3 py-2 rounded-xl text-xs font-bold border ${onlyMissing ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-200 hover:bg-red-50'}`}>
              من لم يسجّل فقط
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#1a3a6b]/5 border-b border-gray-100 text-xs text-[#1a3a6b]">
                    <th className="px-3 py-2.5 text-right font-bold">المستوى</th>
                    <th className="px-3 py-2.5 text-right font-bold">المقياس</th>
                    <th className="px-3 py-2.5 text-center font-bold">الفوج</th>
                    <th className="px-3 py-2.5 text-right font-bold">الأستاذ</th>
                    <th className="px-3 py-2.5 text-center font-bold">الحصص المسجّلة</th>
                    <th className="px-3 py-2.5 text-center font-bold">آخر حصة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {profRows.filter(r => !onlyMissing || r.count === 0).map(r => (
                    <tr key={r.key} className={r.count === 0 ? 'bg-red-50/40' : 'hover:bg-gray-50/60'}>
                      <td className="px-3 py-2.5 text-xs text-gray-600">{r.level?.name_ar || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-gray-800">{r.module?.name_ar || '—'}</td>
                      <td className="px-3 py-2.5 text-xs text-center text-gray-600">{r.group}</td>
                      <td className="px-3 py-2.5 text-xs font-bold text-gray-700">{r.prof}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${r.count === 0 ? 'bg-red-100 text-red-700' : 'bg-green-50 text-green-700'}`}>{r.count}</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-center text-gray-500">{r.last ? fmtDay(r.last) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
