import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ATT_YEAR, ABSENCE_LIMIT, ST_PRESENT, ST_ABSENT, J_PENDING, J_ACCEPTED, J_REJECTED,
  AttRecord, AttSession, Justification,
  fmtDay, fmtDayShort, todayISO, dayOnly, recordCounts, concernedBy, justificationFor,
  absenceLevel, LEVEL_STYLE, J_STYLE, fetchAll, fetchByIds,
} from '../../lib/attendance';
import { Plus, Save, Trash2, X, Check, CalendarDays, AlertCircle, Eye, ArrowRight } from 'lucide-react';

interface Props {
  prof: any;
  assignment: any;          // module_id, level_id, section, group_number, assignment_id, module_name
  students: any[];          // id, last_name, first_name, mat_etudiant, groupe_since
}

type Mark = typeof ST_PRESENT | typeof ST_ABSENT;

export default function AttendancePanel({ prof, assignment, students }: Props) {
  const moduleId: string | undefined = assignment.module_id;
  const groupNumber: number = Number(assignment.group_number);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sessions, setSessions] = useState<AttSession[]>([]);
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [justs, setJusts] = useState<Justification[]>([]);
  const [viewReqs, setViewReqs] = useState<any[]>([]);

  // نموذج تسجيل حصة
  const [mode, setMode] = useState<'grid' | 'record'>('grid');
  const [date, setDate] = useState(todayISO());
  const [isMakeup, setIsMakeup] = useState(false);
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reqBusy, setReqBusy] = useState<string | null>(null);

  const studentIds = useMemo(() => students.map(s => s.id).filter(Boolean), [students]);
  const withGroup = useMemo(
    () => new Map(students.map(s => [s.id, { ...s, groupe: groupNumber }])),
    [students, groupNumber],
  );

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [moduleId, groupNumber, studentIds.join(',')]);

  async function load() {
    if (!moduleId) { setLoadError('تعذّر تحديد المقياس لهذه الحصة'); setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const sess = await fetchAll<AttSession>(() => supabase.from('attendance_sessions')
        .select('*').eq('module_id', moduleId).eq('group_number', groupNumber).eq('academic_year', ATT_YEAR)
        .order('session_date', { ascending: true }).order('id', { ascending: true }));
      setSessions(sess);

      if (studentIds.length > 0) {
        // كل سجلات طلبة الفوج في هذا المقياس (بما فيها ما سُجّل في فوج سابق)
        const recs: AttRecord[] = [];
        for (let i = 0; i < studentIds.length; i += 80) {
          const part = studentIds.slice(i, i + 80);
          const rows = await fetchAll<AttRecord>(() => supabase.from('attendance_records')
            .select('id, session_id, student_id, status, module_id, group_number, session_date, is_makeup')
            .eq('module_id', moduleId).in('student_id', part).order('id', { ascending: true }));
          recs.push(...rows);
        }
        setRecords(recs);

        const exc = await fetchByIds<any>('attendance_exclusions', 'student_id, module_id', 'student_id', studentIds);
        setExcluded(new Set(exc.filter(e => e.module_id === moduleId).map(e => e.student_id)));

        // التبريرات: بدون رابط الوثيقة — لا يُجلب إلا بعد موافقة رئيس القسم على طلب الاطلاع
        const js = await fetchByIds<Justification>('absence_justifications',
          'id, student_id, date_from, date_to, kind, status, created_at', 'student_id', studentIds);
        setJusts(js);

        if (prof?.id && js.length > 0) {
          const vr = await fetchByIds<any>('justification_view_requests',
            'id, justification_id, professor_id, status', 'justification_id', js.map(j => j.id));
          setViewReqs(vr.filter(v => v.professor_id === prof.id));
        } else setViewReqs([]);
      } else {
        setRecords([]); setExcluded(new Set()); setJusts([]); setViewReqs([]);
      }
    } catch (e: any) {
      setLoadError('تعذّر تحميل الغيابات: ' + (e?.message || e));
    }
    setLoading(false);
  }

  // ── فهارس ──
  const recBySession = useMemo(() => {
    const m = new Map<string, Map<string, AttRecord>>();
    for (const r of records) {
      if (!m.has(r.session_id)) m.set(r.session_id, new Map());
      m.get(r.session_id)!.set(r.student_id, r);
    }
    return m;
  }, [records]);

  const justsByStudent = useMemo(() => {
    const m = new Map<string, Justification[]>();
    for (const j of justs) { if (!m.has(j.student_id)) m.set(j.student_id, []); m.get(j.student_id)!.push(j); }
    return m;
  }, [justs]);

  const counts = useMemo(() => {
    const m = new Map<string, { total: number; other: number }>();
    for (const r of records) {
      const st = withGroup.get(r.student_id);
      if (!st || !recordCounts(r, st)) continue;
      const c = m.get(r.student_id) || { total: 0, other: 0 };
      c.total++;
      if (r.group_number !== groupNumber) c.other++;
      m.set(r.student_id, c);
    }
    return m;
  }, [records, withGroup, groupNumber]);

  const existing = useMemo(
    () => sessions.find(s => dayOnly(s.session_date) === date && !!s.is_makeup === isMakeup) || null,
    [sessions, date, isMakeup],
  );

  // تهيئة العلامات عند فتح النموذج أو تغيير التاريخ/النوع
  useEffect(() => {
    if (mode !== 'record') return;
    const next: Record<string, Mark> = {};
    const recs = existing ? recBySession.get(existing.id) : undefined;
    for (const s of students) {
      const r = recs?.get(s.id);
      next[s.id] = r?.status === ST_ABSENT ? ST_ABSENT : ST_PRESENT;
    }
    setMarks(next);
    setConfirmDelete(false);
    /* eslint-disable-next-line */
  }, [mode, date, isMakeup, existing?.id]);

  function openRecord(sess?: AttSession) {
    setMsg(null);
    if (sess) { setDate(dayOnly(sess.session_date)); setIsMakeup(!!sess.is_makeup); }
    else { setDate(todayISO()); setIsMakeup(false); }
    setMode('record');
  }

  async function save() {
    if (!moduleId) return;
    if (!date) { setMsg({ type: 'err', text: 'حدد تاريخ الحصة' }); return; }
    if (date > todayISO()) { setMsg({ type: 'err', text: 'لا يمكن تسجيل حصة بتاريخ لم يحن بعد' }); return; }
    setSaving(true);
    setMsg(null);
    try {
      let sess = existing;
      if (!sess) {
        const { data, error } = await supabase.from('attendance_sessions').insert({
          assignment_id: assignment.assignment_id || null,
          professor_id: prof?.id || null,
          module_id: moduleId,
          level_id: assignment.level_id || null,
          section_number: assignment.section ?? null,
          group_number: groupNumber,
          session_date: date,
          is_makeup: isMakeup,
          academic_year: ATT_YEAR,
        }).select().single();
        if (error || !data) throw new Error(error?.message || 'تعذّر إنشاء الحصة');
        sess = data as AttSession;
      }

      const concerned = students.filter(s => s.id && concernedBy(s, date));
      const rows = concerned.map(s => ({
        session_id: sess!.id,
        student_id: s.id,
        status: marks[s.id] === ST_ABSENT ? ST_ABSENT : ST_PRESENT,
        module_id: moduleId,
        group_number: groupNumber,
        session_date: date,
        is_makeup: isMakeup,
      }));
      if (rows.length > 0) {
        const { error } = await supabase.from('attendance_records')
          .upsert(rows, { onConflict: 'session_id,student_id' });
        if (error) throw new Error(error.message);
      }

      // طلبة القائمة الحالية غير المعنيين بهذا التاريخ (أُدرجوا بعده): يُحذف سجلهم إن وُجد
      const notConcerned = students.filter(s => s.id && !concernedBy(s, date)).map(s => s.id);
      const old = recBySession.get(sess.id);
      const toDelete = notConcerned.map(id => old?.get(id)?.id).filter(Boolean) as string[];
      if (toDelete.length > 0) {
        await supabase.from('attendance_records').delete().in('id', toDelete);
      }

      const absent = rows.filter(r => r.status === ST_ABSENT).length;
      await load();
      setMode('grid');
      setMsg({ type: 'ok', text: `تم حفظ حصة ${fmtDay(date)}${isMakeup ? ' (تعويضية)' : ''} — ${absent} غائب من ${rows.length}` });
    } catch (e: any) {
      setMsg({ type: 'err', text: 'تعذّر الحفظ: ' + (e?.message || e) });
    }
    setSaving(false);
  }

  async function deleteSession() {
    if (!existing) return;
    setSaving(true);
    const { error } = await supabase.from('attendance_sessions').delete().eq('id', existing.id);
    if (error) {
      setMsg({ type: 'err', text: 'تعذّر الحذف: ' + error.message });
    } else {
      await load();
      setMode('grid');
      setMsg({ type: 'ok', text: `حُذفت حصة ${fmtDay(date)}` });
    }
    setConfirmDelete(false);
    setSaving(false);
  }

  async function requestView(j: Justification) {
    if (!prof?.id) return;
    setReqBusy(j.id);
    const { error } = await supabase.from('justification_view_requests')
      .insert({ justification_id: j.id, professor_id: prof.id });
    if (error) setMsg({ type: 'err', text: 'تعذّر إرسال الطلب: ' + error.message });
    else { setMsg({ type: 'ok', text: 'أُرسل طلب الاطلاع إلى رئيس القسم' }); await load(); }
    setReqBusy(null);
  }

  async function openDocument(j: Justification) {
    setReqBusy(j.id);
    const { data } = await supabase.from('absence_justifications').select('file_url').eq('id', j.id).maybeSingle();
    setReqBusy(null);
    if (data?.file_url) window.open(data.file_url, '_blank');
    else setMsg({ type: 'err', text: 'لا توجد وثيقة مرفقة بهذا التبرير' });
  }

  // تبريرات تغطي غياباً واحداً على الأقل للطالب في هذا المقياس
  const relevantJusts = useMemo(() => {
    const out: { j: Justification; student: any; dates: string[] }[] = [];
    for (const j of justs) {
      const st = withGroup.get(j.student_id);
      if (!st) continue;
      const dates = records
        .filter(r => r.student_id === j.student_id && r.status === ST_ABSENT
          && dayOnly(j.date_from) <= dayOnly(r.session_date) && dayOnly(r.session_date) <= dayOnly(j.date_to))
        .map(r => dayOnly(r.session_date));
      if (dates.length > 0) out.push({ j, student: st, dates: [...new Set(dates)].sort() });
    }
    return out.sort((a, b) => (a.student.last_name || '').localeCompare(b.student.last_name || '', 'ar'));
  }, [justs, records, withGroup]);

  // ═══════════════════════════════════════════════════════════════════════
  if (loading) return <p className="text-center text-gray-400 text-sm py-16">جارٍ تحميل الغيابات...</p>;

  if (loadError) return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
      {loadError}
      <p className="text-xs mt-1 text-red-500">إن كانت هذه أول مرة، تأكد من تنفيذ استعلام SQL الخاص بالغيابات في قاعدة البيانات.</p>
    </div>
  );

  if (students.length === 0) return <p className="text-center text-gray-400 text-sm py-16">لا يوجد طلبة في هذا الفوج</p>;

  // ── نموذج تسجيل / تعديل حصة ──────────────────────────────────────────────
  if (mode === 'record') {
    const concerned = students.filter(s => concernedBy(s, date));
    const absentCount = concerned.filter(s => marks[s.id] === ST_ABSENT).length;
    return (
      <div className="space-y-3">
        <button onClick={() => { setMode('grid'); setMsg(null); }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#1a3a6b]">
          <ArrowRight className="w-4 h-4" /> رجوع إلى سجل الحصص
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">تاريخ الحصة</label>
              <input type="date" value={date} max={todayISO()} onChange={e => setDate(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 cursor-pointer select-none">
              <input type="checkbox" checked={isMakeup} onChange={e => setIsMakeup(e.target.checked)} className="w-4 h-4" />
              حصة تعويضية
            </label>
            <span className={`text-xs font-bold px-3 py-2 rounded-xl ${existing ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
              {existing ? 'تعديل حصة مسجّلة' : 'حصة جديدة'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            الجميع حاضر افتراضياً — اضغط على الطالب الغائب فقط.
            <span className="font-bold text-gray-600"> الغائبون: {absentCount} من {concerned.length}</span>
          </p>
        </div>

        {msg && msg.type === 'err' && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{msg.text}</div>
        )}

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {students.map((s, i) => {
            const ok = concernedBy(s, date);
            const absent = marks[s.id] === ST_ABSENT;
            return (
              <button key={s.id || i} disabled={!ok || saving}
                onClick={() => setMarks(m => ({ ...m, [s.id]: absent ? ST_PRESENT : ST_ABSENT }))}
                className={`w-full flex items-center gap-3 px-4 py-3 text-right transition-colors ${
                  !ok ? 'bg-gray-50 cursor-not-allowed' : absent ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
                }`}>
                <span className="w-7 text-center text-xs font-bold text-gray-400 flex-shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm font-bold ${!ok ? 'text-gray-400' : 'text-gray-800'}`}>{s.last_name} {s.first_name}</span>
                  {!ok && <span className="block text-[11px] text-gray-400 mt-0.5">غير معني — أُدرج في الفوج ابتداءً من {fmtDay(s.groupe_since)}</span>}
                </span>
                {ok && (
                  <span className={`flex-shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${
                    absent ? 'bg-red-600 text-white border-red-600' : 'bg-green-50 text-green-700 border-green-200'
                  }`}>
                    {absent ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    {absent ? 'غائب' : 'حاضر'}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2 sticky bottom-0 bg-[#f1f4f9] py-3">
          <button onClick={save} disabled={saving}
            className="flex-1 min-w-[160px] flex items-center justify-center gap-2 bg-[#1a3a6b] hover:bg-[#0a1628] text-white py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
            <Save className="w-4 h-4" /> {saving ? 'جارٍ الحفظ...' : existing ? 'حفظ التعديل' : 'حفظ الحصة'}
          </button>
          {existing && !confirmDelete && (
            <button onClick={() => setConfirmDelete(true)} disabled={saving}
              className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border border-red-200 text-red-600 bg-white hover:bg-red-50">
              <Trash2 className="w-4 h-4" /> حذف الحصة
            </button>
          )}
          {existing && confirmDelete && (
            <>
              <button onClick={deleteSession} disabled={saving}
                className="px-4 py-3 rounded-xl text-sm font-bold bg-red-600 text-white hover:bg-red-700">
                تأكيد حذف الحصة وكل غياباتها
              </button>
              <button onClick={() => setConfirmDelete(false)} disabled={saving}
                className="px-4 py-3 rounded-xl text-sm border border-gray-200 text-gray-600 bg-white">
                إلغاء
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── سجل الحصص (الجدول) ───────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => openRecord()}
          className="flex items-center gap-2 bg-[#c9a227] hover:bg-[#b08d1f] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
          <Plus className="w-4 h-4" /> تسجيل حصة
        </button>
        <span className="text-xs text-gray-500">
          {sessions.length === 0 ? 'لم تُسجَّل أي حصة بعد' : `${sessions.length} حصة مسجّلة — اضغط على تاريخ الحصة لتعديلها`}
        </span>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#1a3a6b] text-white text-xs">
                <th className="px-2 py-3 text-center font-bold w-9 sticky right-0 bg-[#1a3a6b] z-10">#</th>
                <th className="px-3 py-3 text-right font-bold sticky right-9 bg-[#1a3a6b] z-10 min-w-[150px]">اللقب والاسم</th>
                <th className="px-2 py-3 text-center font-bold whitespace-nowrap">الغيابات</th>
                {sessions.map(s => (
                  <th key={s.id} className="px-1 py-1.5 text-center font-bold">
                    <button onClick={() => openRecord(s)} title="تعديل الحصة"
                      className="px-2 py-1.5 rounded-lg hover:bg-white/15 transition-colors whitespace-nowrap">
                      {fmtDayShort(s.session_date)}
                      {s.is_makeup && <span className="block text-[9px] text-amber-300 font-normal">تعويضية</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((st, i) => {
                const c = counts.get(st.id) || { total: 0, other: 0 };
                const lvl = absenceLevel(c.total, excluded.has(st.id));
                const style = LEVEL_STYLE[lvl];
                const rowBg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
                return (
                  <tr key={st.id || i} className="border-b border-gray-100 last:border-b-0" style={{ background: rowBg }}>
                    <td className="px-2 py-2.5 text-center text-xs font-bold text-gray-400 sticky right-0 z-10" style={{ background: rowBg }}>{i + 1}</td>
                    <td className="px-3 py-2.5 sticky right-9 z-10" style={{ background: rowBg }}>
                      <span className="font-bold text-gray-800 text-xs sm:text-sm">{st.last_name} {st.first_name}</span>
                      {st.groupe_since && <span className="block text-[10px] text-amber-600">إدراج {fmtDay(st.groupe_since)}</span>}
                      {c.other > 0 && <span className="block text-[10px] text-gray-400">منها {c.other} في فوج سابق</span>}
                    </td>
                    <td className="px-2 py-2.5 text-center whitespace-nowrap">
                      <span className="inline-block text-xs font-bold px-2.5 py-1 rounded-full border"
                        style={{ background: style.bg, color: style.color, borderColor: style.border }}>
                        {lvl === 'excluded' ? 'مقصى' : `${c.total} / ${ABSENCE_LIMIT}`}
                      </span>
                      {lvl === 'limit' && <span className="block text-[10px] text-red-600 font-bold mt-0.5">بلغ حد الإقصاء</span>}
                    </td>
                    {sessions.map(s => {
                      const r = recBySession.get(s.id)?.get(st.id);
                      if (!r) return <td key={s.id} className="px-1 py-2.5 text-center text-gray-300 text-xs">—</td>;
                      if (r.status !== ST_ABSENT) return <td key={s.id} className="px-1 py-2.5 text-center text-green-600"><Check className="w-4 h-4 inline" /></td>;
                      const j = justificationFor(r.session_date, justsByStudent.get(st.id));
                      const notCounted = !recordCounts(r, withGroup.get(st.id));
                      const js = j ? J_STYLE[j.status] : null;
                      return (
                        <td key={s.id} className="px-1 py-2.5 text-center">
                          <span className="inline-flex flex-col items-center leading-none"
                            title={j ? `تبرير: ${j.status}` : notCounted ? 'غير محتسب (قبل تاريخ الإدراج)' : 'غياب'}>
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${notCounted ? 'bg-gray-200 text-gray-500' : 'bg-red-600 text-white'}`}>غ</span>
                            {j && js && (
                              <span className="text-[9px] font-bold mt-1 px-1.5 py-0.5 rounded-full border whitespace-nowrap"
                                style={{ background: js.bg, color: js.color, borderColor: js.border }}>
                                {j.status === J_ACCEPTED ? 'مبرَّر' : j.status === J_PENDING ? 'قيد الدراسة' : 'مرفوض'}
                              </span>
                            )}
                          </span>
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

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500 px-1">
        <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-600" /> حاضر</span>
        <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-full bg-red-600 text-white text-[9px] flex items-center justify-center font-bold">غ</span> غائب</span>
        <span>— غير معني أو لم يكن في الفوج</span>
        <span className="flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> العدّ يشمل كل غيابات الطالب في المقياس، مبرَّرة أو لا</span>
      </div>

      {/* التبريرات */}
      {relevantJusts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#1a3a6b]" />
            <h4 className="font-bold text-gray-800 text-sm">تبريرات الغياب</h4>
          </div>
          <div className="divide-y divide-gray-100">
            {relevantJusts.map(({ j, student, dates }) => {
              const js = J_STYLE[j.status] || J_STYLE[J_PENDING];
              const vr = viewReqs.find(v => v.justification_id === j.id);
              return (
                <div key={j.id} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-bold text-gray-800">{student.last_name} {student.first_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {j.kind} — من {fmtDay(j.date_from)} إلى {fmtDay(j.date_to)}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5">يغطي غياب: {dates.map(d => fmtDayShort(d)).join('، ')}</p>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full border"
                    style={{ background: js.bg, color: js.color, borderColor: js.border }}>
                    {j.status === J_ACCEPTED ? 'مبرَّر' : j.status === J_REJECTED ? 'تبرير مرفوض' : 'قيد الدراسة'}
                  </span>
                  {!vr && (
                    <button onClick={() => requestView(j)} disabled={reqBusy === j.id}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-[#1a3a6b]/30 text-[#1a3a6b] hover:bg-[#1a3a6b]/5 disabled:opacity-50">
                      <Eye className="w-3.5 h-3.5" /> طلب الاطلاع على الوثيقة
                    </button>
                  )}
                  {vr?.status === J_PENDING && <span className="text-xs text-amber-700 font-medium">طلب الاطلاع ينتظر موافقة رئيس القسم</span>}
                  {vr?.status === J_REJECTED && <span className="text-xs text-red-600 font-medium">رُفض طلب الاطلاع</span>}
                  {vr?.status === J_ACCEPTED && (
                    <button onClick={() => openDocument(j)} disabled={reqBusy === j.id}
                      className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-[#1a3a6b] text-white hover:bg-[#0a1628] disabled:opacity-50">
                      <Eye className="w-3.5 h-3.5" /> فتح الوثيقة
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
