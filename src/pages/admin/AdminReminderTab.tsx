// هذا المحتوى يُضاف كتبويب ثانٍ داخل AdminEmailPage.tsx
// أو كصفحة مستقلة — حسب التصميم المختار
import { useState, useEffect } from 'react';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import { Send, CheckCircle, AlertCircle, Clock, RefreshCw, Users } from 'lucide-react';

interface ProfStatus {
  id: string;
  last_name: string;
  first_name: string;
  email: string;
  username: string;
  wishes_locked_s1: boolean;
  wishes_locked_s2: boolean;
  s1_count: number;
  s2_count: number;
  selected: boolean;
  send_status: 'pending' | 'sending' | 'sent' | 'skipped' | 'failed';
  reason?: string;
}

function getStatusLabel(p: ProfStatus): { text: string; color: string; bg: string } {
  if (p.wishes_locked_s1 && p.wishes_locked_s2) return { text: 'مكتمل ✓', color: 'text-green-700', bg: 'bg-green-50' };
  if (!p.s1_count && !p.s2_count) return { text: 'لم يسجّل أصلاً', color: 'text-red-700', bg: 'bg-red-50' };
  if (p.wishes_locked_s1 && !p.s2_count) return { text: 'س1 ✓ — س2 فارغ', color: 'text-amber-700', bg: 'bg-amber-50' };
  if (!p.s1_count && p.wishes_locked_s2) return { text: 'س2 ✓ — س1 فارغ', color: 'text-amber-700', bg: 'bg-amber-50' };
  if (p.s1_count && !p.wishes_locked_s1 && p.s2_count && !p.wishes_locked_s2) return { text: 'حفظ مؤقت فقط (السداسيان)', color: 'text-orange-700', bg: 'bg-orange-50' };
  if (p.s1_count && !p.wishes_locked_s1) return { text: 'س1 مؤقت — س2 فارغ', color: 'text-orange-700', bg: 'bg-orange-50' };
  if (p.s2_count && !p.wishes_locked_s2) return { text: 'س2 مؤقت — س1 فارغ', color: 'text-orange-700', bg: 'bg-orange-50' };
  if (p.wishes_locked_s1 && p.s2_count && !p.wishes_locked_s2) return { text: 'س1 ✓ — س2 مؤقت', color: 'text-blue-700', bg: 'bg-blue-50' };
  if (p.s1_count && !p.wishes_locked_s1 && p.wishes_locked_s2) return { text: 'س2 ✓ — س1 مؤقت', color: 'text-blue-700', bg: 'bg-blue-50' };
  return { text: 'غير محدد', color: 'text-gray-500', bg: 'bg-gray-50' };
}

