import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ATT_YEAR, ABSENCE_LIMIT, J_ACCEPTED, J_PENDING, AttRecord, AttSession, Justification,
  fmtDay, fmtDayShort, todayISO, dayOnly, recordCounts, justificationFor, concernedBy,
  absenceLevel, LEVEL_STYLE, escHtml,
} from '../../lib/attendance';
import { Printer, ArrowRight, Users, Loader2 } from 'lucide-react';

// تصفح الغيابات: بالمستوى (المستوى ← المجموعة ← الفوج) أو بالأستاذ. الوحدة هي الفوج.

const TOTAL = 14;
const pad = (n: any) => (n == null ? '' : String(n).padStart(2, '0'));

interface Props {
  mode: 'level' | 'prof';
  levels: any[];                 // المستويات في نطاق الحساب
  modules: any[];
  records: AttRecord[];          // الغيابات فقط
  sessions: AttSession[];
  tdAssignments: any[];
  profMap: Map<string, string>;
  exclusionMap: Map<string, any>;
  justsByStudent: Map<string, Justification[]>;
  department: string | null;
  onModeChange?: (m: 'level' | 'prof') => void;
}

interface Sel { level: string; section: number | null; group: number | null; module: string | null }

export default function AttendanceBrowser(p: Props) {
  const [sel, setSel] = useState<Sel>({ level: '', section: null, group: null, module: null });
  const [mode, setMode] = useState(p.mode);
  useEffect(() => { setMode(p.mode); }, [p.mode]);

  const levelMap = useMemo(() => new Map(p.levels.map(l => [l.id, l])), [p.levels]);
  const moduleMap = useMemo(() => new Map(p.modules.map(m => [m.id, m])), [p.modules]);
  const tds = useMemo(() => p.tdAssignments.filter(a => levelMap.has(a.level_id)), [p.tdAssignments, levelMap]);

  // فتح ورقة حضور من جهة الأستاذ: ننتقل إلى الفوج نفسه
  function openSheet(a: any) {
    setSel({ level: a.level_id, section: a.section_number, group: a.group_number, module: a.module_id });
    setMode('level');
    p.onModeChange?.('level');
  }

  if (mode === 'prof') return <ByProf {...p} tds={tds} levelMap={levelMap} moduleMap={moduleMap} onOpen={openSheet} />;
  return <ByLevel {...p} tds={tds} levelMap={levelMap} moduleMap={moduleMap} sel={sel} setSel={setSel} />;
}

// ═══ بالمستوى ═══════════════════════════════════════════════════════════════

