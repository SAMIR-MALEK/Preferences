import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Shield, CheckCircle, AlertCircle, Lock } from 'lucide-react';

const ACADEMIC_YEAR = '2026-2027';

const FACULTY_COUNCIL = 'المجلس التأديبي للكلية';
const DEPARTMENT_COUNCILS = [
  'المجلس التأديبي لقسم القانون العام',
  'المجلس التأديبي لقسم القانون الخاص',
];

const NAVY = '#0F2942';
const GOLD = '#B8913A';

export default function DisciplinaryNomination() {
  const { user } = useAuth();
  const [professor, setProfessor]     = useState<any>(null);
  const [nominations, setNominations] = useState<any[]>([]);
  const [facultyChecked, setFacultyChecked] = useState(false);
  const [deptSelected, setDeptSelected]     = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [deadline, setDeadline]       = useState<string | null>(null);

  useEffect(() => { if (user?.id) load(); }, [user?.id]);

  async function load() {
    setLoading(true);

    const { data: prof } = await supabase
      .from('professors')
      .select('id, last_name, first_name, rank')
      .eq('user_id', user?.id)
      .maybeSingle();
    setProfessor(prof);

    if (prof?.id) {
      const { data: noms } = await supabase
        .from('disciplinary_nominations')
        .select('*')
        .eq('professor_id', prof.id)
        .eq('academic_year', ACADEMIC_YEAR)
        .order('created_at', { ascending: true });
      setNominations(noms || []);
    }

    const { data: settings } = await supabase
      .from('academic_settings')
      .select('disciplinary_deadline')
      .eq('academic_year', ACADEMIC_YEAR)
      .maybeSingle();
    setDeadline(settings?.disciplinary_deadline || null);

    setLoading(false);
  }

  const deadlinePassed = deadline ? new Date() > new Date(deadline) : false;

  // ما تم الترشح إليه سابقاً
  const hasFaculty = nominations.some(n => n.council === FACULTY_COUNCIL);
  const hasDepartment = nominations.some(n => DEPARTMENT_COUNCILS.includes(n.council));
  const nothingLeft = hasFaculty && hasDepartment;

  const chosen: string[] = [
    ...(facultyChecked && !hasFaculty ? [FACULTY_COUNCIL] : []),
    ...(deptSelected && !hasDepartment ? [deptSelected] : []),
  ];

  async function handleSubmit() {
    if (chosen.length === 0 || !professor) return;
    setSubmitting(true);
    setError(null);

    const { error: err } = await supabase
      .from('disciplinary_nominations')
      .insert(
        chosen.map(council => ({
          professor_id: professor.id,
          council,
          academic_year: ACADEMIC_YEAR,
        }))
      );

    if (err) {
      if (err.message?.includes('DEPT_LIMIT')) {
        setError('لا يمكن الترشح لأكثر من قسم واحد.');
      } else if (err.code === '23505') {
        setError('لقد قدّمت ترشحك مسبقاً لهذه الجهة.');
      } else {
        setError('حدث خطأ أثناء الحفظ، يرجى المحاولة مجدداً.');
      }
      setSubmitting(false);
      return;
    }

    setFacultyChecked(false);
    setDeptSelected(null);
    await load();
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]" dir="rtl">
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
             style={{ borderColor: NAVY, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-8" dir="rtl">

      {/* ── هيدر ── */}
      <div className="rounded-2xl px-6 py-5 mb-6 text-white" style={{ background: NAVY }}>
        <div className="flex items-center gap-3 mb-1">
          <Shield className="w-5 h-5" style={{ color: GOLD }} />
          <h1 className="text-base font-bold">الترشح لعضوية المجلس التأديبي</h1>
        </div>
        <p className="text-xs text-gray-300">السنة الجامعية {ACADEMIC_YEAR}</p>
        {deadline && (
          <div className={`mt-3 text-xs font-semibold px-3 py-1.5 rounded-lg inline-flex items-center gap-2 ${
            deadlinePassed ? 'bg-red-500/30 text-red-200' : 'bg-white/10 text-gray-200'
          }`}>
            <Lock className="w-3 h-3" />
            الموعد النهائي: {new Date(deadline).toLocaleDateString('ar-DZ', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            })}
          </div>
        )}
      </div>

      {/* ── ترشحاتك المسجلة ── */}
      {nominations.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl overflow-hidden mb-6">
          <div className="bg-green-600 px-5 py-3 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-white" />
            <span className="text-white font-bold text-sm">
              {nominations.length === 1 ? 'تم تسجيل ترشحك' : 'تم تسجيل ترشحاتك'}
            </span>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            {nominations.map(n => (
              <div key={n.id ?? n.council} className="border-b border-green-100 last:border-0 pb-3 last:pb-0">
                <p className="text-gray-800 font-bold text-sm">{n.council}</p>
                <p className="text-xs text-gray-400 mt-1">
                  بتاريخ: {new Date(n.created_at).toLocaleDateString('ar-DZ', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </p>
              </div>
            ))}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-700 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              لا يمكن التراجع عن الترشح بعد تأكيده.
            </div>
          </div>
        </div>
      )}

      {/* ── منتهي الموعد ── */}
      {deadlinePassed && !nothingLeft && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-700 text-sm flex items-center gap-3">
          <Lock className="w-5 h-5 flex-shrink-0" />
          انتهى الموعد النهائي للترشح.
        </div>
      )}

      {/* ── نموذج الترشح ── */}
      {!nothingLeft && !deadlinePassed && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-800 text-sm">
              {nominations.length ? 'يمكنك إضافة ترشح آخر' : 'اختر المجلس الذي تودّ الترشح إليه'}
            </h2>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              يمكنك الترشح للمجلس التأديبي للكلية، ولمجلس قسم واحد فقط. لا يمكن الترشح لمجلسَي القسمين معاً.
            </p>
          </div>

          <div className="px-5 py-4 flex flex-col gap-5">

            {/* الكلية — اختيار مستقل (مربع) */}
            {!hasFaculty && (
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">مجلس الكلية</p>
                <button
                  type="button"
                  onClick={() => setFacultyChecked(v => !v)}
                  className="w-full text-right px-4 py-4 rounded-xl border-2 transition-all text-sm font-medium"
                  style={facultyChecked
                    ? { borderColor: NAVY, background: '#EEF2F6', color: NAVY }
                    : { borderColor: '#E5E7EB', background: '#F9FAFB', color: '#374151' }}>
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center"
                         style={facultyChecked ? { borderColor: NAVY, background: NAVY } : { borderColor: '#D1D5DB' }}>
                      {facultyChecked && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </div>
                    {FACULTY_COUNCIL}
                  </div>
                </button>
              </div>
            )}

            {/* الأقسام — اختيار واحد فقط (دائرة) */}
            {!hasDepartment && (
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">مجلس القسم (قسم واحد فقط)</p>
                <div className="flex flex-col gap-3">
                  {DEPARTMENT_COUNCILS.map(council => {
                    const on = deptSelected === council;
                    return (
                      <button
                        key={council}
                        type="button"
                        onClick={() => setDeptSelected(on ? null : council)}
                        className="w-full text-right px-4 py-4 rounded-xl border-2 transition-all text-sm font-medium"
                        style={on
                          ? { borderColor: NAVY, background: '#EEF2F6', color: NAVY }
                          : { borderColor: '#E5E7EB', background: '#F9FAFB', color: '#374151' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center"
                               style={on ? { borderColor: NAVY, background: NAVY } : { borderColor: '#D1D5DB' }}>
                            {on && <div className="w-2 h-2 rounded-full bg-white" />}
                          </div>
                          {council}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mx-5 mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="px-5 pb-5">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-700 text-xs flex items-start gap-2 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              تنبيه: بعد تأكيد الترشح لا يمكن التراجع عنه أو تعديله.
            </div>
            <button
              onClick={handleSubmit}
              disabled={chosen.length === 0 || submitting}
              className="w-full text-white py-3 rounded-xl font-bold text-sm transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: NAVY }}>
              {submitting ? 'جاري الحفظ...' : 'تأكيد الترشح'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
