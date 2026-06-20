import { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { PROFESSOR_RANKS, HIGHEST_DEGREES, type ProfessorRank } from '../../types';
import { Save, CheckCircle, AlertCircle, User, Award, BookOpen, GraduationCap, Lock, Eye, EyeOff, ShieldAlert } from 'lucide-react';

interface Props {
  forceComplete?: boolean; // إن كانت true، يُفرض إكمال كل الحقول قبل الحفظ
  onSaved?: () => void;
}

function Field({ label, icon: Icon, children }: any) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <Icon className="w-4 h-4 text-[#1a3a6b]" />
        {label}
      </label>
      {children}
    </div>
  );
}

export default function ProfessorProfilePage({ forceComplete = false, onSaved }: Props) {
  const { user } = useAuth();
  const prof = user?.professor;

  const [form, setForm] = useState({
    rank: prof?.rank || 'أستاذ مساعد - أ',
    professional_experience: prof?.professional_experience || 0,
    highest_degree: prof?.highest_degree || 'دكتوراه',
    degree_speciality: prof?.degree_speciality || '',
    degree_title: prof?.degree_title || '',
    email: prof?.email || '',
    phone: prof?.phone || '',
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // تغيير كلمة المرور
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState('');
  const [showPw, setShowPw] = useState({ current: false, newPw: false, confirm: false });

  function getMissingFields(): string[] {
    const missing: string[] = [];
    if (!form.degree_speciality.trim()) missing.push('تخصص الشهادة');
    if (!form.degree_title.trim()) missing.push('عنوان الشهادة');
    if (!form.email.trim()) missing.push('البريد الإلكتروني');
    if (!form.phone.trim()) missing.push('رقم الهاتف');
    return missing;
  }

  async function handleSave() {
    setError('');

    if (forceComplete) {
      const missing = getMissingFields();
      if (missing.length > 0) {
        setError(`يرجى إكمال الحقول الإلزامية أولاً: ${missing.join('، ')}`);
        return;
      }
    }

    setSaving(true);
    const { error: err } = await supabase
      .from('professors')
      .update(form)
      .eq('id', prof?.id);

    if (err) {
      setError('حدث خطأ أثناء الحفظ. يرجى المحاولة مجدداً.');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      onSaved?.();
    }
    setSaving(false);
  }

  async function handlePasswordChange() {
    setPwError('');
    if (!pwForm.current) { setPwError('أدخل كلمة المرور الحالية'); return; }
    if (pwForm.newPw.length < 4) { setPwError('كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل'); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('كلمة المرور الجديدة وتأكيدها غير متطابقتين'); return; }

    setPwSaving(true);
    // التحقق من كلمة المرور الحالية بمحاولة تسجيل دخول
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email || '';
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: pwForm.current });
    if (signInErr) {
      setPwError('كلمة المرور الحالية غير صحيحة');
      setPwSaving(false);
      return;
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: pwForm.newPw });
    if (updateErr) {
      setPwError('حدث خطأ أثناء تغيير كلمة المرور');
    } else {
      setPwSaved(true);
      setPwForm({ current: '', newPw: '', confirm: '' });
      setTimeout(() => setPwSaved(false), 4000);
    }
    setPwSaving(false);
  }

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {forceComplete && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-amber-800 font-display mb-1">يجب إكمال معلوماتك الشخصية أولاً</h3>
            <p className="text-amber-700 text-sm">لا يمكنك تسجيل رغباتك البيداغوجية قبل إكمال كل الحقول أدناه وحفظها. هذه خطوة إلزامية تظهر مرة واحدة عند كل تسجيل دخول إلى أن تكتمل بياناتك.</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">المعلومات الشخصية</h2>
          <p className="text-gray-500 text-sm">بعض المعلومات يمكنك تعديلها — البيانات المحددة من الإدارة تظهر للمراجعة فقط</p>
        </div>
      </div>

      {/* Fixed Info Card */}
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white">
        <p className="text-[#c9a227] text-xs font-medium mb-3 flex items-center gap-1.5">
          <User className="w-3.5 h-3.5" />
          البيانات الثابتة (من الإدارة)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400 text-xs mb-0.5">اللقب</p>
            <p className="text-white font-semibold">{prof?.last_name}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-0.5">الاسم</p>
            <p className="text-white font-semibold">{prof?.first_name}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-0.5">اسم المستخدم</p>
            <p className="text-[#c9a227] font-mono text-sm">{prof?.username}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs mb-0.5">حالة الرغبات</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              prof?.wishes_locked_s1 
                ? 'bg-red-500/20 text-red-300' 
                : 'bg-green-500/20 text-green-300'
            }`}>
              {prof?.wishes_locked_s1 ? '🔒 مغلقة' : '✅ مفتوحة'}
            </span>
          </div>
        </div>
      </div>

      {/* Editable Form */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2 font-display">
          <span className="w-5 h-5 rounded bg-[#c9a227]/20 flex items-center justify-center text-[#c9a227] text-xs">✎</span>
          البيانات القابلة للتعديل
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="الرتبة العلمية" icon={Award}>
            <select
              value={form.rank}
              onChange={e => setForm({ ...form, rank: e.target.value as ProfessorRank })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50 text-gray-800"
            >
              {PROFESSOR_RANKS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>

          <Field label="الخبرة المهنية (بالسنوات)" icon={Award}>
            <input
              type="number"
              min="0"
              max="50"
              value={form.professional_experience}
              onChange={e => setForm({ ...form, professional_experience: parseInt(e.target.value) || 0 })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50"
              dir="ltr"
            />
          </Field>

          <Field label="آخر شهادة علمية" icon={GraduationCap}>
            <select
              value={form.highest_degree}
              onChange={e => setForm({ ...form, highest_degree: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50"
            >
              {HIGHEST_DEGREES.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>

          <Field label={`تخصص الشهادة ${forceComplete ? '*' : ''}`} icon={BookOpen}>
            <input
              type="text"
              value={form.degree_speciality}
              onChange={e => setForm({ ...form, degree_speciality: e.target.value })}
              placeholder="مثال: قانون جنائي، قانون خاص..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50"
            />
          </Field>
        </div>

        <Field label={`عنوان الشهادة (الدكتوراه / الماجيستير) ${forceComplete ? '*' : ''}`} icon={BookOpen}>
          <textarea
            value={form.degree_title}
            onChange={e => setForm({ ...form, degree_title: e.target.value })}
            placeholder="أدخل عنوان أطروحة الدكتوراه أو الماجيستير..."
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50 resize-none leading-relaxed"
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label={`البريد الإلكتروني ${forceComplete ? '*' : '(اختياري)'}`} icon={User}>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="example@univ-bbm.dz"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50"
              dir="ltr"
            />
          </Field>

          <Field label={`رقم الهاتف ${forceComplete ? '*' : '(اختياري)'}`} icon={User}>
            <input
              type="tel"
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              placeholder="05XXXXXXXX"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50"
              dir="ltr"
            />
          </Field>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        {saved && (
          <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 rounded-xl px-4 py-3">
            <CheckCircle className="w-4 h-4" />
            تم حفظ المعلومات بنجاح
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0d2040] text-white font-medium px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50 text-sm"
        >
          <Save className="w-4 h-4" />
          {saving ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
        </button>
      </div>
      {/* Password Change Section */}
      {!forceComplete && (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-5">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2 font-display">
          <span className="w-5 h-5 rounded bg-[#1a3a6b]/10 flex items-center justify-center">
            <Lock className="w-3 h-3 text-[#1a3a6b]" />
          </span>
          تغيير كلمة المرور
        </h3>
        <p className="text-gray-400 text-xs">يمكنك الاحتفاظ بكلمة المرور التي أعطتك إياها الإدارة، أو تغييرها حسب رغبتك.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { key: 'current', label: 'كلمة المرور الحالية' },
            { key: 'newPw',   label: 'كلمة المرور الجديدة' },
            { key: 'confirm', label: 'تأكيد كلمة المرور الجديدة' },
          ].map(({ key, label }) => (
            <div key={key} className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">{label}</label>
              <div className="relative">
                <input
                  type={showPw[key as keyof typeof showPw] ? 'text' : 'password'}
                  value={pwForm[key as keyof typeof pwForm]}
                  onChange={e => setPwForm({ ...pwForm, [key]: e.target.value })}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50 pl-10"
                  dir="ltr"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  {showPw[key as keyof typeof showPw]
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        {pwError && (
          <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">
            <AlertCircle className="w-4 h-4" /> {pwError}
          </div>
        )}
        {pwSaved && (
          <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 rounded-xl px-4 py-3">
            <CheckCircle className="w-4 h-4" /> تم تغيير كلمة المرور بنجاح
          </div>
        )}

        <button
          onClick={handlePasswordChange}
          disabled={pwSaving || !pwForm.current || !pwForm.newPw || !pwForm.confirm}
          className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0d2040] text-white font-medium px-6 py-2.5 rounded-xl transition-colors disabled:opacity-40 text-sm">
          <Lock className="w-4 h-4" />
          {pwSaving ? 'جارٍ التغيير...' : 'تغيير كلمة المرور'}
        </button>
      </div>
      )}
    </div>
  );
}