function ByLevel(p: Props & { tds: any[]; levelMap: Map<string, any>; moduleMap: Map<string, any>; sel: Sel; setSel: (s: Sel) => void }) {
  const { sel, setSel } = p;
  const levelOpts = p.levels.filter(l => p.tds.some(a => a.level_id === l.id));
  const sections = [...new Set(p.tds.filter(a => a.level_id === sel.level).map(a => a.section_number))].filter(x => x != null).sort((a, b) => a - b);
  const groups = [...new Set(p.tds.filter(a => a.level_id === sel.level && a.section_number === sel.section).map(a => a.group_number))].filter(x => x != null).sort((a, b) => a - b);

  // مقاييس الفوج وأساتذتها
  const groupMods = useMemo(() => {
    const seen = new Map<string, any>();
    for (const a of p.tds) {
      if (a.level_id !== sel.level || a.section_number !== sel.section || a.group_number !== sel.group) continue;
      if (!seen.has(a.module_id)) seen.set(a.module_id, {
        id: a.module_id, name: p.moduleMap.get(a.module_id)?.name_ar || '—',
        prof: a.professor_id ? (p.profMap.get(a.professor_id) || '—') : 'غير مُسنَد',
        // عدد الحصص المسجلة لهذا المقياس في هذا الفوج
        done: p.sessions.filter(s => s.module_id === a.module_id && s.group_number === sel.group
          && (s.level_id == null || s.level_id === sel.level) && (s.section_number == null || s.section_number === sel.section)).length,
      });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }, [p.tds, sel, p.moduleMap, p.profMap, p.sessions]);
  const doneTotal = groupMods.reduce((t, m) => t + m.done, 0);

  // طلبة الفوج كاملين
  const [studs, setStuds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const level = p.levelMap.get(sel.level);
  useEffect(() => {
    setStuds([]); setErr('');
    if (!level || sel.section == null || sel.group == null) return;
    setLoading(true);
    supabase.from('students').select('id, last_name, first_name, mat_etudiant, section, groupe, groupe_since')
      .eq('specialite', level.name_ar).eq('section', sel.section).eq('groupe', sel.group)
      .order('last_name').limit(500)
      .then(({ data, error }) => { if (error) setErr(error.message); else setStuds(data || []); setLoading(false); });
  }, [level?.id, level?.name_ar, sel.section, sel.group]);

  const [onlyAbs, setOnlyAbs] = useState(false);
  const [cell, setCell] = useState<{ st: string; mod: string } | null>(null);

  // الغيابات المحتسبة لكل طالب × مقياس
  const counts = useMemo(() => {
    const ids = new Set(studs.map(s => s.id));
    const sm = new Map(studs.map(s => [s.id, s]));
    const modIds = new Set(groupMods.map(m => m.id));
    const m = new Map<string, AttRecord[]>();
    for (const r of p.records) {
      if (!ids.has(r.student_id) || !modIds.has(r.module_id)) continue;
      if (!recordCounts(r, sm.get(r.student_id))) continue;
      const k = r.student_id + '|' + r.module_id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [studs, groupMods, p.records]);

  const lvlOf = (st: string, mod: string) => absenceLevel((counts.get(st + '|' + mod) || []).length, !!p.exclusionMap.get(st + '|' + mod));
  const shown = onlyAbs ? studs.filter(s => groupMods.some(m => (counts.get(s.id + '|' + m.id) || []).length > 0)) : studs;

  const head = level ? `${level.name_ar} — المجموعة ${pad(sel.section)} — الفوج ${pad(sel.group)}` : '';

  function printGroup() {
    const rowsHtml = shown.map((s, i) => `<tr><td class="c">${i + 1}</td><td>${escHtml(s.last_name)} ${escHtml(s.first_name)}</td><td class="c" dir="ltr">${escHtml(s.mat_etudiant)}</td>${
      groupMods.map(m => { const n = (counts.get(s.id + '|' + m.id) || []).length; const l = lvlOf(s.id, m.id);
        return `<td class="c${l === 'limit' || l === 'excluded' ? ' r' : l === 'warn' ? ' w' : ''}">${n || ''}${l === 'excluded' ? ' م' : ''}</td>`; }).join('')}</tr>`).join('');
    printDoc(`غيابات الفوج — ${head}`, p.department,
      `<table><thead><tr><th class="c" style="width:30px">الرقم</th><th>اللقب والاسم</th><th class="c">رقم التسجيل</th>${groupMods.map(m => `<th class="c">${escHtml(m.name)}<br><span class="sm">${m.done} / ${TOTAL} حصة</span></th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>
       <p class="note">الأرقام: عدد الغيابات المحتسبة. حد الإقصاء ${ABSENCE_LIMIT}. «م»: إقصاء مثبَّت.</p>`, groupMods.length > 4);
  }

  // ورقة الحضور لمقياس
  if (sel.module && level) {
    const mod = groupMods.find(m => m.id === sel.module) || { id: sel.module, name: p.moduleMap.get(sel.module)?.name_ar || '—', prof: '—' };
    return <Sheet p={p} level={level} sel={sel} mod={mod} studs={studs} loading={loading} onBack={() => setSel({ ...sel, module: null })} />;
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
        <select value={sel.level} onChange={e => setSel({ level: e.target.value, section: null, group: null, module: null })}
          className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white">
          <option value="">اختر المستوى</option>
          {levelOpts.map(l => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
        </select>
        <select value={sel.section ?? ''} disabled={!sel.level} onChange={e => setSel({ ...sel, section: e.target.value ? Number(e.target.value) : null, group: null, module: null })}
          className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white disabled:opacity-40">
          <option value="">المجموعة</option>
          {sections.map(s => <option key={s} value={s}>المجموعة {pad(s)}</option>)}
        </select>
        <select value={sel.group ?? ''} disabled={sel.section == null} onChange={e => setSel({ ...sel, group: e.target.value ? Number(e.target.value) : null, module: null })}
          className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white disabled:opacity-40">
          <option value="">الفوج</option>
          {groups.map(g => <option key={g} value={g}>الفوج {pad(g)}</option>)}
        </select>
        {sel.group != null && (
          <>
            <div className="flex bg-gray-100 rounded-lg p-1 text-xs mr-auto">
              <button onClick={() => setOnlyAbs(false)} className={`px-3 py-1.5 rounded-md font-semibold ${!onlyAbs ? 'bg-white shadow text-[#1a3a6b]' : 'text-gray-500'}`}>كل الطلبة</button>
              <button onClick={() => setOnlyAbs(true)} className={`px-3 py-1.5 rounded-md font-semibold ${onlyAbs ? 'bg-white shadow text-[#1a3a6b]' : 'text-gray-500'}`}>الغائبون فقط</button>
            </div>
            <button onClick={printGroup} disabled={!studs.length}
              className="flex items-center gap-1.5 bg-[#1a3a6b] text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40">
              <Printer className="w-3.5 h-3.5" /> طباعة
            </button>
          </>
        )}
      </div>

      {sel.group == null ? (
        <Empty text="اختر المستوى ثم المجموعة ثم الفوج" />
      ) : loading ? <Spin /> : err ? <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{err}</p> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <p className="px-4 py-3 text-sm font-bold text-gray-800 border-b border-gray-100">{head} <span className="text-xs font-normal text-gray-400">({studs.length} طالبا — الحصص المسجلة: {doneTotal} / {groupMods.length * TOTAL})</span></p>
          {groupMods.length === 0 ? <Empty text="لا توجد أعمال موجهة مسندة لهذا الفوج" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1a3a6b]/5 text-[#1a3a6b]">
                    <th className="px-3 py-2.5 text-right font-bold sticky right-0 bg-[#f3f5f9] min-w-[150px]">الطالب</th>
                    {groupMods.map(m => (
                      <th key={m.id} className="px-2 py-2 text-center font-bold min-w-[90px]">
                        <button onClick={() => setSel({ ...sel, module: m.id })} className="underline decoration-dotted underline-offset-4 hover:text-amber-700" title="ورقة الحضور">{m.name}</button>
                        <span className="block text-[10px] font-normal text-gray-400 mt-0.5">{m.prof}</span>
                        <span className={`inline-block mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${m.done === 0 ? 'bg-red-100 text-red-700' : m.done >= TOTAL ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{m.done} / {TOTAL} حصة</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {shown.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-2 sticky right-0 bg-white">
                        <span className="block font-bold text-gray-800">{s.last_name} {s.first_name}</span>
                        <span className="block text-[10px] text-gray-400" dir="ltr" style={{ textAlign: 'right' }}>{s.mat_etudiant}</span>
                      </td>
                      {groupMods.map(m => {
                        const list = counts.get(s.id + '|' + m.id) || [];
                        const l = lvlOf(s.id, m.id);
                        const st = LEVEL_STYLE[l];
                        const on = cell?.st === s.id && cell?.mod === m.id;
                        return (
                          <td key={m.id} className="px-2 py-2 text-center">
                            {list.length === 0 && l !== 'excluded' ? <span className="text-gray-300">0</span> : (
                              <button onClick={() => setCell(on ? null : { st: s.id, mod: m.id })}
                                className={`min-w-[34px] px-2 py-1 rounded-lg border font-bold ${on ? 'ring-2 ring-[#1a3a6b]/30' : ''}`}
                                style={{ background: st.bg, color: st.color, borderColor: st.border }} title={st.label}>
                                {list.length}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {cell && (() => {
            const s = studs.find(x => x.id === cell.st); const m = groupMods.find(x => x.id === cell.mod);
            const list = (counts.get(cell.st + '|' + cell.mod) || []).slice().sort((a, b) => dayOnly(a.session_date).localeCompare(dayOnly(b.session_date)));
            const exc = p.exclusionMap.get(cell.st + '|' + cell.mod);
            return (
              <div className="border-t border-gray-100 bg-gray-50/70 px-4 py-3">
                <p className="text-xs text-gray-600 mb-2"><b>{s?.last_name} {s?.first_name}</b> — {m?.name}
                  {exc && <span className="text-red-700 font-bold"> — إقصاء مثبَّت: {exc.confirmed_by || '—'} يوم {fmtDay(exc.confirmed_at)}</span>}</p>
                <div className="flex flex-wrap gap-2">
                  {list.map(a => {
                    const j = justificationFor(a.session_date, p.justsByStudent.get(cell.st));
                    return (
                      <span key={a.id || a.session_id} className="text-[11px] px-2.5 py-1 rounded-lg border bg-white border-gray-200 text-gray-700">
                        {fmtDay(a.session_date)}{a.is_makeup ? ' (تعويضية)' : ''}
                        {j && <span className={`mr-1.5 font-bold ${j.status === J_ACCEPTED ? 'text-green-700' : j.status === J_PENDING ? 'text-amber-700' : 'text-red-700'}`}>
                          {j.status === J_ACCEPTED ? 'مبرَّر' : j.status === J_PENDING ? 'قيد الدراسة' : 'تبرير مرفوض'}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ═══ ورقة الحضور: الطلبة × الحصص الأربع عشرة ═══════════════════════════════

function Sheet({ p, level, sel, mod, studs, loading, onBack }: {
  p: Props; level: any; sel: Sel; mod: { id: string; name: string; prof: string }; studs: any[]; loading: boolean; onBack: () => void;
}) {
  const sess = p.sessions
    .filter(s => s.module_id === mod.id && s.group_number === sel.group
      && (s.level_id == null || s.level_id === sel.level) && (s.section_number == null || s.section_number === sel.section))
    .sort((a, b) => dayOnly(a.session_date).localeCompare(dayOnly(b.session_date)));
  const absent = new Set(p.records.filter(r => r.module_id === mod.id).map(r => r.session_id + '|' + r.student_id));
  const cols = Array.from({ length: Math.max(TOTAL, sess.length) }, (_, i) => sess[i] || null);

  const mark = (s: any, se: AttSession | null) => {
    if (!se) return '';
    if (!concernedBy(s, se.session_date)) return '—';
    return absent.has(se.id + '|' + s.id) ? 'غ' : '✓';
  };
  const countOf = (s: any) => sess.filter(se => concernedBy(s, se.session_date) && absent.has(se.id + '|' + s.id)).length;

  function print() {
    const head = `<tr><th class="c" style="width:26px">الرقم</th><th>اللقب والاسم</th>${cols.map((se, i) => `<th class="c sm">${i + 1}${se ? `<br>${escHtml(fmtDayShort(se.session_date))}` : ''}</th>`).join('')}<th class="c">المجموع</th></tr>`;
    const body = studs.map((s, i) => `<tr><td class="c">${i + 1}</td><td>${escHtml(s.last_name)} ${escHtml(s.first_name)}</td>${cols.map(se => { const v = mark(s, se); return `<td class="c${v === 'غ' ? ' r' : ''}">${v === '✓' ? '' : v}</td>`; }).join('')}<td class="c">${countOf(s) || ''}</td></tr>`).join('');
    printDoc(`ورقة الحضور — ${mod.name}`, p.department,
      `<p class="sub2">${escHtml(level.name_ar)} — المجموعة ${pad(sel.section)} — الفوج ${pad(sel.group)} — الأستاذ: ${escHtml(mod.prof)}</p>
       <table><thead>${head}</thead><tbody>${body}</tbody></table><p class="note">«غ»: غائب. «—»: غير معني (قبل تاريخ إدراجه في الفوج).</p>`, true);
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-[#1a3a6b] border border-gray-200 rounded-xl px-3 py-2"><ArrowRight className="w-3.5 h-3.5" /> الفوج</button>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-800">{mod.name}</p>
          <p className="text-[11px] text-gray-500">{level.name_ar} — م{pad(sel.section)} ف{pad(sel.group)} — {mod.prof} — {sess.length} / {TOTAL} حصة مسجلة</p>
        </div>
        <button onClick={print} disabled={!studs.length} className="mr-auto flex items-center gap-1.5 bg-[#1a3a6b] text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40">
          <Printer className="w-3.5 h-3.5" /> طباعة
        </button>
      </div>
      {loading ? <Spin /> : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="bg-[#1a3a6b]/5 text-[#1a3a6b]">
                <th className="px-3 py-2 text-right font-bold sticky right-0 bg-[#f3f5f9] min-w-[150px]">الطالب</th>
                {cols.map((se, i) => (
                  <th key={i} className="px-1.5 py-2 text-center font-bold min-w-[38px]">
                    {i + 1}<span className="block text-[9px] font-normal text-gray-400">{se ? fmtDayShort(se.session_date) : ''}</span>
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-bold">المجموع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {studs.map(s => {
                const n = countOf(s);
                const st = LEVEL_STYLE[absenceLevel(n, !!p.exclusionMap.get(s.id + '|' + mod.id))];
                return (
                  <tr key={s.id}>
                    <td className="px-3 py-1.5 sticky right-0 bg-white font-semibold text-gray-800">{s.last_name} {s.first_name}</td>
                    {cols.map((se, i) => {
                      const v = mark(s, se);
                      return <td key={i} className={`text-center py-1.5 ${v === 'غ' ? 'bg-red-50 text-red-700 font-bold' : v === '✓' ? 'text-green-600' : 'text-gray-300'}`}>{v}</td>;
                    })}
                    <td className="px-2 py-1.5 text-center">
                      <span className="inline-block min-w-[28px] px-1.5 py-0.5 rounded-md border font-bold" style={{ background: st.bg, color: st.color, borderColor: st.border }}>{n}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══ بالأستاذ: سطر لكل فوج ═════════════════════════════════════════════════

function ByProf(p: Props & { tds: any[]; levelMap: Map<string, any>; moduleMap: Map<string, any>; onOpen: (a: any) => void }) {
  const [fLevel, setFLevel] = useState('');
  const [fProf, setFProf] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);

  // الحصص المسجلة لكل (مستوى، مجموعة، فوج، مقياس)
  const sessBy = useMemo(() => {
    const m = new Map<string, AttSession[]>();
    for (const s of p.sessions) {
      const k = `${s.module_id}|${s.group_number}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [p.sessions]);

  // عدد الطلبة في تحذير أو أكثر لكل مقياس × فوج
  const alertsBy = useMemo(() => {
    // المفتاح من الحصة نفسها: المستوى والمجموعة والفوج والمقياس
    const sessMap = new Map(p.sessions.map(s => [s.id, s]));
    const per = new Map<string, number>();
    for (const r of p.records) {
      const se = sessMap.get(r.session_id);
      const k = `${r.module_id}|${se?.level_id ?? ''}|${se?.section_number ?? ''}|${r.group_number}|${r.student_id}`;
      per.set(k, (per.get(k) || 0) + 1);
    }
    const out = new Map<string, { warn: number; limit: number }>();
    for (const [k, n] of per) {
      const [mod, lv, sec, grp, st] = k.split('|');
      const l = absenceLevel(n, !!p.exclusionMap.get(st + '|' + mod));
      if (l === 'ok') continue;
      const key = `${mod}|${lv}|${sec}|${grp}`;
      const o = out.get(key) || { warn: 0, limit: 0 };
      if (l === 'warn') o.warn++; else o.limit++;
      out.set(key, o);
    }
    return out;
  }, [p.records, p.sessions, p.exclusionMap]);

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const a of p.tds) {
      const k = `${a.level_id}|${a.section_number}|${a.group_number}|${a.module_id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const ss = (sessBy.get(`${a.module_id}|${a.group_number}`) || [])
        .filter(s => (s.level_id == null || s.level_id === a.level_id) && (s.section_number == null || s.section_number === a.section_number));
      const last = ss.map(s => dayOnly(s.session_date)).sort().pop() || '';
      out.push({
        key: k, a, level: p.levelMap.get(a.level_id), module: p.moduleMap.get(a.module_id)?.name_ar || '—',
        profId: a.professor_id || '', prof: a.professor_id ? (p.profMap.get(a.professor_id) || '—') : 'غير مُسنَد',
        count: ss.length, last, alerts: alertsBy.get(`${a.module_id}|${a.level_id}|${a.section_number}|${a.group_number}`) || alertsBy.get(`${a.module_id}|||${a.group_number}`) || { warn: 0, limit: 0 },
      });
    }
    out.sort((x, y) => x.prof.localeCompare(y.prof, 'ar') || ((x.level?.display_order ?? 99) - (y.level?.display_order ?? 99))
      || (x.a.section_number - y.a.section_number) || (x.a.group_number - y.a.group_number));
    return out;
  }, [p.tds, sessBy, alertsBy, p.levelMap, p.moduleMap, p.profMap]);

  const profOpts = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => { if (!fLevel || r.a.level_id === fLevel) m.set(r.profId, r.prof); });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'ar'));
  }, [rows, fLevel]);

  const shown = rows.filter(r => (!fLevel || r.a.level_id === fLevel) && (!fProf || r.profId === fProf) && (!onlyMissing || r.count === 0));
  const missing = shown.filter(r => r.count === 0).length;
  const doneTotal = shown.reduce((t, r) => t + r.count, 0);
  const levelOpts = p.levels.filter(l => p.tds.some(a => a.level_id === l.id));

  function print() {
    const body = shown.map((r, i) => `<tr><td class="c">${i + 1}</td><td>${escHtml(r.prof)}</td><td>${escHtml(r.level?.name_ar)}</td><td class="c">${pad(r.a.section_number)}</td><td class="c">${pad(r.a.group_number)}</td><td>${escHtml(r.module)}</td><td class="c${r.count === 0 ? ' r' : ''}">${r.count} / ${TOTAL}</td><td class="c">${r.last ? escHtml(fmtDayShort(r.last)) : '—'}</td></tr>`).join('');
    printDoc('متابعة تسجيل الغيابات من طرف الأساتذة', p.department,
      `<table><thead><tr><th class="c">الرقم</th><th>الأستاذ</th><th>المستوى</th><th class="c">المجموعة</th><th class="c">الفوج</th><th>المقياس</th><th class="c">الحصص</th><th class="c">آخر حصة</th></tr></thead><tbody>${body}</tbody></table>`, false);
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex flex-wrap items-center gap-2">
        <select value={fLevel} onChange={e => { setFLevel(e.target.value); setFProf(''); }} className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white">
          <option value="">كل المستويات</option>
          {levelOpts.map(l => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
        </select>
        <select value={fProf} onChange={e => setFProf(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-xs bg-white max-w-[220px]">
          <option value="">كل الأساتذة</option>
          {profOpts.map(([id, n]) => <option key={id || 'none'} value={id}>{n}</option>)}
        </select>
        <button onClick={() => setOnlyMissing(v => !v)}
          className={`px-3 py-2 rounded-xl text-xs font-bold border ${onlyMissing ? 'bg-red-600 text-white border-red-600' : 'bg-white text-red-600 border-red-200'}`}>
          لم يسجّل أي حصة
        </button>
        <span className="text-xs text-gray-500 mr-auto flex items-center gap-1"><Users className="w-3.5 h-3.5" />{shown.length} فوجا — <b className="text-red-600">{missing}</b> بلا تسجيل — الحصص المسجلة: <b className="text-gray-800">{doneTotal} / {shown.length * TOTAL}</b></span>
        <button onClick={print} disabled={!shown.length} className="flex items-center gap-1.5 bg-[#1a3a6b] text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40">
          <Printer className="w-3.5 h-3.5" /> طباعة
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto">
        {shown.length === 0 ? <Empty text="لا نتائج" /> : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#1a3a6b]/5 text-[#1a3a6b]">
                <th className="px-3 py-2.5 text-right font-bold">الأستاذ</th>
                <th className="px-3 py-2.5 text-right font-bold">الفوج</th>
                <th className="px-3 py-2.5 text-right font-bold">المقياس</th>
                <th className="px-3 py-2.5 text-center font-bold">الحصص</th>
                <th className="px-3 py-2.5 text-center font-bold">آخر حصة</th>
                <th className="px-3 py-2.5 text-center font-bold">تنبيهات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {shown.map(r => (
                <tr key={r.key} onClick={() => p.onOpen(r.a)} className={`cursor-pointer ${r.count === 0 ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-gray-50/60'}`} title="ورقة الحضور">
                  <td className="px-3 py-2.5 font-bold text-gray-700">{r.prof}</td>
                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{r.level?.name_ar} <span className="text-gray-400">م{pad(r.a.section_number)} ف{pad(r.a.group_number)}</span></td>
                  <td className="px-3 py-2.5 text-gray-800">{r.module}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`font-bold px-2.5 py-1 rounded-full ${r.count === 0 ? 'bg-red-100 text-red-700' : r.count >= TOTAL ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{r.count} / {TOTAL}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center text-gray-500">{r.last ? fmtDay(r.last) : '—'}</td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                    {r.alerts.limit > 0 && <span className="text-[11px] font-bold text-red-700 ml-2">{r.alerts.limit} إقصاء</span>}
                    {r.alerts.warn > 0 && <span className="text-[11px] font-bold text-amber-700">{r.alerts.warn} تحذير</span>}
                    {!r.alerts.limit && !r.alerts.warn && <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ═══ أدوات ═══════════════════════════════════════════════════════════════════

function Empty({ text }: { text: string }) {
  return <div className="flex flex-col items-center justify-center py-14 text-gray-300 bg-white rounded-2xl"><Users className="w-9 h-9 mb-2" /><p className="text-sm">{text}</p></div>;
}
function Spin() {
  return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
}

function printDoc(title: string, department: string | null, body: string, landscape: boolean) {
  const deptLine = department === 'عام' ? 'قسم القانون العام' : department === 'خاص' ? 'قسم القانون الخاص' : '';
  const w = window.open('', '_blank');
  if (!w) { alert('اسمح بالنوافذ المنبثقة لهذا الموقع للطباعة'); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${escHtml(title)}</title>
  <style>
    @page{size:A4 ${landscape ? 'landscape' : 'portrait'};margin:10mm}
    body{font-family:Arial,sans-serif;direction:rtl;color:#000;font-size:11px}
    .header{text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:10px;line-height:1.6;font-weight:bold;font-size:13px}
    h1{text-align:center;font-size:15px;margin:0 0 4px}
    .sub{text-align:center;font-size:11px;margin-bottom:8px}.sub2{text-align:center;font-weight:bold;margin:0 0 8px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #000;padding:3px 5px;text-align:right}
    th{background:#e5e5e5}.c{text-align:center}.sm{font-size:9px}
    .r{background:#fde2e2;font-weight:bold}.w{background:#fef3c7}
    .note{font-size:10px;margin-top:6px}
    .sign{margin-top:28px;display:flex;justify-content:space-between;font-weight:bold}
  </style></head><body>
    <div class="header"><div>جامعة محمد البشير الإبراهيمي — برج بوعريريج</div><div>كلية الحقوق والعلوم السياسية</div>${deptLine ? `<div>${deptLine}</div>` : ''}</div>
    <h1>${escHtml(title)}</h1>
    <div class="sub">السنة الجامعية ${ATT_YEAR.replace('-', '/')} — السداسي الأول — الأعمال الموجهة</div>
    ${body}
    <div class="sign"><div>حُرّر بتاريخ: ${fmtDay(todayISO())}</div><div>رئيس القسم</div></div>
    <script>window.onload=function(){window.print();}<\/script>
  </body></html>`);
  w.document.close();
}
