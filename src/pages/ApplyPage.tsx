import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DEGREES = ['دكتوراه', 'شهادة تسجيل دكتوراه', 'ماجيستير'];
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];

function validate(form: any): string[] {
  const errors: string[] = [];
  if (!form.nin || form.nin.length !== 18 || !/^\d{18}$/.test(form.nin))
    errors.push('رقم التعريف الوطني يجب أن يكون 18 رقماً');
  if (!form.last_name) errors.push('اللقب (عربي) إلزامي');
  if (!form.first_name) errors.push('الاسم (عربي) إلزامي');
  if (!form.last_name_fr) errors.push('اللقب (français) إلزامي');
  if (!form.first_name_fr) errors.push('الاسم (français) إلزامي');
  if (!form.birth_date) errors.push('تاريخ الميلاد إلزامي');
  if (!form.phone || !/^(05|06|07)\d{8}$/.test(form.phone))
    errors.push('رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 05 أو 06 أو 07');
  if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
    errors.push('البريد الإلكتروني غير صالح');
  if (!form.degree) errors.push('آخر شهادة إلزامية');
  if (!form.degree_file) errors.push('رفع نسخة الشهادة إلزامي');
  if (!form.specialty) errors.push('التخصص إلزامي');
  return errors;
}

export default function ApplyPage() {
  const [tab, setTab] = useState<'apply' | 'track'>('apply');
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ref: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [modules, setModules] = useState<any[]>([]);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [trackNin, setTrackNin] = useState('');
  const [trackRef, setTrackRef] = useState('');
  const [trackResult, setTrackResult] = useState<any>(null);
  const [trackError, setTrackError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    nin: '', last_name: '', first_name: '',
    last_name_fr: '', first_name_fr: '',
    birth_date: '', phone: '', email: '',
    degree: '', specialty: '',
    degree_file: null as File | null,
    years_taught: '',
    taught_last_3: '',
    available_days: [] as string[],
    available_period: '',
    motivation: '',
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  function toggleDay(day: string) {
    set('available_days',
      form.available_days.includes(day)
        ? form.available_days.filter(d => d !== day)
        : [...form.available_days, day]
    );
  }

  async function loadModules() {
    const { data: asgn } = await supabase.from('assignments')
      .select('id, module_id, teaching_type, section_number, group_number, module:modules(name_ar, level:levels(name_ar))')
      .eq('academic_year', '2026-2027').eq('semester', 1).is('professor_id', null);
    if (asgn) setModules(asgn);
  }

  function toggleModule(id: string) {
    setSelectedModules(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function goToStep2() {
    const errs = validate(form);
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    loadModules();
    setStep(2);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      let degreeUrl = '';
      if (form.degree_file) {
        const ext = form.degree_file.name.split('.').pop();
        const path = `vacataire/${Date.now()}.${ext}`;
        await supabase.storage.from('documents').upload(path, form.degree_file);
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);
        degreeUrl = urlData.publicUrl;
      }
      const year = new Date().getFullYear();
      const rand = Math.floor(1000 + Math.random() * 9000);
      const ref = `${year}-${rand}`;
      const { error } = await supabase.from('vacataire_applications').insert({
        nin: form.nin, last_name: form.last_name, first_name: form.first_name,
        last_name_fr: form.last_name_fr, first_name_fr: form.first_name_fr,
        birth_date: form.birth_date, phone: form.phone, email: form.email,
        degree: form.degree, specialty: form.specialty,
        degree_file_url: degreeUrl,
        years_taught: form.years_taught ? parseInt(form.years_taught) : null,
        taught_last_3: form.taught_last_3 === 'نعم',
        available_days: form.available_days,
        available_period: form.available_period,
        motivation: form.motivation,
        preferred_assignments: Array.from(selectedModules),
        ref_number: ref, status: 'قيد الدراسة', academic_year: '2026-2027',
      });
      if (error) throw error;
      setResult({ ref });
    } catch (e: any) { alert('حدث خطأ: ' + e.message); }
    setSubmitting(false);
  }

  async function handleTrack() {
    setTrackError(''); setTrackResult(null);
    if (!trackNin || !trackRef) { setTrackError('يرجى إدخال NIN ورقم الملف'); return; }
    const { data } = await supabase.from('vacataire_applications')
      .select('ref_number, status, last_name, first_name, created_at, admin_note')
      .eq('nin', trackNin).eq('ref_number', trackRef).single();
    if (!data) { setTrackError('لم يُعثر على الطلب — تحقق من المعلومات'); return; }
    setTrackResult(data);
  }

  const statusColor = (s: string) =>
    s === 'مقبول' ? 'bg-green-50 border-green-200 text-green-700' :
    s === 'مرفوض' ? 'bg-red-50 border-red-200 text-red-700' :
    'bg-amber-50 border-amber-200 text-amber-700';

  // تجميع المقاييس حسب المستوى
  const grouped = modules.reduce((acc: any, a: any) => {
    const level = a.module?.level?.name_ar || '—';
    if (!acc[level]) acc[level] = { lec: [], td: [] };
    if (a.teaching_type === 'محاضرة') acc[level].lec.push(a);
    else acc[level].td.push(a);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1628] to-[#1a3a6b] flex items-start justify-center py-8 px-4" dir="rtl">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#c9a227] flex items-center justify-center mx-auto mb-3">
            <span className="text-2xl">🎓</span>
          </div>
          <h1 className="text-white font-bold text-xl">الأساتذة المؤقتون</h1>
          <p className="text-[#c9a227] text-sm mt-1">كلية الحقوق والعلوم السياسية — جامعة محمد البشير الإبراهيمي، برج بوعريريج</p>
          <p className="text-gray-400 text-xs mt-0.5">الموسم الجامعي 2026/2027</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            {([['apply','تقديم طلب'],['track','متابعة طلب']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`flex-1 py-3.5 text-sm font-bold transition-all ${tab===id?'text-[#1a3a6b] border-b-2 border-[#1a3a6b]':'text-gray-400'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {/* Apply Step 1 */}
            {tab === 'apply' && !result && step === 1 && (
              <div className="space-y-4">
                <h2 className="font-bold text-gray-800 text-base">المعلومات الشخصية</h2>

                {errors.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                    {errors.map((e, i) => <p key={i} className="text-red-600 text-xs">• {e}</p>)}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {/* NIN */}
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">رقم التعريف الوطني (NIN) — 18 رقم *</label>
                    <input value={form.nin} onChange={e => set('nin', e.target.value.replace(/\D/g,'').slice(0,18))}
                      maxLength={18} dir="ltr" placeholder="000000000000000000"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 tracking-widest" />
                    <p className="text-xs text-gray-400 mt-0.5">{form.nin.length}/18</p>
                  </div>
                  {[
                    ['last_name','اللقب (عربي)','text'],
                    ['first_name','الاسم (عربي)','text'],
                    ['last_name_fr','Nom (français)','text'],
                    ['first_name_fr','Prénom (français)','text'],
                  ].map(([k,label,type]) => (
                    <div key={k}>
                      <label className="text-xs text-gray-500 mb-1 block">{label} *</label>
                      <input type={type} value={(form as any)[k]} onChange={e => set(k, e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">تاريخ الميلاد *</label>
                    <input type="date" value={form.birth_date} onChange={e => set('birth_date', e.target.value)} dir="ltr"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">رقم الهاتف *</label>
                    <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value.replace(/\D/,'').slice(0,10))}
                      dir="ltr" placeholder="0X XX XX XX XX" maxLength={10}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">البريد الإلكتروني *</label>
                    <input type="email" value={form.email} onChange={e => set('email', e.target.value)} dir="ltr"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 mb-1 block">التخصص *</label>
                    <input value={form.specialty} onChange={e => set('specialty', e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                  </div>
                </div>

                {/* Degree */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">آخر شهادة *</label>
                  <select value={form.degree} onChange={e => set('degree', e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-white">
                    <option value="">— اختر —</option>
                    {DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>

                {/* Degree file */}
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

                {/* Teaching history */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-gray-600">سنوات التدريس السابقة في الكلية</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">عدد السنوات</label>
                      <input type="number" min="0" max="20" value={form.years_taught}
                        onChange={e => set('years_taught', e.target.value)} dir="ltr"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">هل تشمل آخر 3 سنوات؟</label>
                      <select value={form.taught_last_3} onChange={e => set('taught_last_3', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-white">
                        <option value="">—</option>
                        <option value="نعم">نعم</option>
                        <option value="لا">لا</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Availability */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-gray-600">التوفر الأسبوعي</p>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">الأيام المتاحة</p>
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map(d => (
                        <button key={d} type="button" onClick={() => toggleDay(d)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                            form.available_days.includes(d)
                              ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]'
                              : 'bg-white text-gray-500 border-gray-200'}`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">الفترة</p>
                    <div className="flex gap-2">
                      {['صباح', 'مساء', 'صباح ومساء'].map(p => (
                        <button key={p} type="button" onClick={() => set('available_period', p)}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                            form.available_period === p
                              ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]'
                              : 'bg-white text-gray-500 border-gray-200'}`}>
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Motivation */}
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">رسالة تقديم (اختياري)</label>
                  <textarea value={form.motivation} onChange={e => set('motivation', e.target.value)}
                    rows={3} placeholder="يمكنك هنا ذكر أي معلومات إضافية تراها مفيدة..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 resize-none" />
                </div>

                <button onClick={goToStep2}
                  className="w-full bg-[#1a3a6b] text-white py-3 rounded-xl font-bold hover:bg-[#0d2040] transition-colors">
                  التالي — اختيار المقاييس ←
                </button>
              </div>
            )}

            {/* Apply Step 2 */}
            {tab === 'apply' && !result && step === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <button onClick={() => setStep(1)} className="text-gray-400 hover:text-gray-600 text-sm">→ رجوع</button>
                  <h2 className="font-bold text-gray-800 text-base">المقاييس التي يمكنك تدريسها</h2>
                </div>
                <p className="text-xs text-gray-400">حدد المقاييس التي تستطيع تدريسها من القائمة أدناه (الشاغرة فقط)</p>

                <div className="max-h-96 overflow-y-auto space-y-4 border border-gray-100 rounded-xl p-3">
                  {Object.entries(grouped).map(([level, { lec, td }]: any) => (
                    <div key={level}>
                      <p className="font-bold text-[#1a3a6b] text-sm mb-2 sticky top-0 bg-white py-1">{level}</p>
                      {lec.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs text-blue-500 font-medium mb-1 mr-2">محاضرات</p>
                          {lec.map((a: any) => (
                            <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-50/50 cursor-pointer">
                              <input type="checkbox" checked={selectedModules.has(a.id)}
                                onChange={() => toggleModule(a.id)} className="w-4 h-4 accent-[#1a3a6b]" />
                              <span className="text-sm text-gray-800">{a.module?.name_ar} — م{a.section_number}</span>
                            </label>
                          ))}
                        </div>
                      )}
                      {td.length > 0 && (
                        <div>
                          <p className="text-xs text-teal-500 font-medium mb-1 mr-2">أعمال موجهة</p>
                          {td.map((a: any) => (
                            <label key={a.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-teal-50/50 cursor-pointer">
                              <input type="checkbox" checked={selectedModules.has(a.id)}
                                onChange={() => toggleModule(a.id)} className="w-4 h-4 accent-teal-600" />
                              <span className="text-sm text-gray-800">{a.module?.name_ar} — م{a.section_number} ف{a.group_number}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {modules.length === 0 && (
                    <p className="text-center text-gray-400 text-sm py-6">لا توجد مقاييس شاغرة حالياً</p>
                  )}
                </div>

                <p className="text-xs text-gray-400">{selectedModules.size} مقياس محدد</p>

                <button onClick={handleSubmit} disabled={submitting}
                  className="w-full bg-[#c9a227] hover:bg-[#b8911f] text-white py-3 rounded-xl font-bold transition-colors disabled:opacity-50">
                  {submitting ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
                </button>
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
                    dir="ltr" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">رقم الملف</label>
                  <input value={trackRef} onChange={e => setTrackRef(e.target.value)}
                    placeholder="مثال: 2026-4521" dir="ltr"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                </div>
                {trackError && <p className="text-red-500 text-sm">{trackError}</p>}
                <button onClick={handleTrack}
                  className="w-full bg-[#1a3a6b] text-white py-3 rounded-xl font-bold hover:bg-[#0d2040] transition-colors">
                  متابعة
                </button>
                {trackResult && (
                  <div className={`border rounded-2xl p-4 ${statusColor(trackResult.status)}`}>
                    <p className="font-bold text-lg">{trackResult.last_name} {trackResult.first_name}</p>
                    <p className="text-sm mt-1">رقم الملف: <strong>{trackResult.ref_number}</strong></p>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-bold mt-2 border ${statusColor(trackResult.status)}`}>
                      {trackResult.status}
                    </span>
                    {trackResult.admin_note && <p className="text-sm mt-3 opacity-80">{trackResult.admin_note}</p>}
                    <p className="text-xs opacity-60 mt-2">تاريخ التقديم: {new Date(trackResult.created_at).toLocaleDateString('ar-DZ')}</p>
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
