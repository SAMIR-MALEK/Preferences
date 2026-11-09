import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { Shield, CheckCircle2, AlertCircle, Lock, Landmark, Building2, Printer, Check, X } from 'lucide-react';

const ACADEMIC_YEAR = '2026-2027';

const FACULTY_COUNCIL = 'المجلس التأديبي للكلية';
const DEPARTMENT_COUNCILS = [
  'المجلس التأديبي لقسم القانون العام',
  'المجلس التأديبي لقسم القانون الخاص',
];

const NAVY = '#0F2942';
const GOLD = '#c9a227';

type OptionState = 'registered' | 'selected' | 'idle' | 'blocked';

function fmtDate(d: string, long = true) {
  return new Date(d).toLocaleDateString('ar-DZ', {
    year: 'numeric', month: long ? 'long' : '2-digit', day: 'numeric',
  });
}

// ── خيار واحد (مجلس) ─────────────────────────────────────────────────
function CouncilOption({
  title, kind, state, onClick,
}: {
  title: string;
  kind: 'checkbox' | 'radio';
  state: OptionState;
  onClick?: () => void;
}) {
  const disabled = state === 'registered' || state === 'blocked';
  const selected = state === 'selected' || state === 'registered';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-right flex items-center gap-3 px-4 py-3.5 rounded-xl border transition-colors disabled:cursor-default"
      style={{
        borderColor: selected ? NAVY : '#E5E7EB',
        background: state === 'registered' ? '#F0FDF4' : selected ? '#F1F5F9' : state === 'blocked' ? '#F9FAFB' : '#fff',
        opacity: state === 'blocked' ? 0.55 : 1,
      }}>
      <span
        className={`w-5 h-5 flex-shrink-0 flex items-center justify-center border-2 ${kind === 'radio' ? 'rounded-full' : 'rounded'}`}
        style={{
          borderColor: state === 'registered' ? '#16A34A' : selected ? NAVY : '#CBD5E1',
          background: state === 'registered' ? '#16A34A' : selected ? NAVY : '#fff',
        }}>
        {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
      </span>
      <span className="flex-1 text-sm font-semibold" style={{ color: state === 'blocked' ? '#94A3B8' : '#1F2937' }}>
        {title}
      </span>
      {state === 'registered' && (
        <span className="text-[11px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">مسجّل</span>
      )}
      {state === 'blocked' && (
        <span className="text-[11px] text-gray-400">غير متاح — اخترتَ قسماً آخر</span>
      )}
    </button>
  );
}

// ── قسم مع عنوان ووصف ───────────────────────────────────────────────
function Section({ icon, title, hint, children }: any) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: NAVY }}>
          {icon}
        </div>
        <div>
          <h2 className="font-bold text-sm text-gray-800">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{hint}</p>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

