import { useEffect, useState } from 'react';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { logAction } from '../../lib/logAction';
import { Copy } from 'lucide-react';

// إدارة حسابات المصالح (عرض فقط) — للمشرف العام وحده
const SERVICES = ['مصلحة التدريس - قانون عام', 'مصلحة التدريس - قانون خاص', 'مصلحة التدريس الكلية'];

interface Staff { user_id: string; username: string; full_name: string; service: string; is_active: boolean; created_at: string }

export default function AdminStaffPage() {
  const { user } = useAuth();
  const adminId = user?.admin?.user_id;
  const adminName = user?.admin?.full_name;

  const [rows, setRows] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [service, setService] = useState(SERVICES[0]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [cred, setCred] = useState<{ username: string; password: string; note: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('staff_viewers')
      .select('user_id, username, full_name, service, is_active, created_at').order('created_at', { ascending: false });
    if (error) setMsg({ type: 'err', text: 'تعذّر تحميل الحسابات: ' + error.message });
    else setRows((data as Staff[]) || []);
    setLoading(false);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setCred(null);
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(u)) { setMsg({ type: 'err', text: 'اسم المستخدم: 3 إلى 30 حرفاً لاتينياً صغيراً أو أرقاماً (مثل: ms.amer)' }); return; }
    if (fullName.trim().length < 3) { setMsg({ type: 'err', text: 'أدخل اللقب والاسم' }); return; }
    setBusy('create');
    try {
      const r = await callEdgeFunction('manage-staff', { action: 'create', username: u, full_name: fullName.trim(), service });
      setCred({ username: r.username, password: r.password, note: 'سلّم هذه البيانات لصاحبها الآن: كلمة المرور لا تُعرض مرة ثانية.' });
      await logAction(adminId, adminName, 'إنشاء حساب مصلحة', 'staff_viewers', { username: r.username, service });
      setUsername(''); setFullName('');
      await load();
    } catch (err: any) { setMsg({ type: 'err', text: err?.message || 'تعذّر الإنشاء' }); }
    setBusy(null);
  }

  async function act(s: Staff, action: 'reset_password' | 'set_active' | 'delete', extra: object = {}) {
    setMsg(null); setCred(null); setBusy(s.user_id + action);
    try {
      const r = await callEdgeFunction('manage-staff', { action, user_id: s.user_id, ...extra });
      if (action === 'reset_password') {
        setCred({ username: s.username, password: r.password, note: 'كلمة مرور جديدة — سلّمها لصاحبها الآن، ولا تُعرض مرة ثانية.' });
      }
      await logAction(adminId, adminName,
        action === 'reset_password' ? 'إعادة تعيين كلمة مرور حساب مصلحة'
          : action === 'delete' ? 'حذف حساب مصلحة'
          : (extra as any).active ? 'تفعيل حساب مصلحة' : 'تعطيل حساب مصلحة',
        'staff_viewers', { username: s.username });
      setConfirmDel(null);
      await load();
    } catch (err: any) { setMsg({ type: 'err', text: err?.message || 'تعذّرت العملية' }); }
    setBusy(null);
  }

  async function copyCred() {
    if (!cred) return;
    try { await navigator.clipboard.writeText(`اسم المستخدم: ${cred.username}\nكلمة المرور: ${cred.password}`); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* يُنسخ يدوياً */ }
  }

  return (
    <div className="space-y-5 max-w-3xl" dir="rtl">
      <div>
        <h2 className="font-bold text-[#1a3a6b] text-lg">حسابات المصالح (عرض فقط)</h2>
        <p className="text-xs text-gray-500 mt-1">كل حساب باسم صاحبه، ويرى البيانات ويطبعها دون أي تعديل. حسابات «قانون عام» و«قانون خاص» تقتصر على قسمها، و«الكلية» ترى كل شيء.</p>
      </div>

      {msg && <div className={`rounded-xl px-4 py-3 text-sm ${msg.type === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{msg.text}</div>}

      {cred && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 space-y-2">
          <p className="text-sm font-bold text-amber-800">{cred.note}</p>
          <p className="text-sm">اسم المستخدم: <span dir="ltr" className="font-mono font-bold">{cred.username}</span></p>
          <p className="text-sm">كلمة المرور: <span dir="ltr" className="font-mono font-bold text-base select-all">{cred.password}</span></p>
          <button onClick={copyCred} className="flex items-center gap-1.5 bg-[#1a3a6b] text-white rounded-lg px-3 py-1.5 text-xs font-bold">
            <Copy className="w-3.5 h-3.5" /> {copied ? 'تم النسخ' : 'نسخ'}
          </button>
        </div>
      )}

      <form onSubmit={create} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="font-bold text-sm text-gray-800">إنشاء حساب جديد</p>
        <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="اللقب والاسم"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#1a3a6b]" />
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="اسم المستخدم (لاتيني، مثل: ms.amer)" dir="ltr"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#1a3a6b]" />
        <select value={service} onChange={e => setService(e.target.value)}
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none bg-white">
          {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="submit" disabled={busy === 'create'}
          className="bg-[#1a3a6b] text-white rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60">
          {busy === 'create' ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}
        </button>
      </form>

      <div className="space-y-2">
        {loading && <p className="text-sm text-gray-400">جارٍ التحميل...</p>}
        {!loading && rows.length === 0 && <p className="text-sm text-gray-400">لا توجد حسابات بعد.</p>}
        {rows.map(s => (
          <div key={s.user_id} className="bg-white rounded-2xl border border-gray-100 p-3 flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[180px]">
              <p className="font-bold text-sm text-gray-800">{s.full_name}
                {!s.is_active && <span className="mr-2 text-[10px] bg-red-50 text-red-600 rounded-full px-2 py-0.5">معطَّل</span>}
              </p>
              <p className="text-xs text-gray-500">{s.service} — <span dir="ltr" className="font-mono">{s.username}</span></p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button disabled={!!busy} onClick={() => act(s, 'reset_password')}
                className="text-xs bg-gray-100 rounded-lg px-2.5 py-1.5 font-bold text-gray-700">كلمة مرور جديدة</button>
              <button disabled={!!busy} onClick={() => act(s, 'set_active', { active: !s.is_active })}
                className="text-xs bg-gray-100 rounded-lg px-2.5 py-1.5 font-bold text-gray-700">{s.is_active ? 'تعطيل' : 'تفعيل'}</button>
              {confirmDel === s.user_id ? (
                <>
                  <button disabled={!!busy} onClick={() => act(s, 'delete')}
                    className="text-xs bg-red-600 text-white rounded-lg px-2.5 py-1.5 font-bold">تأكيد الحذف النهائي</button>
                  <button onClick={() => setConfirmDel(null)} className="text-xs bg-gray-100 rounded-lg px-2.5 py-1.5">إلغاء</button>
                </>
              ) : (
                <button disabled={!!busy} onClick={() => setConfirmDel(s.user_id)}
                  className="text-xs bg-red-50 text-red-600 rounded-lg px-2.5 py-1.5 font-bold">حذف</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
