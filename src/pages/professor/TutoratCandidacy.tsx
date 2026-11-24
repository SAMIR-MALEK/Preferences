import { useEffect, useState } from 'react';
import { HeartHandshake, CheckCircle2, AlertCircle, Lock, Printer, Loader2, Trash2 } from 'lucide-react';
import { TUT_YEAR, TUT_TITLE, tutRpc, fmtDate, fmtH, printContracts } from '../../lib/tutorat';

const NAVY = '#1a3a6b';

// ترشح الأستاذ الدائم للمرافقة البيداغوجية
export default function TutoratCandidacy({ prof }: { prof: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ birth: '', diploma: '', diplomaDate: '', address: '', ccp: '', declared: false });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  async function load() {
    setLoading(true); setErr('');
    try {
      const d = await tutRpc('tut_my', { p_year: TUT_YEAR });
      setData(d);
      const p = d?.private;
      if (p) setForm({ birth: p.birth_date || '', diploma: p.diploma || '', diplomaDate: p.diploma_date || '',
                       address: p.address || '', ccp: p.ccp || '', declared: true });
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function submit() {
    setErr(''); setMsg('');
    const today = new Date().toISOString().slice(0, 10);
    if (!form.birth || !form.diploma.trim() || !form.diplomaDate || !form.address.trim() || !form.ccp.trim()) {
      setErr('كل الخانات إجبارية'); return;
    }
    if (form.birth > today || form.diplomaDate > today) { setErr('التاريخ لا يكون في المستقبل'); return; }
    if (!form.declared) { setErr('يجب الإقرار بصحة المعلومات'); return; }
    setBusy(true);
    try {
      await tutRpc('tut_submit', {
        p_year: TUT_YEAR, p_birth: form.birth, p_diploma: form.diploma, p_diploma_date: form.diplomaDate,
        p_address: form.address, p_ccp: form.ccp, p_declared: form.declared,
      });
      setMsg(data?.candidate ? 'تم تحديث بياناتك' : 'تم تسجيل ترشحك بنجاح');
      setEditing(false);
      await load();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  async function withdraw() {
    setBusy(true); setErr('');
    try { await tutRpc('tut_withdraw', { p_year: TUT_YEAR }); setConfirmWithdraw(false); setMsg('تم سحب ترشحك');
          setForm(f => ({ ...f, declared: false })); await load(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  }

  async function printMine() {
    try { const c = await tutRpc('tut_contract', { p_id: data.candidate.id }); printContracts([c]); }
    catch (e: any) { setErr(e.message); }
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;

  const c = data?.candidate;
  const camp = data?.campaign || {};
  const open = camp.open_now === true;
  const h = data?.hours || {};
  const allowed = Number(h.allowed || 0);
  const showForm = open && (!c || editing);

  const inp = 'w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1a3a6b]';
  const lbl = 'block text-xs font-semibold text-gray-600 mb-1';

  return (
    <div className="space-y-4" dir="rtl">
      {/* العنوان */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: NAVY }}>
          <HeartHandshake className="w-5 h-5 text-[#c9a227]" />
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-gray-900">الترشح لـ{TUT_TITLE} — {TUT_YEAR}</h2>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            مرافقة طلبة السنة الأولى ليسانس وفق المرسوم التنفيذي 09-03 والقرار المؤرخ في 16 جوان 2010:
            4 ساعات أسبوعيا كحد أقصى ولمدة لا تتجاوز 9 أشهر في السنة.
          </p>
          {camp.deadline && <p className="text-xs text-gray-500 mt-1">آخر أجل للترشح: <b>{fmtDate(camp.deadline)}</b></p>}
        </div>
      </div>

      {!data?.permanent && (
        <Note icon={<Lock className="w-5 h-5" />} tone="gray" text="الترشح مفتوح للأساتذة الدائمين فقط." />
      )}

      {data?.permanent && (
        <>
          {/* الساعات */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{fmtH(h.extra)} <span className="text-sm">س</span></p>
              <p className="text-xs text-gray-500 mt-1">ساعاتك الإضافية (السداسي {h.semester || 1})</p>
            </div>
            <div className={`rounded-2xl border p-4 text-center ${allowed > 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-2xl font-bold ${allowed > 0 ? 'text-green-700' : 'text-red-700'}`}>{fmtH(allowed)} <span className="text-sm">س</span></p>
              <p className="text-xs text-gray-500 mt-1">الساعات المسموحة لك في المرافقة</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2 px-1">
            المادة 4 من القرار المؤرخ في 16 جوان 2010: الساعات الإضافية مع المرافقة لا تتجاوز 12 ساعة أسبوعيا.
          </p>

          {msg && <Note icon={<CheckCircle2 className="w-5 h-5" />} tone="green" text={msg} />}
          {err && <Note icon={<AlertCircle className="w-5 h-5" />} tone="red" text={err} />}

          {/* حالة الملف */}
          {c && !editing && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-bold text-sm text-gray-800">ترشحك مسجّل منذ {fmtDate(c.created_at)}</p>
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  c.dean_decision === 'مصادق' ? 'bg-green-100 text-green-700'
                  : c.dean_decision === 'مرفوض' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {c.dean_decision === 'مصادق' ? 'مصادق عليه' : c.dean_decision === 'مرفوض' ? 'غير مصادق' : 'قيد الدراسة'}
                </span>
              </div>
              {c.dean_decision === 'مصادق' && (
                <button onClick={printMine}
                  className="w-full flex items-center justify-center gap-2 bg-[#1a3a6b] text-white rounded-xl py-2.5 text-sm font-bold">
                  <Printer className="w-4 h-4" /> طباعة عقد الالتزام
                </button>
              )}
              {open && (
                <div className="flex gap-2">
                  <button onClick={() => { setEditing(true); setMsg(''); }}
                    className="flex-1 border border-gray-300 rounded-xl py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                    تعديل بياناتي
                  </button>
                  {!confirmWithdraw ? (
                    <button onClick={() => setConfirmWithdraw(true)}
                      className="flex-1 border border-red-200 text-red-600 rounded-xl py-2 text-sm font-semibold hover:bg-red-50 flex items-center justify-center gap-1">
                      <Trash2 className="w-4 h-4" /> سحب الترشح
                    </button>
                  ) : (
                    <button onClick={withdraw} disabled={busy}
                      className="flex-1 bg-red-600 text-white rounded-xl py-2 text-sm font-bold disabled:opacity-50">
                      تأكيد السحب
                    </button>
                  )}
                </div>
              )}
              {!open && !c.dean_decision && (
                <p className="text-xs text-gray-500">أُغلقت الحملة، وملفك قيد الدراسة.</p>
              )}
            </div>
          )}

          {!c && !open && <Note icon={<Lock className="w-5 h-5" />} tone="gray" text="حملة الترشح للمرافقة البيداغوجية مغلقة حاليا." />}

          {showForm && allowed <= 0 && (
            <Note icon={<AlertCircle className="w-5 h-5" />} tone="red"
              text="لا يمكنك الترشح: ساعاتك الإضافية تبلغ السقف القانوني (12 ساعة أسبوعيا، المادة 4 من القرار المؤرخ في 16 جوان 2010)." />
          )}

          {/* الاستمارة */}
          {showForm && allowed > 0 && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 rounded-xl p-3">
                <div><span className="text-gray-500">الاسم واللقب: </span><b>{prof?.last_name} {prof?.first_name}</b></div>
                <div><span className="text-gray-500">الرتبة: </span><b>{prof?.rank || '—'}</b></div>
                <div><span className="text-gray-500">الهاتف: </span><b dir="ltr">{prof?.phone || '—'}</b></div>
                <div className="truncate"><span className="text-gray-500">البريد: </span><b dir="ltr">{prof?.email || '—'}</b></div>
              </div>
              <p className="text-xs text-gray-500">بيانات عقد الالتزام الفردي (كلها إجبارية):</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className={lbl}>تاريخ الميلاد</label>
                  <input type="date" className={inp} value={form.birth} onChange={e => setForm({ ...form, birth: e.target.value })} /></div>
                <div><label className={lbl}>الشهادة الجامعية المتحصل عليها</label>
                  <input className={inp} placeholder="مثال: دكتوراه في الحقوق" value={form.diploma} onChange={e => setForm({ ...form, diploma: e.target.value })} /></div>
                <div><label className={lbl}>تاريخ الحصول على الشهادة</label>
                  <input type="date" className={inp} value={form.diplomaDate} onChange={e => setForm({ ...form, diplomaDate: e.target.value })} /></div>
                <div><label className={lbl}>رقم الحساب البريدي الجاري</label>
                  <input className={inp} dir="ltr" inputMode="numeric" value={form.ccp} onChange={e => setForm({ ...form, ccp: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className={lbl}>العنوان الشخصي</label>
                  <input className={inp} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
              </div>
              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={form.declared} onChange={e => setForm({ ...form, declared: e.target.checked })} />
                <span>أصرّح بصحة المعلومات، وألتزم بأداء المهمة في حدود 4 ساعات أسبوعيا ولمدة لا تتجاوز 9 أشهر.</span>
              </label>
              <div className="flex gap-2">
                <button onClick={submit} disabled={busy}
                  className="flex-1 bg-[#1a3a6b] text-white rounded-xl py-3 text-sm font-bold disabled:opacity-50">
                  {busy ? 'جارٍ الإرسال...' : c ? 'حفظ التعديل' : 'أترشح'}
                </button>
                {editing && (
                  <button onClick={() => { setEditing(false); setErr(''); }}
                    className="px-5 border border-gray-300 rounded-xl text-sm text-gray-600">إلغاء</button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Note({ icon, text, tone }: { icon: any; text: string; tone: 'green' | 'red' | 'gray' }) {
  const cls = tone === 'green' ? 'bg-green-50 border-green-200 text-green-700'
    : tone === 'red' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600';
  return <div className={`flex items-start gap-2 border rounded-xl px-4 py-3 text-sm ${cls}`}>{icon}<span>{text}</span></div>;
}
