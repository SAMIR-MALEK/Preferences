import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, KeyRound, CheckCircle } from 'lucide-react';

// تغيير كلمة السر الخاصة بالحساب الحالي (تتحقق من الحالية أولاً)
export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [conf, setConf] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit() {
    setErr('');
    if (!cur) { setErr('أدخل كلمة السر الحالية'); return; }
    if (pw.length < 6) { setErr('كلمة السر الجديدة 6 أحرف على الأقل'); return; }
    if (pw !== conf) { setErr('كلمة السر الجديدة وتأكيدها غير متطابقتين'); return; }
    if (pw === cur) { setErr('الجديدة مطابقة للحالية'); return; }
    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email || '';
    const { error: e1 } = await supabase.auth.signInWithPassword({ email, password: cur });
    if (e1) { setErr('كلمة السر الحالية غير صحيحة'); setBusy(false); return; }
    const { error: e2 } = await supabase.auth.updateUser({ password: pw });
    if (e2) setErr('تعذّر تغيير كلمة السر: ' + e2.message);
    else setDone(true);
    setBusy(false);
  }

  const inp = 'w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#1a3a6b]';
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2"><KeyRound className="w-4 h-4 text-[#c9a227]" /> تغيير كلمة السر</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X className="w-5 h-5" /></button>
        </div>
        {done ? (
          <div className="text-center py-6 space-y-3">
            <CheckCircle className="w-10 h-10 text-green-600 mx-auto" />
            <p className="text-sm text-gray-700">تم تغيير كلمة السر بنجاح</p>
            <button onClick={onClose} className="bg-[#1a3a6b] text-white rounded-xl px-5 py-2 text-sm font-bold">إغلاق</button>
          </div>
        ) : (
          <>
            <input type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} placeholder="كلمة السر الحالية" className={inp} />
            <input type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} placeholder="كلمة السر الجديدة" className={inp} />
            <input type="password" autoComplete="new-password" value={conf} onChange={e => setConf(e.target.value)} placeholder="تأكيد كلمة السر الجديدة" className={inp} />
            {err && <p className="text-xs text-red-600">{err}</p>}
            <button onClick={submit} disabled={busy}
              className="w-full bg-[#1a3a6b] text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-50">
              {busy ? 'جارٍ التغيير...' : 'تغيير كلمة السر'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
