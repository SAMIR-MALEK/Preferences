import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { MOODLE_URL } from '../lib/moodle';
import { Copy, Check, Eye, EyeOff, ExternalLink, AlertCircle, ShieldAlert } from 'lucide-react';

interface Props {
  student: { mat_bac: string; annee_bac: number | null };
}

type Info = { status: string; username?: string; email?: string };

const MESSAGES: Record<string, string> = {
  not_validated: 'تسجيلك غير مكتمل. أتمّ التسجيل النهائي أولاً، ثم تظهر لك بياناتك هنا.',
  no_account: 'لم يُنشأ حسابك في موودل بعد. تواصل مع نيابة العمادة المكلفة بالبيداغوجيا.',
  limited: 'تعذّر الدخول مؤقتاً بسبب كثرة المحاولات. أعد المحاولة بعد بضع دقائق.',
  not_found: 'تعذّر التحقق من بياناتك. أعد تسجيل الدخول إلى فضاء الطالب.',
  error: 'حدث خطأ أثناء تحميل البيانات. أعد المحاولة لاحقاً.',
};

function copyText(text: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => resolve(true), () => resolve(fallback()));
        return;
      }
    } catch { /* نتابع بالبديل */ }
    resolve(fallback());
  });
  function fallback(): boolean {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  }
}

export default function StudentMoodle({ student }: Props) {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<Info | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState('');
  const [copied, setCopied] = useState('');
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_moodle_info', {
        p_bac: student.mat_bac, p_year: student.annee_bac,
      });
      if (!alive) return;
      setInfo(error || !data ? { status: 'error' } : (data as Info));
      setLoading(false);
    })();
    return () => { alive = false; if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [student.mat_bac, student.annee_bac]);

  async function reveal() {
    setRevealing(true);
    setRevealError('');
    const { data, error } = await supabase.rpc('reveal_moodle_password', {
      p_bac: student.mat_bac, p_year: student.annee_bac,
    });
    setRevealing(false);
    const res: any = data;
    if (error || !res || res.status !== 'ok') {
      setRevealError(MESSAGES[res?.status] || MESSAGES.error);
      return;
    }
    setPassword(res.password);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setPassword(null), 60000);   // تُخفى تلقائياً بعد دقيقة
  }

  function hide() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setPassword(null);
  }

  async function copy(text: string, key: string) {
    const ok = await copyText(text);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(''), 1500);
    }
  }

  if (loading) {
    return <p className="text-center text-gray-400 text-sm py-10">جارٍ التحميل...</p>;
  }

  if (!info || info.status !== 'ok') {
    const msg = MESSAGES[info?.status || 'error'] || MESSAGES.error;
    return (
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-sm leading-relaxed">
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <p>{msg}</p>
      </div>
    );
  }

  const row = 'flex items-center justify-between gap-3 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3';

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold text-gray-900 text-base">حسابي في موودل</h3>
        <p className="text-xs text-gray-500 mt-0.5">منصة التعليم عن بعد</p>
      </div>

      <div className="space-y-2.5">
        <div>
          <p className="text-xs text-gray-500 mb-1.5">اسم المستخدم</p>
          <div className={row}>
            <span className="font-mono text-sm text-gray-900 break-all" dir="ltr">{info.username}</span>
            <button onClick={() => copy(info.username || '', 'user')}
              className="flex items-center gap-1 text-xs font-medium text-[#1a3a6b] bg-white border border-gray-200 hover:bg-gray-100 rounded-lg px-2.5 py-1.5 flex-shrink-0">
              {copied === 'user' ? <><Check className="w-3.5 h-3.5 text-green-600" /> تم</> : <><Copy className="w-3.5 h-3.5" /> نسخ</>}
            </button>
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1.5">كلمة السر</p>
          <div className={row}>
            <span className="font-mono text-sm text-gray-900 break-all" dir="ltr">
              {password ?? '••••••••'}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {password ? (
                <>
                  <button onClick={() => copy(password, 'pwd')}
                    className="flex items-center gap-1 text-xs font-medium text-[#1a3a6b] bg-white border border-gray-200 hover:bg-gray-100 rounded-lg px-2.5 py-1.5">
                    {copied === 'pwd' ? <><Check className="w-3.5 h-3.5 text-green-600" /> تم</> : <><Copy className="w-3.5 h-3.5" /> نسخ</>}
                  </button>
                  <button onClick={hide}
                    className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg px-2.5 py-1.5">
                    <EyeOff className="w-3.5 h-3.5" /> إخفاء
                  </button>
                </>
              ) : (
                <button onClick={reveal} disabled={revealing}
                  className="flex items-center gap-1 text-xs font-medium text-white bg-[#1a3a6b] hover:bg-[#0a1628] rounded-lg px-3 py-1.5 disabled:opacity-50">
                  <Eye className="w-3.5 h-3.5" /> {revealing ? 'جارٍ...' : 'إظهار'}
                </button>
              )}
            </div>
          </div>
          {revealError && <p className="text-xs text-red-600 mt-1.5">{revealError}</p>}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 text-blue-900 rounded-xl p-4 text-sm leading-relaxed">
        للدخول إلى موودل استعمل اسم المستخدم وكلمة السر أعلاه. كلمة سر موودل <b>ثابتة ولا تتغير</b>.
      </div>

      <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm font-medium">
        <ShieldAlert className="w-4 h-4 flex-shrink-0" />
        لا تعطِ كلمة السر لأي شخص.
      </div>

      {MOODLE_URL && (
        <a href={MOODLE_URL} target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-[#1a3a6b] hover:bg-[#0a1628] text-white rounded-xl py-3 text-sm font-bold transition-colors">
          <ExternalLink className="w-4 h-4" /> الدخول إلى موودل
        </a>
      )}
    </div>
  );
}
