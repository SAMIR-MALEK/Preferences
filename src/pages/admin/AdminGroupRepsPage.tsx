import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Megaphone, Printer, Loader2, Search, X, UserPlus, AlertCircle } from 'lucide-react';

// ممثلو الأفواج: لوحة المتابعة + السجل. للإدارة ورئيسي القسمين (كلٌّ لقسمه). لا يراها الأستاذ.

const pad = (n: any) => (n == null ? '' : String(n).padStart(2, '0'));
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDay = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

async function rpc<T = any>(fn: string, args: Record<string, any> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export default function AdminGroupRepsPage() {
  const [view, setView] = useState<'dash' | 'registry'>('dash');
  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#1a3a6b]"><Megaphone className="w-5 h-5 text-[#c9a227]" /></div>
        <h1 className="text-lg font-bold text-gray-900 flex-1">ممثلو الأفواج</h1>
        <div className="flex bg-gray-100 rounded-xl p-1 text-sm">
          {([['dash', 'المتابعة'], ['registry', 'السجل']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)}
              className={`px-4 py-1.5 rounded-lg font-semibold ${view === k ? 'bg-white shadow text-[#1a3a6b]' : 'text-gray-500'}`}>{l}</button>
          ))}
        </div>
      </div>
      {view === 'dash' ? <Dashboard /> : <Registry />}
    </div>
  );
}

// ═══ اللوحة ══════════════════════════════════════════════════════════════════