export default function AdminReminderTab() {
  const [professors, setProfessors] = useState<ProfStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: profs }, { data: wishes }] = await Promise.all([
      supabase.from('professors').select('id, last_name, first_name, email, username, wishes_locked_s1, wishes_locked_s2').order('last_name'),
      supabase.from('wishes').select('professor_id, semester').eq('academic_year', '2026-2027'),
    ]);

    if (profs) {
      const data: ProfStatus[] = profs.map(p => {
        const s1 = wishes?.filter(w => w.professor_id === p.id && w.semester === 1).length || 0;
        const s2 = wishes?.filter(w => w.professor_id === p.id && w.semester === 2).length || 0;
        const complete = p.wishes_locked_s1 && p.wishes_locked_s2;
        return {
          ...p,
          s1_count: s1,
          s2_count: s2,
          selected: !complete, // افتراضياً: نحدد كل من لم يكمل
          send_status: 'pending' as const,
        };
      });
      setProfessors(data);
    }
    setLoading(false);
  }

  function toggleOne(id: string) {
    setProfessors(prev => prev.map(p => p.id === id ? { ...p, selected: !p.selected } : p));
  }

  function toggleAll() {
    const incomplete = professors.filter(p => !(p.wishes_locked_s1 && p.wishes_locked_s2));
    const allSelected = incomplete.every(p => p.selected);
    setProfessors(prev => prev.map(p => {
      if (p.wishes_locked_s1 && p.wishes_locked_s2) return p;
      return { ...p, selected: !allSelected };
    }));
  }

  async function handleSend() {
    const toSend = professors.filter(p => p.selected && !(p.wishes_locked_s1 && p.wishes_locked_s2));
    if (toSend.length === 0) { setMessage({ type: 'error', text: 'لا يوجد أساتذة محدَّدون' }); return; }
    if (!window.confirm(`سيتم إرسال تذكير بريدي إلى ${toSend.length} أستاذ. هل أنت متأكد؟`)) return;

    setSending(true);
    setMessage(null);
    setProfessors(prev => prev.map(p => toSend.find(t => t.id === p.id) ? { ...p, send_status: 'sending' as const } : p));

    try {
      const result = await callEdgeFunction('send-reminder-email', { professor_ids: toSend.map(p => p.id) });
      setProfessors(prev => prev.map(p => {
        const found = result.results?.find((r: any) => r.name === `${p.last_name} ${p.first_name}`);
        if (!found) return p;
        return { ...p, send_status: found.status as any, reason: found.reason };
      }));
      setMessage({
        type: result.failed > 0 ? 'error' : 'success',
        text: `تم الإرسال إلى ${toArabicNum(result.sent)} أستاذ — تخطّي ${toArabicNum(result.skipped)} — فشل ${toArabicNum(result.failed)}`,
      });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
      setProfessors(prev => prev.map(p => toSend.find(t => t.id === p.id) ? { ...p, send_status: 'pending' as const } : p));
    }
    setSending(false);
  }

  const incomplete = professors.filter(p => !(p.wishes_locked_s1 && p.wishes_locked_s2));
  const selected = professors.filter(p => p.selected && !(p.wishes_locked_s1 && p.wishes_locked_s2));
  const withEmail = selected.filter(p => p.email);

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600" />
        <p className="text-xs text-amber-700">
          سيُرسَل تذكير شخصي لكل أستاذ يذكر حالته بالتفصيل (لم يسجّل / حفظ مؤقت / سداسي ناقص).
          لن يُرسَل للأساتذة الذين أكملوا التسجيل في السداسيين معاً.
        </p>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
        <span className="text-sm text-gray-600 flex items-center gap-1.5">
          <Users className="w-4 h-4 text-[#1a3a6b]" /> {toArabicNum(incomplete.length)} لم يكملوا التسجيل
        </span>
        <span className="text-sm text-blue-600">{toArabicNum(selected.length)} محدَّد</span>
        <span className="text-sm text-gray-400">({toArabicNum(withEmail.length)} لديهم بريد)</span>
        <div className="mr-auto">
          <button onClick={handleSend} disabled={sending || withEmail.length === 0}
            className="flex items-center gap-2 bg-[#1a3a6b] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2040] transition-colors disabled:opacity-50">
            <Send className="w-4 h-4" />
            {sending ? 'جارٍ الإرسال...' : `إرسال التذكير إلى ${toArabicNum(withEmail.length)} أستاذ`}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b border-gray-100">
                <th className="px-3 py-3 w-10">
                  <input type="checkbox"
                    checked={incomplete.length > 0 && incomplete.every(p => p.selected)}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-[#1a3a6b]" />
                </th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">الأستاذ</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">البريد</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">حالة التسجيل</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">الإرسال</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {professors.map(p => {
                const statusLabel = getStatusLabel(p);
                const complete = p.wishes_locked_s1 && p.wishes_locked_s2;
                return (
                  <tr key={p.id} className={complete ? 'opacity-40' : ''}>
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={p.selected && !complete} disabled={complete}
                        onChange={() => toggleOne(p.id)}
                        className="w-4 h-4 accent-[#1a3a6b]" />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-800">{p.last_name} {p.first_name}</td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs" dir="ltr">
                      {p.email || <span className="text-red-400">بدون بريد</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusLabel.color} ${statusLabel.bg}`}>
                        {statusLabel.text}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {p.send_status === 'pending' && <span className="text-xs text-gray-400">—</span>}
                      {p.send_status === 'sending' && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                      {p.send_status === 'sent' && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> أُرسل</span>}
                      {p.send_status === 'skipped' && <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> تخطّي</span>}
                      {p.send_status === 'failed' && <span title={p.reason} className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> فشل</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
