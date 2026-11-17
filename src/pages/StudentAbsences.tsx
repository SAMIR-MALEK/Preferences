import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  ATT_YEAR, ABSENCE_LIMIT, ABSENCE_WARNING_TEXT, ST_ABSENT, J_PENDING, J_ACCEPTED, J_REJECTED,
  JUSTIFICATION_KINDS, AttRecord, Justification,
  fmtDay, todayISO, dayOnly, recordCounts, justificationFor,
  absenceLevel, LEVEL_STYLE, J_STYLE, fetchAll, fetchByIds,
} from '../lib/attendance';
import { AlertTriangle, Upload, Send, FileText, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  student: { id: string; groupe: number | null };
}

const MAX_FILE_MB = 5;

export default function StudentAbsences({ student }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [me, setMe] = useState<any>(null);
  const [records, setRecords] = useState<AttRecord[]>([]);
  const [modules, setModules] = useState<Map<string, string>>(new Map());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [justs, setJusts] = useState<Justification[]>([]);

  // نموذج التبرير
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [student.id]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      // فوج الطالب الحالي وتاريخ إدراجه (قد يكون تغيّر منذ تسجيل الدخول)
      let meRow: any = null;
      const r1 = await supabase.from('students').select('id, groupe, groupe_since').eq('id', student.id).maybeSingle();
      if (!r1.error) meRow = r1.data;
      setMe(meRow || { id: student.id, groupe: student.groupe, groupe_since: null });

      const recs = await fetchAll<AttRecord>(() => supabase.from('attendance_records')
        .select('id, session_id, student_id, status, module_id, group_number, session_date, is_makeup')
        .eq('student_id', student.id).eq('status', ST_ABSENT).order('session_date', { ascending: true }).order('id'));
      setRecords(recs);

      const modIds = [...new Set(recs.map(r => r.module_id))];
      const mods = modIds.length > 0 ? await fetchByIds<any>('modules', 'id, name_ar', 'id', modIds) : [];
      setModules(new Map(mods.map(m => [m.id, m.name_ar])));

      const exc = await fetchAll<any>(() => supabase.from('attendance_exclusions')
        .select('id, module_id').eq('student_id', student.id).eq('academic_year', ATT_YEAR).order('id'));
      setExcluded(new Set(exc.map(e => e.module_id)));

      const js = await fetchAll<Justification>(() => supabase.from('absence_justifications')
        .select('*').eq('student_id', student.id).order('created_at', { ascending: false }).order('id'));
      setJusts(js);
    } catch (e: any) {
      setError('تعذّر تحميل الغيابات. حاول لاحقاً.');
    }
    setLoading(false);
  }

  const byModule = useMemo(() => {
    const m = new Map<string, { moduleId: string; name: string; count: number; absences: any[] }>();
    for (const r of records) {
      const counts = recordCounts(r, me);
      if (!counts) continue;   // غياب قبل تاريخ الإدراج في الفوج: لا يُحتسب ولا يُعرض
      if (!m.has(r.module_id)) m.set(r.module_id, { moduleId: r.module_id, name: modules.get(r.module_id) || '—', count: 0, absences: [] });
      const row = m.get(r.module_id)!;
      row.count++;
      row.absences.push({ ...r, j: justificationFor(r.session_date, justs) });
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
  }, [records, modules, me, justs]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!kind) { setMsg({ type: 'err', text: 'اختر نوع المبرر' }); return; }
    if (!dateFrom || !dateTo) { setMsg({ type: 'err', text: 'حدد مدة الغياب (من — إلى)' }); return; }
    if (dateTo < dateFrom) { setMsg({ type: 'err', text: 'تاريخ النهاية يجب أن يكون بعد تاريخ البداية أو مساوياً له' }); return; }
    if (!file) { setMsg({ type: 'err', text: 'أرفق الوثيقة المبرِّرة' }); return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) { setMsg({ type: 'err', text: `حجم الوثيقة يجب ألا يتجاوز ${MAX_FILE_MB} ميغابايت` }); return; }

    // لا يُقبل تبرير ثانٍ لمدة سبق تبريرها (والرفض نهائي)
    const overlap = justs.find(j => dayOnly(j.date_from) <= dateTo && dateFrom <= dayOnly(j.date_to));
    if (overlap) {
      setMsg({
        type: 'err',
        text: overlap.status === J_REJECTED
          ? `سبق أن رُفض تبرير يغطي هذه المدة (من ${fmtDay(overlap.date_from)} إلى ${fmtDay(overlap.date_to)})، ولا يمكن إيداع تبرير جديد لها.`
          : `لديك تبرير سابق يغطي هذه المدة (من ${fmtDay(overlap.date_from)} إلى ${fmtDay(overlap.date_to)}).`,
      });
      return;
    }

    setSubmitting(true);
    try {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
      const rand = Math.random().toString(36).slice(2, 10);
      const path = `justifications/${student.id}/${Date.now()}_${rand}.${ext}`;
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file);
      if (upErr) throw new Error('تعذّر رفع الوثيقة: ' + upErr.message);
      const { data: urlData } = supabase.storage.from('attachments').getPublicUrl(path);

      const { error: insErr } = await supabase.from('absence_justifications').insert({
        student_id: student.id,
        date_from: dateFrom,
        date_to: dateTo,
        kind,
        reason: reason.trim() || null,
        file_url: urlData.publicUrl,
      });
      if (insErr) throw new Error(insErr.message);

      setMsg({ type: 'ok', text: 'تم إيداع التبرير. سيظهر هنا قرار رئيس القسم.' });
      setKind(''); setDateFrom(''); setDateTo(''); setReason(''); setFile(null);
      setOpen(false);
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.message || 'حدث خطأ أثناء الإيداع' });
    }
    setSubmitting(false);
  }

  if (loading) return <p className="text-center text-gray-400 text-sm py-12">جارٍ تحميل الغيابات...</p>;
  if (error) return <p className="text-center text-red-500 text-sm py-12">{error}</p>;

  return (
    <div className="space-y-4">
      {/* تنبيه ثابت */}
      <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-2.5">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm font-bold text-red-700 leading-relaxed">{ABSENCE_WARNING_TEXT}</p>
      </div>

      {/* الغيابات حسب المقياس */}
      {byModule.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <CheckCircle className="w-9 h-9 mx-auto mb-3 text-green-400" />
          <p className="text-sm">لا توجد غيابات مسجّلة عليك في الأعمال الموجهة</p>
        </div>
      ) : byModule.map(m => {
        const lvl = absenceLevel(m.count, excluded.has(m.moduleId));
        const st = LEVEL_STYLE[lvl];
        const pct = Math.min(100, (m.count / ABSENCE_LIMIT) * 100);
        return (
          <div key={m.moduleId} className="border border-gray-100 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-bold text-gray-800 text-sm leading-snug">{m.name}</p>
              <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap"
                style={{ background: st.bg, color: st.color, borderColor: st.border }}>
                {lvl === 'excluded' ? 'مقصى' : `${m.count} / ${ABSENCE_LIMIT}`}
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: lvl === 'ok' ? '#64748b' : lvl === 'warn' ? '#f59e0b' : '#dc2626' }} />
            </div>
            {lvl === 'limit' && <p className="text-xs font-bold text-red-600 mt-2">بلغت حد الإقصاء في هذه المادة.</p>}
            {lvl === 'excluded' && <p className="text-xs font-bold text-red-700 mt-2">تم إقصاؤك من هذه المادة.</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              {m.absences.map((a: any) => {
                const js = a.j ? J_STYLE[a.j.status] : null;
                return (
                  <span key={a.id} className="text-[11px] px-2.5 py-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-700">
                    {fmtDay(a.session_date)}{a.is_makeup ? ' (تعويضية)' : ''}
                    {a.j && js && (
                      <span className="mr-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold border" style={{ background: js.bg, color: js.color, borderColor: js.border }}>
                        {a.j.status === J_ACCEPTED ? 'مبرَّر' : a.j.status === J_PENDING ? 'قيد الدراسة' : 'تبرير مرفوض'}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm border ${msg.type === 'ok' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      {/* إيداع تبرير */}
      <div className="border border-gray-100 rounded-2xl overflow-hidden">
        <button onClick={() => setOpen(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5 text-sm font-bold text-[#1a3a6b] hover:bg-gray-50">
          <span className="flex items-center gap-2"><FileText className="w-4 h-4" /> إيداع تبرير غياب</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {open && (
          <form onSubmit={submit} className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-500 leading-relaxed">
              حدد مدة الغياب وأرفق وثيقة واحدة تغطيها. يُطبَّق التبرير على كل غياباتك في هذه المدة بعد تأشير رئيس القسم.
            </p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">نوع المبرر</label>
              <select value={kind} onChange={e => setKind(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30">
                <option value="">— اختر —</option>
                {JUSTIFICATION_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">من يوم</label>
                <input type="date" value={dateFrom} max={todayISO()} onChange={e => { setDateFrom(e.target.value); if (!dateTo) setDateTo(e.target.value); }}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">إلى يوم</label>
                <input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">توضيح (اختياري)</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الوثيقة المبرِّرة (PDF أو صورة — {MAX_FILE_MB} ميغابايت كحد أقصى)</label>
              <label className="flex items-center gap-2 border border-dashed border-gray-300 rounded-xl px-3 py-3 text-sm text-gray-600 cursor-pointer hover:bg-gray-50">
                <Upload className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{file ? file.name : 'اضغط لاختيار الملف'}</span>
                <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)} />
              </label>
            </div>
            <button type="submit" disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-[#1a3a6b] hover:bg-[#0a1628] text-white py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
              <Send className="w-4 h-4" /> {submitting ? 'جارٍ الإيداع...' : 'إيداع التبرير'}
            </button>
          </form>
        )}
      </div>

      {/* تبريراتي */}
      {justs.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">تبريراتي</p>
          <div className="space-y-2">
            {justs.map(j => {
              const js = J_STYLE[j.status] || J_STYLE[J_PENDING];
              return (
                <div key={j.id} className="border border-gray-100 rounded-xl px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{j.kind}</p>
                      <p className="text-xs text-gray-500 mt-0.5">من {fmtDay(j.date_from)} إلى {fmtDay(j.date_to)}</p>
                    </div>
                    <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border" style={{ background: js.bg, color: js.color, borderColor: js.border }}>
                      {j.status}
                    </span>
                  </div>
                  {j.decision_note && <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg px-3 py-2">ملاحظة رئيس القسم: {j.decision_note}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
