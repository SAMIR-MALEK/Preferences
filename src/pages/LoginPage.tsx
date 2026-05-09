import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Eye, EyeOff, BookOpen, Lock, User, GraduationCap } from 'lucide-react';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    setLoading(true);
    setError('');
    const { error: err } = await signIn(username.trim(), password);
    if (err) setError(err);
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a1628] via-[#0d2040] to-[#162d4d] flex items-center justify-center p-4" dir="rtl">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-72 h-72 bg-[#c9a227]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 bg-[#1a3a6b]/30 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#c9a227]/3 rounded-full blur-3xl" />
        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'linear-gradient(rgba(201,162,39,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(201,162,39,0.3) 1px, transparent 1px)',
          backgroundSize: '50px 50px'
        }} />
      </div>

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        {/* Header Card */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-[#c9a227] to-[#a07820] mb-4 shadow-2xl shadow-[#c9a227]/30">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h1 className="font-display text-3xl font-bold text-white mb-1">
            منصة تسجيل الرغبات
          </h1>
          <p className="text-[#c9a227] font-medium text-sm">
            كلية الحقوق والعلوم السياسية
          </p>
          <p className="text-gray-400 text-sm mt-1">
            جامعة برج بوعريريج — الموسم الجامعي 2026/2027
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-2 mb-6">
            <Lock className="w-5 h-5 text-[#c9a227]" />
            <h2 className="text-white font-semibold text-lg">تسجيل الدخول</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div className="space-y-2">
              <label className="text-gray-300 text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4 text-[#c9a227]" />
                اسم المستخدم
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#c9a227]/50 focus:border-[#c9a227]/50 transition-all text-right font-arabic"
                autoComplete="username"
                dir="ltr"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-gray-300 text-sm font-medium flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#c9a227]" />
                كلمة المرور
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#c9a227]/50 focus:border-[#c9a227]/50 transition-all pr-12 font-arabic"
                  autoComplete="current-password"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/20 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm flex items-center gap-2 animate-slide-up">
                <span className="text-red-400">⚠</span>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#c9a227] to-[#a07820] hover:from-[#d4ad2c] hover:to-[#b08828] text-white font-bold py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-[#c9a227]/20 hover:shadow-[#c9a227]/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 font-display text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  جارٍ تسجيل الدخول...
                </span>
              ) : 'دخول'}
            </button>
          </form>

          {/* Info */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <div className="flex items-start gap-2 text-gray-400 text-xs">
              <BookOpen className="w-4 h-4 text-[#c9a227] mt-0.5 flex-shrink-0" />
              <p>
                بيانات الدخول تُسلَّم من طرف الإدارة. 
                للحصول على حسابك أو في حالة نسيان كلمة المرور، 
                يرجى التواصل مع <span className="text-[#c9a227]">نيابة العمادة المكلفة بالبيداغوجيا</span>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs mt-6 font-arabic">
          تحت إشراف نائب العميد د. عشاش حمزة
        </p>
      </div>
    </div>
  );
}
