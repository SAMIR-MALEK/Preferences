import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Session {
  id: string;
  starts_at: string;
  link: string;
  status: 'scheduled' | 'done' | 'cancelled';
  created_by_name: string | null;
}

function fmt(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} — ${time}`;
}

// قيمة حقل datetime-local (توقيت الجهاز) من تاريخ ISO
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// برمجة جلسات محاضرة عن بعد: موعد (بداية فقط) + رابط. يُستعمل عند الأستاذ وعند الإدارة.
export default function RemoteSessionsPanel({ assignmentId }: { assignmentId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [when, setWhen] = useState('');
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; status: 'done' | 'cancelled' } | null>(null);

  async function load() {
    const { data, error } = await supabase.rpc('remote_sessions_list', { p_assignment_id: assignmentId });
    if (error) setMsg({ ok: false, text: error.message });
    else setSessions((data as Session[]) || []);
    setLoading(false);
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [assignmentId]);

  function resetForm() { setEditId(null); setWhen(''); setLink(''); }

  async function save() {
    setMsg(null);
    if (!when) { setMsg({ ok: false, text: 'حدّد التاريخ والساعة' }); return; }
    if (!/^https?:\/\/\S+$/i.test(link.trim())) { setMsg({ ok: false, text: 'الرابط غير صحيح: يجب أن يبدأ بـ https://' }); return; }
    setSaving(true);
    const { error } = await supabase.rpc('remote_session_save', {
      p_id: editId, p_assignment_id: assignmentId,
      p_starts_at: new Date(when).toISOString(), p_link: link.trim(),
    });
    setSaving(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: editId ? 'تم تعديل الجلسة' : 'تمت برمجة الجلسة، وستظهر للطلبة المسجّلين في فضائهم' });
    resetForm();
    await load();
  }

  async function setStatus(id: string, status: 'done' | 'cancelled') {
    setConfirm(null);
    const { error } = await supabase.rpc('remote_session_status', { p_id: id, p_status: status });
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: status === 'done' ? 'سُجّلت الجلسة منجزة' : 'أُلغيت الجلسة' });
    await load();
  }

  const upcoming = sessions.filter(s => s.status === 'scheduled');
  const past = sessions.filter(s => s.status !== 'scheduled');

  return (
    <div className="mt-2 bg-white rounded-xl border border-purple-100 p-3 space-y-3" dir="rtl">
      <div className="space-y-2">
        <p className="text-xs font-bold text-purple-800">{editId ? 'تعديل الجلسة' : 'برمجة جلسة جديدة'}</p>
        <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        <input type="url" dir="ltr" placeholder="https://..." value={link} onChange={e => setLink(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-left" />
        <div className="flex gap-2">
          <button onClick={save} disabled={saving}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2 text-sm font-bold disabled:opacity-40">
            {saving ? 'جارٍ الحفظ...' : editId ? 'حفظ التعديل' : 'برمجة الجلسة'}
          </button>
          {editId && (
            <button onClick={resetForm} className="px-4 bg-gray-100 text-gray-600 rounded-lg text-sm">إلغاء</button>
          )}
        </div>
        {msg && <p className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</p>}
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">جارٍ التحميل...</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-600">جلسات مبرمجة</p>
              {upcoming.map(s => (
                <div key={s.id} className="bg-purple-50 border border-purple-100 rounded-lg p-2.5 space-y-1.5">
                  <p className="text-sm font-bold text-gray-800">{fmt(s.starts_at)}</p>
                  <a href={s.link} target="_blank" rel="noopener noreferrer" dir="ltr"
                    className="block text-xs text-blue-600 underline break-all text-left">{s.link}</a>
                  {confirm?.id === s.id ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-600">{confirm.status === 'done' ? 'تأكيد أن الجلسة تمّت؟' : 'إلغاء هذه الجلسة؟'}</span>
                      <button onClick={() => setStatus(s.id, confirm.status)} className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs font-bold">نعم</button>
                      <button onClick={() => setConfirm(null)} className="px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs">لا</button>
                    </div>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setConfirm({ id: s.id, status: 'done' })} className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs font-bold">تمّت</button>
                      <button onClick={() => { setEditId(s.id); setWhen(toLocalInput(s.starts_at)); setLink(s.link); setMsg(null); }} className="px-3 py-1 rounded-lg bg-white border border-gray-200 text-gray-700 text-xs">تعديل</button>
                      <button onClick={() => setConfirm({ id: s.id, status: 'cancelled' })} className="px-3 py-1 rounded-lg bg-red-50 text-red-600 text-xs">إلغاء</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-gray-500">السجل</p>
              {past.map(s => (
                <p key={s.id} className="text-[11px] text-gray-500">
                  {fmt(s.starts_at)} — {s.status === 'done' ? 'تمّت' : 'أُلغيت'}{s.created_by_name ? ` (برمجها: ${s.created_by_name})` : ''}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
