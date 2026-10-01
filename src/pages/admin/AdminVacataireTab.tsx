import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { logAction } from '../../lib/logAction';
import { CheckCircle, XCircle, Clock, RefreshCw, Eye, Printer } from 'lucide-react';

interface Application {
  id: string;
  ref_number: string;
  nin: string;
  last_name: string;
  first_name: string;
  last_name_fr: string;
  first_name_fr: string;
  birth_date: string;
  phone: string;
  email: string;
  degree: string;
  specialty: string;
  degree_file_url: string;
  years_taught: number;
  taught_last_3: boolean;
  preferred_days: string[];
  preferred_period: string;
  motivation: string;
  preferred_modules_keys: string[];
  status: string;
  admin_note: string;
  academic_year: string;
  created_at: string;
  decided_by?: string;
}

const statusColor = (s: string) =>
  s === 'مقبول' ? 'bg-green-100 text-green-700 border-green-200' :
  s === 'مرفوض' ? 'bg-red-100 text-red-700 border-red-200' :
  'bg-amber-100 text-amber-700 border-amber-200';

export default function AdminVacataireTab() {
  const { user } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Application | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'all' | 'قيد الدراسة' | 'مقبول' | 'مرفوض'>('all');
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('vacataire_applications')
      .select('*').eq('academic_year', '2026-2027')
      .order('created_at', { ascending: false });
    if (data) setApps(data);
    setLoading(false);
  }

  async function decide(status: 'مقبول' | 'مرفوض') {
    if (!selected) return;
    setSaving(true);
    const adminName = user?.admin?.full_name || '—';
    const { error: updateError } = await supabase.from('vacataire_applications').update({
      status, admin_note: note,
      decided_by: adminName,
    }).eq('ref_number', selected.ref_number);
    if (updateError) { alert('خطأ: ' + updateError.message); setSaving(false); return; }
    await logAction(user?.admin?.id, adminName, status === 'مقبول' ? 'accept_vacataire' : 'reject_vacataire', 'vacataire', {
      ref: selected.ref_number, name: `${selected.last_name} ${selected.first_name}`,
    });
    setApps(prev => prev.map(a => a.id === selected.id ? { ...a, status, admin_note: note, decided_by: adminName } : a));
    setSelected(prev => prev ? { ...prev, status, admin_note: note } : null);
    setSaving(false);
  }

  function printApp() {
    if (!selected) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">
    <style>body{font-family:Arial,sans-serif;padding:20px;direction:rtl}
    h1{color:#1a3a6b;font-size:16px}table{width:100%;border-collapse:collapse;margin:10px 0}
    td,th{border:1px solid #ddd;padding:8px;font-size:13px}th{background:#1a3a6b;color:white}
    .badge{display:inline-block;padding:4px 10px;border-radius:20px;font-size:12px;font-weight:bold}
    </style></head><body>
    <div style="text-align:center;margin-bottom:20px">
      <p style="font-size:11px;color:#666">الجمهورية الجزائرية الديمقراطية الشعبية — وزارة التعليم العالي</p>
      <p style="font-weight:bold">جامعة محمد البشير الإبراهيمي — برج بوعريريج</p>
      <p style="color:#1a3a6b;font-weight:bold">كلية الحقوق والعلوم السياسية</p>
      <h1>طلب التدريس المؤقت — ${selected.ref_number}</h1>
      <p style="font-size:11px">الموسم الجامعي 2026/2027</p>
    </div>
    <table>
      <tr><th>اللقب والاسم</th><td>${selected.last_name} ${selected.first_name}</td><th>Nom & Prénom</th><td>${selected.last_name_fr} ${selected.first_name_fr}</td></tr>
      <tr><th>NIN</th><td>${selected.nin}</td><th>تاريخ الميلاد</th><td>${selected.birth_date}</td></tr>
      <tr><th>الهاتف</th><td>${selected.phone}</td><th>البريد</th><td>${selected.email}</td></tr>
      <tr><th>آخر شهادة</th><td>${selected.degree}</td><th>التخصص</th><td>${selected.specialty}</td></tr>
      <tr><th>سنوات التدريس</th><td>${selected.years_taught || '—'}</td><th>آخر 3 سنوات</th><td>${selected.taught_last_3 ? 'نعم' : 'لا'}</td></tr>
      <tr><th>الأيام المفضلة</th><td>${selected.preferred_days?.join('، ') || '—'}</td><th>الفترة</th><td>${selected.preferred_period || '—'}</td></tr>
    </table>
    ${selected.motivation ? `<p><strong>رسالة التقديم:</strong> ${selected.motivation}</p>` : ''}
    <div style="margin-top:30px;display:flex;justify-content:space-between">
      <div style="text-align:center"><div style="border-top:1px solid #000;width:150px;margin:0 auto;padding-top:5px;font-size:11px">توقيع المتقدم</div></div>
      <div style="text-align:center"><div style="border-top:1px solid #000;width:150px;margin:0 auto;padding-top:5px;font-size:11px">نائب العميد المكلف بالبيداغوجيا</div></div>
    </div>
    </body></html>`);
    w.document.close();
    w.print();
  }

  const filtered = filter === 'all' ? apps : apps.filter(a => a.status === filter);

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin"/></div>;

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">طلبات الأساتذة المؤقتين</h2>
          <p className="text-gray-500 text-sm">{apps.length} طلب — {apps.filter(a=>a.status==='قيد الدراسة').length} قيد الدراسة</p>
        </div>
        <button onClick={loadData} className="flex items-center gap-2 bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-sm hover:bg-gray-200">
          <RefreshCw className="w-4 h-4"/> تحديث
        </button>
      </div>

      {/* فلاتر */}
      <div className="flex gap-2 flex-wrap">
        {(['all','قيد الدراسة','مقبول','مرفوض'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${filter===f?'bg-[#1a3a6b] text-white':'bg-white text-gray-500 border border-gray-200'}`}>
            {f === 'all' ? 'الكل' : f} {f !== 'all' && `(${apps.filter(a=>a.status===f).length})`}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* قائمة الطلبات */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-50">
            {filtered.length === 0 && <p className="text-center py-8 text-gray-400">لا توجد طلبات</p>}
            {filtered.map(a => (
              <div key={a.id} onClick={() => { setSelected(a); setNote(a.admin_note || ''); }}
                className={`p-4 cursor-pointer hover:bg-gray-50 transition-colors ${selected?.id === a.id ? 'bg-blue-50/50 border-r-2 border-[#1a3a6b]' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-gray-800 text-sm">{a.last_name} {a.first_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{a.degree} — {a.specialty}</p>
                    <p className="text-xs text-gray-400 mt-0.5">رقم الملف: {a.ref_number}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColor(a.status)}`}>{a.status}</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">{new Date(a.created_at).toLocaleDateString('ar-DZ')}</p>
              </div>
            ))}
          </div>
        </div>

        {/* تفاصيل الطلب */}
        {selected ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 bg-gradient-to-r from-[#1a3a6b] to-[#0d2040] text-white flex items-center justify-between">
              <div>
                <p className="font-bold">{selected.last_name} {selected.first_name}</p>
                <p className="text-blue-200 text-xs">{selected.ref_number}</p>
              </div>
              <button onClick={printApp} className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl text-xs transition-all">
                <Printer className="w-3.5 h-3.5"/> طباعة
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto text-sm">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['NIN', selected.nin],
                  ['تاريخ الميلاد', selected.birth_date],
                  ['الهاتف', selected.phone],
                  ['البريد', selected.email],
                  ['الشهادة', selected.degree],
                  ['التخصص', selected.specialty],
                  ['سنوات التدريس', selected.years_taught || '—'],
                  ['آخر 3 سنوات', selected.taught_last_3 ? 'نعم ✓' : 'لا'],
                  ['الأيام المفضلة', selected.preferred_days?.join('، ') || '—'],
                  ['الفترة', selected.preferred_period || '—'],
                ].map(([k,v]) => (
                  <div key={k} className="bg-gray-50 rounded-xl p-2">
                    <p className="text-xs text-gray-400">{k}</p>
                    <p className="font-medium text-gray-800 text-xs mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              {selected.preferred_modules_keys?.length > 0 && (
                <div className="bg-indigo-50 rounded-xl p-3">
                  <p className="text-xs text-indigo-500 font-medium mb-2">المقاييس التي يرغب في تدريسها</p>
                  <div className="flex flex-wrap gap-1">
                    {selected.preferred_modules_keys.map((k: string) => {
                      const parts = k.replace('lec_', '').replace('td_', '').split('_');
                      const type = k.startsWith('lec_') ? 'محاضرة' : 'أعمال موجهة';
                      const name = parts.slice(1).join('_');
                      return (
                        <span key={k} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${type === 'محاضرة' ? 'bg-blue-100 text-blue-700' : 'bg-teal-100 text-teal-700'}`}>
                          {name} — {type}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {selected.motivation && (
                <div className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs text-blue-500 font-medium mb-1">رسالة التقديم</p>
                  <p className="text-xs text-gray-700">{selected.motivation}</p>
                </div>
              )}

              {selected.degree_file_url && (
                <a href={selected.degree_file_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[#1a3a6b] text-xs hover:underline">
                  📎 عرض نسخة الشهادة
                </a>
              )}

              {selected.decided_by && (
                <p className="text-xs text-gray-400">القرار بواسطة: <strong>{selected.decided_by}</strong></p>
              )}

              {/* ملاحظة + قرار */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">ملاحظة (اختياري)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 resize-none" />
              </div>

              <div className="flex gap-2">
                <button onClick={() => decide('مقبول')} disabled={saving || selected.status==='مقبول'}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50">
                  <CheckCircle className="w-4 h-4"/> قبول
                </button>
                <button onClick={() => decide('مرفوض')} disabled={saving || selected.status==='مرفوض'}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-50">
                  <XCircle className="w-4 h-4"/> رفض
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center h-40">
            <p className="text-gray-400 text-sm">اختر طلباً للاطلاع على تفاصيله</p>
          </div>
        )}
      </div>
    </div>
  );
}
