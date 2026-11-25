import { useEffect, useMemo, useState } from 'react';
import { HeartHandshake, Loader2, AlertCircle, CheckCircle2, Send, Printer, Download, Lock, RotateCcw } from 'lucide-react';
import { TUT_YEAR, TUT_TITLE, tutRpc, fmtDate, printList, tutStatus, type TutRow, type TutCampaign } from '../../lib/tutorat';

export type TutMode = 'field' | 'dept' | 'dean' | 'admin';

const MODE_TITLE: Record<TutMode, string> = {
  field: 'اقتراح قائمة المرافقين — رئيس الميدان',
  dept: 'رأي رئيس قسم القانون العام',
  dean: 'المصادقة على قائمة المرافقين — العميد',
  admin: 'فترة الترشح والملفات',
};

// دراسة ملفات الترشح للمرافقة البيداغوجية حسب الدور
export default function TutoratReview({ mode }: { mode: TutMode }) {
  const [camp, setCamp] = useState<TutCampaign | null>(null);
  const [rows, setRows] = useState<TutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [cf, setCf] = useState({ open: false, deadline: '' });
  const [confirm, setConfirm] = useState<string | null>(null);

  async function load() {
    setErr('');
    try {
      const [c, l] = await Promise.all([
        tutRpc<TutCampaign>('tut_campaign', { p_year: TUT_YEAR }),
        tutRpc<TutRow[]>('tut_list', { p_year: TUT_YEAR }),
      ]);
      setCamp(c); setRows(l || []);
      setCf({ open: !!c?.is_open, deadline: c?.deadline || '' });
      setNotes(Object.fromEntries((l || []).map(r => [r.id, r.dept_note || ''])));
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function run(key: string, fn: string, args: Record<string, any>, ok?: string) {
    setBusy(key); setErr(''); setMsg('');
    try { await tutRpc(fn, args); if (ok) setMsg(ok); setConfirm(null); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(null);
  }

  const openNow = camp?.open_now === true;
  const fieldSent = !!camp?.field_sent_at;
  const deptSent = !!camp?.dept_sent_at;

  const visible = useMemo(() => {
    if (mode === 'dept' || mode === 'dean') return rows.filter(r => r.field_decision === 'مقترح');
    return rows;
  }, [rows, mode]);
  const approved = rows.filter(r => r.dean_decision === 'مصادق');

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  // ── حالة المرحلة لكل دور ──
  const fieldCan = mode === 'field' && !openNow && !fieldSent;
  const deptCan = mode === 'dept' && fieldSent && !deptSent;
  const deanCan = mode === 'dean' && deptSent;
  const waiting =
    mode === 'field' && openNow ? 'الترشح مفتوح: يمكنك الاطلاع على الملفات فور وصولها، والقرار بعد انتهاء فترة الترشح.'
    : mode === 'field' && fieldSent ? 'أُرسلت القائمة إلى رئيس قسم القانون العام.'
    : mode === 'dept' && !fieldSent ? 'لم تصل قائمة رئيس الميدان بعد.'
    : mode === 'dept' && deptSent ? 'أُرسلت القائمة إلى العميد.'
    : mode === 'dean' && !deptSent ? 'لم تصل القائمة من رئيس القسم بعد.'
    : '';

  const fieldUndecided = rows.filter(r => !r.field_decision).length;
  const deptMissing = visible.filter(r => !r.dept_opinion).length;

  function exportCsv() {
    const head = ['الاسم واللقب', 'الرتبة', 'الهاتف', 'البريد', 'رئيس الميدان', 'رأي القسم', 'ملاحظة القسم', 'العميد', 'تاريخ الترشح'];
    const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map(r => [r.name, r.rank, r.phone, r.email, r.field_decision, r.dept_opinion, r.dept_note,
      r.dean_decision, fmtDate(r.created_at)].map(q).join(','));
    const blob = new Blob(['﻿' + [head.map(q).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `المرافقة_البيداغوجية_${TUT_YEAR}.csv`; a.click();
  }

  const printApproved = () => printList(`قائمة الأساتذة المرافقين المصادق عليها — ${TUT_TITLE} ${TUT_YEAR}`, approved,
    [{ key: 'name', label: 'الاسم واللقب' }, { key: 'rank', label: 'الرتبة' }]);

  const btn = 'flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold disabled:opacity-50';

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#1a3a6b] flex items-center justify-center flex-shrink-0">
          <HeartHandshake className="w-5 h-5 text-[#c9a227]" />
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-gray-900">{TUT_TITLE} — {MODE_TITLE[mode]}</h2>
          <p className="text-xs text-gray-500 mt-1">
            الترشح: <b className={openNow ? 'text-green-700' : 'text-gray-700'}>{openNow ? 'مفتوح' : 'مغلق'}</b>
            {camp?.deadline && <> — آخر أجل: <b>{fmtDate(camp.deadline)}</b></>}
            {' '}— الملفات: <b>{rows.length}</b> — المصادق عليهم: <b>{approved.length}</b>
          </p>
        </div>
      </div>

      {/* ── تحكم الإدارة في فترة الترشح ── */}
      {mode === 'admin' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <p className="font-bold text-sm text-gray-800">فترة الترشح</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cf.open} onChange={e => setCf({ ...cf, open: e.target.checked })} /> الترشح مفتوح
            </label>
            <div>
              <p className="text-[11px] text-gray-500 mb-1">آخر أجل (اختياري)</p>
              <input type="date" value={cf.deadline} onChange={e => setCf({ ...cf, deadline: e.target.value })}
                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
            </div>
            <button disabled={busy === 'camp'} className={`${btn} bg-[#1a3a6b] text-white`}
              onClick={() => run('camp', 'tut_admin_set_campaign',
                { p_year: TUT_YEAR, p_open: cf.open, p_deadline: cf.deadline || null, p_semester: 1 }, 'تم حفظ فترة الترشح')}>
              حفظ
            </button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1 text-xs text-gray-500 items-center">
            <span>إرسال رئيس الميدان: <b>{fieldSent ? fmtDate(camp!.field_sent_at) : '—'}</b></span>
            <span>— إرسال رئيس القسم: <b>{deptSent ? fmtDate(camp!.dept_sent_at) : '—'}</b></span>
            {fieldSent && (confirm === 'unsend' ? (
              <button className={`${btn} bg-red-600 text-white`} onClick={() => run('unsend', 'tut_admin_unsend', { p_year: TUT_YEAR, p_stage: deptSent ? 'dept' : 'field' }, 'أُعيدت المرحلة')}>
                تأكيد الإرجاع
              </button>
            ) : (
              <button className={`${btn} border border-gray-300 text-gray-600`} onClick={() => setConfirm('unsend')}>
                <RotateCcw className="w-3.5 h-3.5" /> إرجاع آخر مرحلة
              </button>
            ))}
          </div>
        </div>
      )}

      {waiting && <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm"><Lock className="w-4 h-4" />{waiting}</div>}
      {msg && <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm"><CheckCircle2 className="w-4 h-4" />{msg}</div>}
      {err && <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm"><AlertCircle className="w-4 h-4" />{err}</div>}

      {/* ── أزرار المرحلة ── */}
      <div className="flex flex-wrap gap-2">
        {fieldCan && (confirm === 'fsend' ? (
          <button disabled={!!busy} className={`${btn} bg-green-600 text-white`}
            onClick={() => run('fsend', 'tut_field_send', { p_year: TUT_YEAR }, 'أُرسلت القائمة إلى رئيس القسم')}>تأكيد الإرسال</button>
        ) : (
          <button disabled={fieldUndecided > 0} className={`${btn} bg-[#1a3a6b] text-white`} onClick={() => setConfirm('fsend')}>
            <Send className="w-3.5 h-3.5" /> إرسال القائمة لرئيس القسم {fieldUndecided > 0 && `(بقي ${fieldUndecided} بلا قرار)`}
          </button>
        ))}
        {deptCan && (confirm === 'dsend' ? (
          <button disabled={!!busy} className={`${btn} bg-green-600 text-white`}
            onClick={() => run('dsend', 'tut_dept_send', { p_year: TUT_YEAR }, 'أُرسلت القائمة إلى العميد')}>تأكيد الإرسال</button>
        ) : (
          <button disabled={deptMissing > 0} className={`${btn} bg-[#1a3a6b] text-white`} onClick={() => setConfirm('dsend')}>
            <Send className="w-3.5 h-3.5" /> إرسال للعميد {deptMissing > 0 && `(بقي ${deptMissing} بلا رأي)`}
          </button>
        ))}
        {deanCan && visible.length > 0 && (confirm === 'all' ? (
          <button disabled={!!busy} className={`${btn} bg-green-600 text-white`}
            onClick={() => run('all', 'tut_dean_decide', { p_year: TUT_YEAR, p_id: null, p_decision: 'مصادق' }, 'تمت المصادقة على الكل')}>
            تأكيد المصادقة على الكل ({visible.length})
          </button>
        ) : (
          <button className={`${btn} bg-green-700 text-white`} onClick={() => setConfirm('all')}>
            <CheckCircle2 className="w-3.5 h-3.5" /> المصادقة على الكل
          </button>
        ))}
        {(mode === 'admin' || mode === 'dean') && approved.length > 0 && (
          <>
            <button className={`${btn} border border-gray-300 text-gray-700`} onClick={printApproved}>
              <Printer className="w-3.5 h-3.5" /> القائمة المصادق عليها
            </button>
          </>
        )}
        {mode === 'admin' && rows.length > 0 && (
          <button className={`${btn} border border-gray-300 text-gray-700`} onClick={exportCsv}>
            <Download className="w-3.5 h-3.5" /> تصدير Excel
          </button>
        )}
      </div>

      {/* ── الملفات ── */}
      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center text-sm text-gray-400">لا توجد ملفات</div>
      ) : (
        <div className="space-y-2">
          {visible.map(r => {
            const st = tutStatus(r);
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <p className="font-bold text-sm text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-500">{r.rank || '—'}{r.phone && <> — <span dir="ltr">{r.phone}</span></>}{r.email && <> — <span dir="ltr">{r.email}</span></>}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</span>
                </div>

                {(mode === 'dean' || mode === 'admin') && r.dept_opinion && (
                  <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                    رأي رئيس القسم: <b>{r.dept_opinion}</b>{r.dept_note && <> — {r.dept_note}</>}
                  </p>
                )}


                {fieldCan && (
                  <div className="flex gap-2">
                    {(['مقترح', 'غير مقترح'] as const).map(d => (
                      <button key={d} disabled={!!busy}
                        onClick={() => run(r.id, 'tut_field_decide', { p_id: r.id, p_decision: d })}
                        className={`flex-1 rounded-xl py-2 text-xs font-bold border ${r.field_decision === d
                          ? (d === 'مقترح' ? 'bg-green-600 text-white border-green-600' : 'bg-gray-600 text-white border-gray-600')
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{d}</button>
                    ))}
                  </div>
                )}

                {deptCan && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      {(['موافق', 'متحفظ'] as const).map(d => (
                        <button key={d} disabled={!!busy}
                          onClick={() => run(r.id, 'tut_dept_opinion', { p_id: r.id, p_opinion: d, p_note: notes[r.id] || '' })}
                          className={`flex-1 rounded-xl py-2 text-xs font-bold border ${r.dept_opinion === d
                            ? (d === 'موافق' ? 'bg-green-600 text-white border-green-600' : 'bg-amber-500 text-white border-amber-500')
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{d}</button>
                      ))}
                    </div>
                    <input value={notes[r.id] || ''} onChange={e => setNotes({ ...notes, [r.id]: e.target.value })}
                      placeholder="ملاحظة (اختيارية) — تُحفظ عند الضغط على موافق أو متحفظ"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs" />
                  </div>
                )}

                {deanCan && (
                  <div className="flex gap-2">
                    {(['مصادق', 'مرفوض'] as const).map(d => (
                      <button key={d} disabled={!!busy}
                        onClick={() => run(r.id, 'tut_dean_decide', { p_year: TUT_YEAR, p_id: r.id, p_decision: d })}
                        className={`flex-1 rounded-xl py-2 text-xs font-bold border ${r.dean_decision === d
                          ? (d === 'مصادق' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600')
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{d === 'مصادق' ? 'مصادقة' : 'رفض'}</button>
                    ))}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