function Dashboard() {
  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)));
  const [to, setTo] = useState(iso(now));
  const [filter, setFilter] = useState<'no' | 'notes'>('no');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  async function load() {
    setLoading(true); setErr('');
    try { setData(await rpc('gr_dashboard', { p_from: from, p_to: to })); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);
  // أسماء المستويات بدل الرموز
  const [lvlNames, setLvlNames] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase.from('levels').select('code, name_ar').then(({ data }) =>
      setLvlNames(Object.fromEntries((data || []).map((l: any) => [l.code, l.name_ar]))));
  }, []);

  const t = data?.today || {};
  const answered = (t.done || 0) + (t.not_done || 0);
  const rate = answered ? Math.round((t.done * 100) / answered) : null;
  const list: any[] = (data?.list || []).filter((r: any) => filter === 'notes' || r.status === 'لم تتم');

  return (
    <div className="space-y-4">
      {/* أرقام اليوم */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <p className="text-xs font-bold text-gray-500 mb-3">اليوم {t.date ? fmtDay(t.date) : ''}</p>
        <div className="grid grid-cols-5 gap-2 text-center">
          <Num v={t.scheduled} l="مبرمجة" c="text-gray-900" />
          <Num v={t.done} l="تمّت" c="text-green-700" />
          <Num v={t.not_done} l="لم تتم" c="text-red-600" />
          <Num v={t.unanswered} l="بلا جواب" c="text-gray-400" />
          <Num v={rate == null ? '—' : `${rate}%`} l="الإنجاز" c="text-[#1a3a6b]" />
        </div>
        <p className="text-[11px] text-gray-400 mt-3">تُحتسب حصص الأفواج التي لها ممثل أو نائب فقط. الإنجاز من الحصص المؤكدة.</p>
      </div>

      {/* الفترة */}
      <div className="flex items-end gap-2 flex-wrap">
        <label className="text-xs text-gray-500">من<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
          className="block mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-gray-500">إلى<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)}
          className="block mt-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" /></label>
        <div className="flex bg-gray-100 rounded-lg p-1 text-xs mr-auto">
          <button onClick={() => setFilter('no')} className={`px-3 py-1.5 rounded-md font-semibold ${filter === 'no' ? 'bg-white shadow text-red-600' : 'text-gray-500'}`}>لم تتم</button>
          <button onClick={() => setFilter('notes')} className={`px-3 py-1.5 rounded-md font-semibold ${filter === 'notes' ? 'bg-white shadow text-[#1a3a6b]' : 'text-gray-500'}`}>مع الملاحظات</button>
        </div>
      </div>

      {err && <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4" />{err}</p>}
      {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div> : (
        <>
          {/* الحصص */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <p className="px-4 py-3 text-sm font-bold text-gray-800 border-b border-gray-100">
              {filter === 'no' ? 'الحصص التي لم تتم' : 'الحصص التي لم تتم أو فيها ملاحظة'} ({list.length})
            </p>
            {list.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">لا شيء في هذه الفترة</p> : (
              <div className="divide-y divide-gray-100">
                {list.map((r, i) => (
                  <div key={i} className="px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="font-semibold text-gray-800 min-w-0">{r.module}
                        <span className="text-xs font-normal text-gray-500"> — {r.kind === 'محاضرة' ? 'محاضرة' : 'أ.م'} · {lvlNames[r.level] || r.level} {r.kind === 'محاضرة' ? `م${pad(r.section)}` : `م${pad(r.section)} ف${pad(r.groupe)}`}</span>
                      </p>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.status === 'لم تتم' ? 'bg-red-100 text-red-700' : r.status === 'تمت' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.status || 'بلا جواب'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {fmtDay(r.date)} · {r.start} · {r.professor || '—'}{r.room ? ` · ${r.room}` : ''}
                      {(r.yes + r.no > 1) && <span className="text-gray-400"> · تأكيدات: {r.yes} تمت / {r.no} لم تتم</span>}
                    </p>
                    {(r.notes || []).map((n: string, j: number) => (
                      <p key={j} className="text-xs text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-1.5">{n}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* لكل أستاذ */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <p className="px-4 py-3 text-sm font-bold text-gray-800 border-b border-gray-100">عدد الحصص التي لم تتم لكل أستاذ</p>
            {(data?.profs || []).length === 0 ? <p className="text-sm text-gray-400 text-center py-6">لا شيء في هذه الفترة</p> : (
              <div className="divide-y divide-gray-100">
                {data.profs.map((p: any, i: number) => (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-gray-800">{p.professor || '—'}</span>
                    <span className="font-bold text-red-600 tabular-nums">{p.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Num({ v, l, c }: { v: any; l: string; c: string }) {
  return (
    <div className="bg-gray-50 rounded-xl py-2.5">
      <p className={`text-lg font-bold tabular-nums ${c}`}>{v ?? 0}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{l}</p>
    </div>
  );
}

// ═══ السجل ═══════════════════════════════════════════════════════════════════

interface Person { id: string; name: string; phone: string | null }
interface Group {
  level_id: string; level_code: string; level_name: string; section: number; groupe: number; students: number;
  rep: Person | null; deputy: Person | null;
}

function Registry() {
  const [rows, setRows] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [level, setLevel] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [picker, setPicker] = useState<{ g: Group; role: 'ممثل' | 'نائب' } | null>(null);

  async function load() {
    setLoading(true); setErr('');
    try { setRows(await rpc<Group[]>('gr_registry')); } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const levels = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach(r => m.set(r.level_id, r.level_name || r.level_code));
    return [...m.entries()];
  }, [rows]);
  useEffect(() => { if (!level && levels.length) setLevel(levels[0][0]); }, [levels, level]);

  const shown = rows.filter(r => (!level || r.level_id === level) && (!onlyMissing || !r.rep || !r.deputy));
  const all = rows.filter(r => !level || r.level_id === level);
  const done = all.filter(r => r.rep).length;

  async function assign(g: Group, role: 'ممثل' | 'نائب', id: string | null, phone?: string) {
    setErr('');
    try { await rpc('gr_assign', { p_level: g.level_id, p_section: g.section, p_groupe: g.groupe, p_role: role, p_student: id, p_phone: phone || null }); setPicker(null); await load(); }
    catch (e: any) { setErr(e.message); }
  }
  // للنافذة: تُرجع الخطأ بدل عرضه خلفها
  async function assignFromPicker(g: Group, role: 'ممثل' | 'نائب', id: string, phone?: string) {
    await rpc('gr_assign', { p_level: g.level_id, p_section: g.section, p_groupe: g.groupe, p_role: role, p_student: id, p_phone: phone || null });
    setPicker(null); await load();
  }
  async function savePhone(id: string, phone: string) {
    setErr('');
    try { await rpc('gr_admin_phone', { p_student: id, p_phone: phone }); await load(); return true; }
    catch (e: any) { setErr(e.message); return false; }
  }

  function print() {
    const w = window.open('', '_blank');
    if (!w) { alert('اسمح بالنوافذ المنبثقة للطباعة'); return; }
    const lvl = levels.find(l => l[0] === level)?.[1] || '';
    const body = all.map((r, i) => `<tr><td>${i + 1}</td><td>${pad(r.section)}</td><td>${pad(r.groupe)}</td>
      <td>${esc(r.rep?.name)}</td><td>${esc(r.rep?.phone)}</td><td>${esc(r.deputy?.name)}</td><td>${esc(r.deputy?.phone)}</td></tr>`).join('');
    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>ممثلو الأفواج</title>
    <style>@page{size:A4;margin:14mm}body{font-family:'Traditional Arabic','Amiri','Times New Roman',serif;font-size:13pt}
    .hd{text-align:center;line-height:1.6;font-weight:bold}h2{text-align:center;margin:14px 0;font-size:16pt}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:5px 6px;text-align:center}th{background:#eee}</style></head><body>
    <div class="hd">جامعة محمد البشير الإبراهيمي — برج بوعريريج<br>كلية الحقوق والعلوم السياسية</div>
    <h2>قائمة ممثلي الأفواج — ${esc(lvl)} — 2026/2027</h2>
    <table><thead><tr><th>الرقم</th><th>المجموعة</th><th>الفوج</th><th>الممثل</th><th>الهاتف</th><th>النائب</th><th>الهاتف</th></tr></thead><tbody>${body}</tbody></table>
    <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
    w.document.close();
  }

  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={level} onChange={e => setLevel(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
          {levels.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> غير المكتملة فقط
        </label>
        <span className="text-xs text-gray-500 mr-auto">{done} / {all.length} فوجا له ممثل</span>
        <button onClick={print} className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white"><Printer className="w-4 h-4" /> طباعة</button>
      </div>

      {err && <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3"><AlertCircle className="w-4 h-4" />{err}</p>}

      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {shown.length === 0 && <p className="text-sm text-gray-400 text-center py-8">لا توجد أفواج</p>}
        {shown.map(g => (
          <div key={g.level_id + g.section + '-' + g.groupe} className="px-4 py-3 flex items-start gap-3 flex-wrap">
            <div className="w-20 shrink-0">
              <p className="text-sm font-bold text-[#1a3a6b]">م{pad(g.section)} ف{pad(g.groupe)}</p>
              <p className="text-[11px] text-gray-400">{g.students} طالبا</p>
            </div>
            <div className="flex-1 grid sm:grid-cols-2 gap-2 min-w-[220px]">
              {(['ممثل', 'نائب'] as const).map(role => {
                const p = role === 'ممثل' ? g.rep : g.deputy;
                const lead = role === 'ممثل';
                return (
                  <div key={role} className={`rounded-lg px-2.5 py-2 min-w-0 border ${
                    !p ? 'bg-white border-dashed border-gray-300'
                    : lead ? 'bg-amber-50 border-amber-300' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] w-10 shrink-0 font-bold ${lead ? 'text-amber-700' : 'text-slate-500'}`}>{lead ? 'الممثل' : 'النائب'}</span>
                      {p ? (
                        <>
                          <button onClick={() => setPicker({ g, role })} className={`flex-1 text-right truncate ${lead ? 'text-[15px] font-bold text-gray-900' : 'text-sm text-gray-700'}`}>{p.name}</button>
                          <button onClick={() => assign(g, role, null)} title="إزالة" className="text-gray-300 hover:text-red-500"><X className="w-4 h-4" /></button>
                        </>
                      ) : (
                        <button onClick={() => setPicker({ g, role })} className="flex-1 flex items-center gap-1 text-sm text-[#1a3a6b] font-semibold">
                          <UserPlus className="w-4 h-4" /> تعيين
                        </button>
                      )}
                    </div>
                    {p && (p.phone
                      ? <p className="text-sm font-semibold text-gray-800 mt-1 mr-12 tabular-nums" dir="ltr" style={{ textAlign: 'right' }}>{p.phone}</p>
                      : <PhoneFix onSave={v => savePhone(p.id, v)} />)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {picker && <Picker g={picker.g} role={picker.role} onClose={() => setPicker(null)} onPick={(id, ph) => assignFromPicker(picker.g, picker.role, id, ph)} />}
    </div>
  );
}

// خانة إدخال الهاتف عند غيابه (إلزامي للممثل والنائب)
function PhoneFix({ onSave }: { onSave: (v: string) => Promise<boolean> }) {
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <span className="text-[11px] font-bold text-white bg-red-500 rounded-full px-2 py-0.5 shrink-0">بلا هاتف</span>
      <input value={v} onChange={e => setV(e.target.value)} inputMode="tel" dir="ltr" placeholder="06XXXXXXXX"
        className="flex-1 min-w-0 border border-red-300 rounded-md px-2 py-1 text-sm" />
      <button disabled={busy || !v.trim()} onClick={async () => { setBusy(true); if (await onSave(v)) setV(''); setBusy(false); }}
        className="text-xs font-bold bg-[#1a3a6b] text-white rounded-md px-2.5 py-1.5 disabled:opacity-40">حفظ</button>
    </div>
  );
}

function Picker({ g, role, onClose, onPick }: { g: Group; role: 'ممثل' | 'نائب'; onClose: () => void; onPick: (id: string, phone?: string) => Promise<void> }) {
  const [sel, setSel] = useState<any>(null);     // طالب بلا هاتف: يُطلب رقمه قبل التعيين
  const [ph, setPh] = useState('');
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    rpc<any[]>('gr_group_students', { p_level: g.level_id, p_section: g.section, p_groupe: g.groupe })
      .then(setList, e => setErr(e.message)).finally(() => setLoading(false));
  }, [g]);
  const other = role === 'ممثل' ? g.deputy?.id : g.rep?.id;
  const shown = list.filter(s => !q || (s.name + ' ' + (s.mat || '')).includes(q.trim()));
  async function go(s: any, phone?: string) {
    setErr('');
    if (!s.phone && !phone) { setSel(s); setPh(''); return; }
    setBusy(true);
    try { await onPick(s.id, phone); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <p className="font-bold text-sm">{role === 'ممثل' ? 'الممثل' : 'النائب'} — {g.level_name} م{pad(g.section)} ف{pad(g.groupe)}</p>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-3 border-b border-gray-100 relative">
          <Search className="w-4 h-4 text-gray-400 absolute right-6 top-1/2 -translate-y-1/2" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ابحث بالاسم أو رقم التسجيل"
            className="w-full border border-gray-200 rounded-lg pr-9 pl-3 py-2 text-sm" />
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>}
          {err && <p className="text-sm text-red-600 p-4">{err}</p>}
          {shown.map(s => (
            <div key={s.id}>
              <button disabled={s.id === other || busy} onClick={() => go(s)}
                className={`w-full text-right px-4 py-2.5 hover:bg-gray-50 disabled:opacity-40 flex items-center justify-between gap-2 ${sel?.id === s.id ? 'bg-amber-50' : ''}`}>
                <span className="text-sm text-gray-800">{s.name}{s.id === other && <span className="text-xs text-gray-400"> (معيّن {role === 'ممثل' ? 'نائبا' : 'ممثلا'})</span>}</span>
                <span className={`text-[11px] ${s.phone ? 'text-gray-500' : 'text-red-500 font-semibold'}`} dir="ltr">{s.phone || 'بلا هاتف'}</span>
              </button>
              {sel?.id === s.id && (
                <div className="px-4 pb-3 bg-amber-50 space-y-1.5">
                  <p className="text-xs text-amber-800">الهاتف إلزامي للممثل والنائب. أدخل رقمه للتعيين:</p>
                  <div className="flex gap-2">
                    <input autoFocus value={ph} onChange={e => setPh(e.target.value)} inputMode="tel" dir="ltr" placeholder="06XXXXXXXX"
                      className="flex-1 min-w-0 border border-amber-300 rounded-lg px-3 py-2 text-sm" />
                    <button disabled={busy || !ph.trim()} onClick={() => go(s, ph)}
                      className="bg-[#1a3a6b] text-white rounded-lg px-4 text-sm font-bold disabled:opacity-40">تعيين</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 px-4 py-2 border-t border-gray-100">إن كان الطالب معيّنا في فوج آخر يُنقل إلى هذا الفوج.</p>
      </div>
    </div>
  );
}
