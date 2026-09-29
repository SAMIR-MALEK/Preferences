import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const DEGREES = ['دكتوراه', 'شهادة تسجيل دكتوراه', 'ماجستير', 'ليسانس'];

export default function ApplyPage() {
  const [tab, setTab] = useState<'apply' | 'track'>('apply');
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ref: string } | null>(null);
  const [trackNin, setTrackNin] = useState('');
  const [trackRef, setTrackRef] = useState('');
  const [trackResult, setTrackResult] = useState<any>(null);
  const [trackError, setTrackError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [modules, setModules] = useState<any[]>([]);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    nin: '', last_name: '', first_name: '',
    last_name_fr: '', first_name_fr: '',
    birth_date: '', phone: '', email: '',
    degree: '', specialty: '',
    degree_file: null as File | null,
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function loadModules() {
    const { data } = await supabase.from('modules')
      .select('id, name_ar, level:levels(name_ar)')
      .eq('is_active', true).eq('semester', 1)
      .order('name_ar');
    if (data) setModules(data);
  }

  function toggleModule(id: string) {
    setSelectedModules(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (!form.nin || !form.last_name || !form.first_name || !form.phone || !form.email || !form.degree) {
      alert('يرجى إكمال جميع الحقول الإلزامية'); return;
    }
    setSubmitting(true);
    try {
      // رفع الشهادة
      let degreeUrl = '';
      if (form.degree_file) {
        const ext = form.degree_file.name.split('.').pop();
        const path = `vacataire/${Date.now()}.${ext}`;
        await supabase.storage.from('documents').upload(path, form.degree_file);
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        degreeUrl = urlData.publicUrl;
      }

      // توليد رقم الملف
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      const ref = `${year}-${rand}`;

      // حفظ الطلب
      const { error } = await supabase.from('vacataire_applications').insert({
        nin: form.nin,
        last_name: form.last_name,
        first_name: form.first_name,
        last_name_fr: form.last_name_fr,
        first_name_fr: form.first_name_fr,
        birth_date: form.birth_date,
        phone: form.phone,
        email: form.email,
        degree: form.degree,
        specialty: form.specialty,
        degree_file_url: degreeUrl,
        preferred_modules: Array.from(selectedModules),
        ref_number: ref,
        status: 'قيد الدراسة',
        academic_year: '2026-2027',
      });

      if (error) throw error;
      setResult({ ref });
    } catch (e: any) {
      alert('حدث خطأ: ' + e.message);
    }
    setSubmitting(false);
  }

  async function handleTrack() {
    setTrackError('');
    if (!trackNin || !trackRef) { setTrackError('يرجى إدخال NIN ورقم الملف'); return; }
    const { data } = await supabase.from('vacataire_applications')
      .select('ref_number, status, last_name, first_name, created_at, admin_note')
      .eq('nin', trackNin).eq('ref_number', trackRef).single();
    if (!data) { setTrackError('لم يُعثر على الطلب — تحقق من المعلومات'); return; }
    setTrackResult(data);
  }

  const statusColor = (s: string) =>
    s === 'مقبول' ? 'text-green-600 bg-green-50 border-green-200' :
    s === 'مرفوض' ? 'text-red-600 bg-red-50 border-red-200' :
    'text-amber-600 bg-amber-50 border-amber-200';

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1628] to-[#1a3a6b] flex items-start justify-center py-8 px-4" dir="rtl">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#c9a227] flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🎓</span>
          </div>
          <h1 className="text-white font-bold text-xl">الأساتذة المتعاقدون</h1>
          <p className="text-[#c9a227] text-sm mt-1">كلية الحقوق والعلوم السياسية — جامعة برج بوعريريج</p>
          <p className="text-gray-400 text-xs mt-0.5">الموسم الجامعي 2026/2027</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {[['apply','تقديم طلب'],['track','متابعة طلب']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id as any)}
                className={`flex-1 py-3.5 text-sm font-bold transition-all ${tab===id?'text-[#1a3a6b] border-b-2 border-[#1a3a6b]':'text-gray-400'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Apply Tab */}
            {tab === 'apply' && !result && (
              <div className="space-y-4">
                {step === 1 && (
                  <>
                    <h2 className="font-bold text-gray-800 text-base mb-4">المعلومات الشخصية</h2>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        ['nin','رقم التعريف الوطني (NIN)','text',2],
                        ['last_name','اللقب (عربي)','text',1],
                        ['first_name','الاسم (عربي)','text',1],
                        ['last_name_fr','Nom (français)','text',1],
                        ['first_name_fr','Prénom (français)','text',1],
                        ['birth_date','تاريخ الميلاد','date',1],
                        ['phone','رقم الهاتف','tel',1],
                        ['email','البريد الإلكتروني','email',1],
                        ['specialty','التخصص','text',2],
                      ].map(([k, label, type, cols]) => (
                        <div key={k as string} className={`col-span-${cols}`}>
                          <label className="text-xs text-gray-500 mb-1 block">{label as string}</label>
                          <input type={type as string} value={(form as any)[k as string]}
                            onChange={e => set(k as string, e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30"
                            dir={type === 'email' || type === 'tel' || type === 'date' ? 'ltr' : 'rtl'} />
                        </div>
                      ))}
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">آخر شهادة *</label>
                      <select value={form.degree} onChange={e => set('degree', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-white">
                        <option value="">— اختر —</option>
                        {DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">رفع نسخة الشهادة *</label>
                      <div onClick={() => fileRef.current?.click()}
                        className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-[#1a3a6b]/40 transition-all">
                        {form.degree_file
                          ? <p className="text-sm text-green-600 font-medium">✓ {form.degree_file.name}</p>
                          : <p className="text-sm text-gray-400">اضغط لرفع الملف (PDF أو صورة)</p>}
                      </div>
                      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                        onChange={e => set('degree_file', e.target.files?.[0] || null)} />
                    </div>

                    <button onClick={async () => { await loadModules(); setStep(2); }}
                      className="w-full bg-[#1a3a6b] text-white py-3 rounded-xl font-bold hover:bg-[#0d2040] transition-colors">
                      التالي — اختيار المقاييس
                    </button>
                  </>
                )}

                {step === 2 && (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <button onClick={() => setStep(1)} className="text-gray-400 hover:text-gray-600 text-sm">→ رجوع</button>
                      <h2 className="font-bold text-gray-800 text-base">المقاييس التي يمكنك تدريسها</h2>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">اختر المقاييس التي تستطيع تدريسها — ستُستخدم كمرجع عند الحاجة إليك</p>
                    <div className="max-h-72 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-3">
                      {modules.map(m => (
                        <label key={m.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input type="checkbox" checked={selectedModules.has(m.id)}
                            onChange={() => toggleModule(m.id)}
                            className="w-4 h-4 accent-[#1a3a6b]" />
                          <div>
                            <p className="text-sm text-gray-800">{m.name_ar}</p>
                            <p className="text-xs text-gray-400">{m.level?.name_ar}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{selectedModules.size} مقياس محدد</p>
                    <button onClick={handleSubmit} disabled={submitting}
                      className="w-full bg-[#c9a227] hover:bg-[#b8911f] text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-50 mt-2">
                      {submitting ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Success */}
            {tab === 'apply' && result && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">✓</span>
                </div>
                <h2 className="font-bold text-gray-800 text-lg mb-2">تم إرسال طلبك بنجاح</h2>
                <p className="text-gray-500 text-sm mb-6">سيتم دراسة طلبك والرد عليك في أقرب وقت</p>
                <div className="bg-[#1a3a6b] text-white rounded-2xl p-5 inline-block">
                  <p className="text-sm text-blue-200 mb-1">رقم ملفك</p>
                  <p className="font-bold text-2xl tracking-widest">{result.ref}</p>
                </div>
                <p className="text-xs text-gray-400 mt-4">احتفظ بهذا الرقم مع NIN الخاص بك لمتابعة طلبك</p>
              </div>
            )}

            {/* Track Tab */}
            {tab === 'track' && (
              <div className="space-y-4">
                <h2 className="font-bold text-gray-800 text-base">متابعة طلبك</h2>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">رقم التعريف الوطني (NIN)</label>
                  <input value={trackNin} onChange={e => setTrackNin(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">رقم الملف</label>
                  <input value={trackRef} onChange={e => setTrackRef(e.target.value)}
                    placeholder="مثال: 2026-4521"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
                </div>
                {trackError && <p className="text-red-500 text-sm">{trackError}</p>}
                <button onClick={handleTrack}
                  className="w-full bg-[#1a3a6b] text-white py-3 rounded-xl font-bold hover:bg-[#0d2040] transition-colors">
                  متابعة
                </button>
                {trackResult && (
                  <div className={`border rounded-2xl p-4 mt-4 ${statusColor(trackResult.status)}`}>
                    <p className="font-bold text-lg">{trackResult.last_name} {trackResult.first_name}</p>
                    <p className="text-sm mt-1">رقم الملف: <strong>{trackResult.ref_number}</strong></p>
                    <div className={`inline-block px-3 py-1 rounded-full text-sm font-bold mt-2 border ${statusColor(trackResult.status)}`}>
                      {trackResult.status}
                    </div>
                    {trackResult.admin_note && (
                      <p className="text-sm mt-3 opacity-80">{trackResult.admin_note}</p>
                    )}
                    <p className="text-xs opacity-60 mt-2">
                      تاريخ التقديم: {new Date(trackResult.created_at).toLocaleDateString('ar-DZ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-gray-500 text-xs mt-4">
          تحت إشراف نائب العميد د. عشاش حمزة
        </p>
      </div>
    </div>
  );
}
