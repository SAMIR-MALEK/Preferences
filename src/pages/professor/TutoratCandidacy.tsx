import { useEffect, useState } from 'react';
import { HeartHandshake, CheckCircle2, AlertCircle, Lock, Loader2, Trash2 } from 'lucide-react';
import { TUT_YEAR, TUT_TITLE, tutRpc, fmtDate } from '../../lib/tutorat';

const NAVY = '#1a3a6b';

// ترشح الأستاذ الدائم للمرافقة البيداغوجية: زر واحد، بلا شروط ولا خانات
export default function TutoratCandidacy({ prof: _prof }: { prof: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  async function load() {
    setLoading(true); setErr('');
    try { setData(await tutRpc('tut_my', { p_year: TUT_YEAR })); }
    catch (e: any) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function apply() {
    setBusy(true); setErr(''); setMsg('');
    try { await tutRpc('tut_apply', { p_year: TUT_YEAR }); setMsg('تم تسجيل ترشحك بنجاح'); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  async function withdraw() {
    setBusy(true); setErr(''); setMsg('');
    try { await tutRpc('tut_withdraw', { p_year: TUT_YEAR }); setConfirmWithdraw(false); setMsg('تم سحب ترشحك'); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const c = data?.candidate;
  const camp = data?.campaign || {};
  const open = camp.open_now === true;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: NAVY }}>
          <HeartHandshake className="w-5 h-5 text-[#c9a227]" />
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-gray-900">الترشح لـ{TUT_TITLE} — {TUT_YEAR}</h2>
          <p className="text-xs text-gray-500 mt-1">مرافقة طلبة السنة الأولى ليسانس.</p>
          {camp.deadline && <p className="text-xs text-gray-500 mt-1">آخر أجل للترشح: <b>{fmtDate(camp.deadline)}</b></p>}
        </div>
      </div>

      {msg && <Note icon={<CheckCircle2 className="w-5 h-5" />} tone="green" text={msg} />}
      {err && <Note icon={<AlertCircle className="w-5 h-5" />} tone="red" text={err} />}

      {!data?.permanent ? (
        <Note icon={<Lock className="w-5 h-5" />} tone="gray" text="الترشح مفتوح للأساتذة الدائمين فقط." />
      ) : c ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="font-bold text-sm text-gray-800">ترشحك مسجّل منذ {fmtDate(c.created_at)}</p>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              c.dean_decision === 'مصادق' ? 'bg-green-100 text-green-700'
              : c.dean_decision === 'مرفوض' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
              {c.dean_decision === 'مصادق' ? 'مصادق عليه' : c.dean_decision === 'مرفوض' ? 'غير مصادق' : 'قيد الدراسة'}
            </span>
          </div>
          {open && (!confirmWithdraw ? (
            <button onClick={() => setConfirmWithdraw(true)}
              className="w-full border border-red-200 text-red-600 rounded-xl py-2 text-sm font-semibold hover:bg-red-50 flex items-center justify-center gap-1">
              <Trash2 className="w-4 h-4" /> سحب الترشح
            </button>
          ) : (
            <button onClick={withdraw} disabled={busy}
              className="w-full bg-red-600 text-white rounded-xl py-2 text-sm font-bold disabled:opacity-50">
              تأكيد السحب
            </button>
          ))}
          {!open && !c.dean_decision && <p className="text-xs text-gray-500">أُغلقت الحملة، وترشحك قيد الدراسة.</p>}
        </div>
      ) : open ? (
        <button onClick={apply} disabled={busy}
          className="w-full bg-[#1a3a6b] text-white rounded-2xl py-3.5 text-sm font-bold disabled:opacity-50">
          {busy ? 'جارٍ التسجيل...' : 'أترشح'}
        </button>
      ) : (
        <Note icon={<Lock className="w-5 h-5" />} tone="gray" text="حملة الترشح للمرافقة البيداغوجية مغلقة حاليا." />
      )}
    </div>
  );
}

function Note({ icon, text, tone }: { icon: any; text: string; tone: 'green' | 'red' | 'gray' }) {
  const cls = tone === 'green' ? 'bg-green-50 border-green-200 text-green-700'
    : tone === 'red' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600';
  return <div className={`flex items-start gap-2 border rounded-xl px-4 py-3 text-sm ${cls}`}>{icon}<span>{text}</span></div>;
}
