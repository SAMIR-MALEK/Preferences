import { useState, useRef } from 'react';
import { callEdgeFunction } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import { Upload, Send, CheckCircle, AlertCircle, Mail, Users, X, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Recipient {
  id: string;
  last_name: string;
  first_name: string;
  email: string;
  username: string;
  password: string;
  selected: boolean;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  error?: string;
}

export default function AdminEmailPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const dataRows = raw.slice(1).filter(r => r.some(c => c !== undefined && c !== ''));
      setRecipients(dataRows.map((r, i) => ({
        id: `r_${i}_${Date.now()}`,
        last_name: String(r[0] || '').trim(),
        first_name: String(r[1] || '').trim(),
        email: String(r[3] || '').trim(),
        username: String(r[4] || '').trim(),
        password: String(r[5] || '').trim(),
        selected: true,
        status: 'pending' as const,
      })));
      setDone(false);
      setMessage(null);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  function toggleOne(id: string) {
    setRecipients(prev => prev.map(r => r.id === id ? { ...r, selected: !r.selected } : r));
  }

  function toggleAll() {
    const allSelected = recipients.every(r => r.selected);
    setRecipients(prev => prev.map(r => ({ ...r, selected: !allSelected })));
  }

  async function handleSend() {
    const toSend = recipients.filter(r => r.selected && r.email && r.username && r.password);
    if (toSend.length === 0) {
      setMessage({ type: 'error', text: 'لا يوجد أساتذة محدَّدون ببريد إلكتروني وبيانات دخول كاملة' });
      return;
    }

    if (!window.confirm(`سيتم إرسال بريد إلكتروني بمعلومات الدخول إلى ${toSend.length} أستاذ. هل أنت متأكد؟`)) {
      return;
    }

    setSending(true);
    setMessage(null);
    setRecipients(prev => prev.map(r => toSend.find(t => t.id === r.id) ? { ...r, status: 'sending' as const } : r));

    try {
      const result = await callEdgeFunction('send-credentials-email', {
        recipients: toSend.map(r => ({
          last_name: r.last_name,
          first_name: r.first_name,
          email: r.email,
          username: r.username,
          password: r.password,
        })),
      });

      setRecipients(prev => prev.map(r => {
        const found = result.results?.find((res: any) => res.name === `${r.last_name} ${r.first_name}`);
        if (!found) return r;
        return { ...r, status: (found.status === 'sent' ? 'sent' : 'failed') as 'sent' | 'failed', error: found.error };
      }));

      setMessage({
        type: result.failed_count > 0 ? 'error' : 'success',
        text: `تم الإرسال إلى ${toArabicNum(result.sent_count)} أستاذ بنجاح${result.failed_count > 0 ? `، وفشل الإرسال لـ ${toArabicNum(result.failed_count)}` : ''}`,
      });
      setDone(true);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'حدث خطأ أثناء الإرسال' });
      setRecipients(prev => prev.map(r => toSend.find(t => t.id === r.id) ? { ...r, status: 'pending' as const } : r));
    }
    setSending(false);
  }

  const selectedCount = recipients.filter(r => r.selected).length;
  const readyCount = recipients.filter(r => r.selected && r.email && r.username && r.password).length;
  const sentCount = recipients.filter(r => r.status === 'sent').length;
  const failedCount = recipients.filter(r => r.status === 'failed').length;

  return (
    <div className="space-y-5 animate-fade-in pb-8" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">إرسال بريد معلومات الدخول</h2>
        <p className="text-gray-500 text-sm mt-1">رفع ملف Excel يحتوي بيانات الدخول، وإرساله بريدياً لأستاذ معيّن أو لجميع الأساتذة المحدَّدين</p>
      </div>

      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="text-xs text-amber-700 space-y-1">
          <p><strong>تنبيه مهم:</strong> هذه الميزة تُستخدَم للإرسال الأولي فقط (عند انطلاق المنصة)، عندما تكون كلمات المرور لا تزال أولية ولم يغيّرها الأساتذة بعد.</p>
          <p>الملف المطلوب: أعمدة بالترتيب — اللقب، الاسم، الرتبة، البريد الإلكتروني، اسم المستخدم، كلمة المرور (نفس صيغة ملف تصدير الأساتذة).</p>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {recipients.length === 0 && (
        <div onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-[#1a3a6b]/30 rounded-2xl p-14 text-center cursor-pointer hover:border-[#1a3a6b]/60 hover:bg-[#1a3a6b]/[0.02] transition-all">
          <Mail className="w-14 h-14 text-[#1a3a6b]/30 mx-auto mb-3" />
          <p className="font-display font-bold text-gray-700 mb-1">اضغط لرفع ملف Excel ببيانات الدخول</p>
          <p className="text-gray-400 text-sm">يحتوي اللقب، الاسم، الرتبة، البريد، اسم المستخدم، كلمة المرور</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </div>
      )}

      {recipients.length > 0 && (
        <>
          <div className="flex items-center gap-4 flex-wrap bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
            <span className="text-sm text-gray-600 font-medium flex items-center gap-1.5">
              <Users className="w-4 h-4 text-[#1a3a6b]" /> {toArabicNum(recipients.length)} أستاذ في الملف
            </span>
            <span className="text-sm text-blue-600 font-medium">{toArabicNum(selectedCount)} محدَّد</span>
            <span className="text-sm text-gray-400">({toArabicNum(readyCount)} جاهز للإرسال)</span>
            {sentCount > 0 && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {toArabicNum(sentCount)} أُرسل</span>}
            {failedCount > 0 && <span className="text-sm text-red-600 font-medium flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {toArabicNum(failedCount)} فشل</span>}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-100">
                    <th className="px-3 py-3 w-10">
                      <input type="checkbox" checked={recipients.every(r => r.selected)} onChange={toggleAll}
                        className="w-4 h-4 accent-[#1a3a6b]" />
                    </th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">الأستاذ</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">البريد الإلكتروني</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">م.مستخدم</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">ك.مرور</th>
                    <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recipients.map(r => (
                    <tr key={r.id} className={!r.email || !r.username || !r.password ? 'bg-red-50/30' : ''}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={r.selected} onChange={() => toggleOne(r.id)}
                          className="w-4 h-4 accent-[#1a3a6b]" />
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 font-medium">{r.last_name} {r.first_name}</td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs" dir="ltr">{r.email || <span className="text-red-500">بدون بريد</span>}</td>
                      <td className="px-3 py-2.5"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.username || '—'}</code></td>
                      <td className="px-3 py-2.5"><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.password || '—'}</code></td>
                      <td className="px-3 py-2.5">
                        {r.status === 'pending' && <span className="text-xs text-gray-400">في الانتظار</span>}
                        {r.status === 'sending' && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                        {r.status === 'sent' && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> أُرسل</span>}
                        {r.status === 'failed' && <span title={r.error} className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> فشل</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
              <button onClick={() => { setRecipients([]); setDone(false); setMessage(null); }}
                className="flex items-center gap-2 text-gray-400 text-sm hover:text-gray-600">
                <X className="w-4 h-4" /> إلغاء وبدء من جديد
              </button>
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 text-gray-400 text-sm hover:text-gray-600">
                <Upload className="w-4 h-4" /> رفع ملف آخر
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
              <div className="mr-auto">
                <button onClick={handleSend} disabled={sending || readyCount === 0}
                  className="flex items-center gap-2 bg-[#1a3a6b] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2040] transition-colors disabled:opacity-50">
                  <Send className="w-4 h-4" />
                  {sending ? 'جارٍ الإرسال...' : `إرسال البريد إلى ${toArabicNum(readyCount)} أستاذ`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