export default function DisciplinaryNomination() {
  const { user } = useAuth();
  const [professor, setProfessor]     = useState<any>(null);
  const [nominations, setNominations] = useState<any[]>([]);
  const [facultyChecked, setFacultyChecked] = useState(false);
  const [deptSelected, setDeptSelected]     = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [submitting, setSubmitting]   = useState(false);
  const [confirming, setConfirming]   = useState(false);
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
  const hasFaculty = nominations.some(n => n.council === FACULTY_COUNCIL);
  const registeredDept = nominations.find(n => DEPARTMENT_COUNCILS.includes(n.council))?.council || null;
  const nothingLeft = hasFaculty && !!registeredDept;
  const canEdit = !deadlinePassed && !nothingLeft;

  const chosen: string[] = [
    ...(facultyChecked && !hasFaculty ? [FACULTY_COUNCIL] : []),
    ...(deptSelected && !registeredDept ? [deptSelected] : []),
  ];

  async function handleSubmit() {
    if (chosen.length === 0 || !professor) return;
    setSubmitting(true);
    setError(null);

    const { error: err } = await supabase
      .from('disciplinary_nominations')
      .insert(chosen.map(council => ({
        professor_id: professor.id, council, academic_year: ACADEMIC_YEAR,
      })));

    setConfirming(false);
    if (err) {
      if (err.message?.includes('DEPT_LIMIT')) setError('لا يمكن الترشح لأكثر من قسم واحد.');
      else if (err.code === '23505') setError('لقد قدّمت ترشحك مسبقاً لهذه الجهة.');
      else setError('حدث خطأ أثناء الحفظ، يرجى المحاولة مجدداً.');
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
        <div className="w-8 h-8 border-4 rounded-full animate-spin"
             style={{ borderColor: NAVY, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5" dir="rtl">

      {/* ── رأس الصفحة ── */}
      <div className="rounded-2xl px-6 py-5 text-white" style={{ background: NAVY }}>
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6" style={{ color: GOLD }} />
          <div>
            <h1 className="text-base font-bold">الترشح لعضوية المجالس التأديبية</h1>
            <p className="text-xs text-white/60 mt-0.5">السنة الجامعية {ACADEMIC_YEAR}</p>
          </div>
        </div>
        {deadline && (
          <div className={`mt-4 inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg ${
            deadlinePassed ? 'bg-red-500/30 text-red-100' : 'bg-white/10 text-white/90'}`}>
            <Lock className="w-3.5 h-3.5" />
            {deadlinePassed ? 'انتهى الموعد النهائي: ' : 'آخر أجل للترشح: '}
            {new Date(deadline).toLocaleDateString('ar-DZ', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </div>
        )}
      </div>

      {/* ── وصل الترشح (بعد التسجيل) ── */}
      {nominations.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-green-600 overflow-hidden">
          <div className="bg-green-600 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-white">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-bold text-sm">وصل تسجيل الترشح</span>
            </div>
            <button onClick={() => window.print()}
              className="print:hidden flex items-center gap-1.5 text-xs text-white/90 hover:text-white">
              <Printer className="w-4 h-4" /> طباعة
            </button>
          </div>
          <div className="px-5 py-4">
            <div className="flex flex-wrap justify-between gap-1 pb-3 mb-3 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-800">
                {professor?.last_name} {professor?.first_name}
              </p>
              <p className="text-xs text-gray-500">{professor?.rank}</p>
            </div>
            <div className="space-y-2.5">
              {nominations.map(n => (
                <div key={n.id ?? n.council} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-gray-800">{n.council}</span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{fmtDate(n.created_at)}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-4">
              الترشحات المسجّلة نهائية ولا يمكن التراجع عنها.
            </p>
          </div>
        </div>
      )}

      {/* ── انتهى الموعد ── */}
      {deadlinePassed && !nothingLeft && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-red-700 text-sm flex items-center gap-3">
          <Lock className="w-5 h-5 flex-shrink-0" />
          {nominations.length ? 'انتهى الموعد النهائي، ولم يعد بالإمكان إضافة ترشحات.' : 'انتهى الموعد النهائي للترشح.'}
        </div>
      )}

      {/* ── النموذج ── */}
      {canEdit && (
        <>
          {/* قواعد الترشح */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-sm font-bold text-amber-900 mb-2">قواعد الترشح</p>
            <ul className="text-xs text-amber-900/90 space-y-1.5 leading-relaxed list-disc pr-4">
              <li>يمكنك الترشح لمجلس <b>الكلية</b>، ولمجلس <b>قسم واحد</b> في الوقت نفسه.</li>
              <li>لا يمكنك الترشح لمجلسَي القسمين معاً.</li>
              <li>الترشح اختياري في كل مجلس، وبعد التأكيد لا يمكن التراجع عنه.</li>
            </ul>
          </div>

          <Section
            icon={<Landmark className="w-4.5 h-4.5 text-white" style={{ color: GOLD }} />}
            title="مجلس الكلية"
            hint="ترشح على مستوى الكلية.">
            <CouncilOption
              title={FACULTY_COUNCIL}
              kind="checkbox"
              state={hasFaculty ? 'registered' : facultyChecked ? 'selected' : 'idle'}
              onClick={() => setFacultyChecked(v => !v)}
            />
          </Section>

          <Section
            icon={<Building2 className="w-4.5 h-4.5" style={{ color: GOLD }} />}
            title="مجلس القسم"
            hint="اختر قسماً واحداً فقط. انقر مرة ثانية على الخيار المحدَّد لإلغائه.">
            {DEPARTMENT_COUNCILS.map(council => {
              let state: OptionState = 'idle';
              if (registeredDept) state = registeredDept === council ? 'registered' : 'blocked';
              else if (deptSelected === council) state = 'selected';
              return (
                <CouncilOption
                  key={council}
                  title={council}
                  kind="radio"
                  state={state}
                  onClick={() => setDeptSelected(deptSelected === council ? null : council)}
                />
              );
            })}
          </Section>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}

          {/* شريط التأكيد */}
          <div className="bg-white rounded-2xl border border-gray-200 px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {chosen.length === 0
                ? 'لم تحدد أي مجلس بعد.'
                : <>المحدَّد: <b className="text-gray-900">{chosen.length === 1 ? 'مجلس واحد' : 'مجلسان'}</b></>}
            </p>
            <button
              onClick={() => setConfirming(true)}
              disabled={chosen.length === 0}
              className="text-white px-6 py-2.5 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: NAVY }}>
              مراجعة وتأكيد الترشح
            </button>
          </div>
        </>
      )}

      {/* ── نافذة المراجعة ── */}
      {confirming && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-sm text-gray-800">تأكيد الترشح</h3>
              <button onClick={() => setConfirming(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-gray-500 mb-3">ستُسجَّل ترشحاتك للمجالس التالية:</p>
              <div className="space-y-2 mb-4">
                {chosen.map(c => (
                  <div key={c} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm font-semibold text-gray-800">
                    <Check className="w-4 h-4 text-green-600" strokeWidth={3} /> {c}
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-amber-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                بعد التأكيد لا يمكن التراجع عن الترشح أو تعديله.
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={() => setConfirming(false)} disabled={submitting}
                className="flex-1 border border-gray-300 text-gray-700 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50">
                رجوع
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className="flex-1 text-white py-2.5 rounded-xl text-sm font-bold disabled:opacity-60"
                style={{ background: NAVY }}>
                {submitting ? 'جاري الحفظ...' : 'تأكيد نهائي'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
