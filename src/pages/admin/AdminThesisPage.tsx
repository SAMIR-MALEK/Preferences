import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  ScrollText, Save, CheckCircle, Lock, Unlock,
  ChevronDown, ChevronUp, User, AlertCircle, X
} from 'lucide-react';

const ACADEMIC_YEAR = '2026-2027';

// ─── Badge الحالة ────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; border: string }> = {
    'مقترح':  { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    'مُرسَل': { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
    'مقبول':  { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    'مرفوض':  { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  };
  const s = map[status] ?? { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  );
}

// ─── Modal تأكيد ─────────────────────────────────────────────────────
function ConfirmModal({ message, onConfirm, onCancel }: {
  message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm mb-1">تأكيد العملية</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{message}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={onConfirm}
            className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors">
            تأكيد
          </button>
          <button onClick={onCancel}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium transition-colors">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminThesisPage() {
  const { user } = useAuth();

  // نجلب قسم رئيس القسم من professor_roles
  const [department, setDepartment] = useState<string | null>(null);
  const [specs, setSpecs]           = useState<any[]>([]);
  const [proposals, setProposals]   = useState<any[]>([]);
  const [deadline, setDeadline]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState<string | null>(null);
  const [saved, setSaved]           = useState<string | null>(null);
  const [expandedSpec, setExpandedSpec] = useState<string | null>(null);
  const [confirm, setConfirm]       = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [allProfessors, setAllProfessors] = useState<any[]>([]);
  const [showNotSent, setShowNotSent] = useState(false);
  const [showSent, setShowSent]       = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    // ① الموعد النهائي
    const { data: settingsData } = await supabase
      .from('academic_settings')
      .select('thesis_deadline')
      .eq('academic_year', ACADEMIC_YEAR)
      .single();
    setDeadline(settingsData?.thesis_deadline || null);

    // ② قسم رئيس القسم — من professor_roles ثم نطابق مع levels
    // أولاً نحاول admin.department إذا كان موجوداً
    let dept: string | null = (user as any)?.admin?.department ?? null;

    if (!dept) {
      // نجلب professor_id من جدول professors بـ user_id
      const { data: profRow } = await supabase
        .from('professors')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (profRow?.id) {
        const { data: roleRow } = await supabase
          .from('professor_roles')
          .select('speciality')
          .eq('professor_id', profRow.id)
          .eq('role', 'dept_head')
          .maybeSingle();

        if (roleRow?.speciality) {
          // speciality هنا قد يكون UUID لـ level أو 'عام'/'خاص'
          if (roleRow.speciality === 'عام' || roleRow.speciality === 'خاص') {
            dept = roleRow.speciality;
          } else {
            // UUID — نجلب department من levels
            const { data: lvl } = await supabase
              .from('levels')
              .select('department')
              .eq('id', roleRow.speciality)
              .maybeSingle();
            dept = lvl?.department ?? null;
          }
        }
      }
    }

    setDepartment(dept);

    // ③ تخصصات ماستر 2 للقسم
    let query = supabase
      .from('levels')
      .select('id, name_ar, thesis_min, thesis_max, thesis_enabled, department')
      .ilike('name_ar', 'ماستر 2%')
      .order('name_ar');

    if (dept) query = query.eq('department', dept);

    const { data: levelsData } = await query;
    const filtered = levelsData || [];
    setSpecs(filtered);

    // ④ العناوين المقترحة — نحاول level_id أولاً، ثم speciality كـ fallback
    if (filtered.length > 0) {
      const levelIds = filtered.map((l: any) => String(l.id));
      // نجرب level_id أولاً
      const { data: propByLevel } = await supabase
        .from('thesis_proposals')
        .select('id, title_ar, title_fr, description, status, created_at, level_id, speciality, proposal_order, professor_id')
        .in('level_id', levelIds)
        .eq('academic_year', ACADEMIC_YEAR)
        .order('proposal_order', { ascending: true });

      // إذا رجع فارغاً نحاول speciality
      let propData = propByLevel;
      if (!propData || propData.length === 0) {
        const { data: propBySpec } = await supabase
          .from('thesis_proposals')
          .select('id, title_ar, title_fr, description, status, created_at, level_id, speciality, proposal_order, professor_id, academic_year')
          .in('speciality', levelIds)
          .eq('academic_year', ACADEMIC_YEAR)
          .order('proposal_order', { ascending: true });
        propData = propBySpec;
      }
      // إذا لا يزال فارغاً — نحاول بدون فلتر academic_year (تشخيص)
      if (!propData || propData.length === 0) {
        const { data: propNoYear } = await supabase
          .from('thesis_proposals')
          .select('id, title_ar, title_fr, description, status, created_at, level_id, speciality, proposal_order, professor_id, academic_year')
          .or(`level_id.in.(${levelIds.join(',')}),speciality.in.(${levelIds.join(',')})`)
          .order('proposal_order', { ascending: true });
        propData = propNoYear;
      }

      // نجلب أسماء الأساتذة منفصلاً
      const professorIds = [...new Set((propData || []).map((p: any) => p.professor_id))];
      let profMap: Record<string, string> = {};
      if (professorIds.length > 0) {
        const { data: profs } = await supabase
          .from('professors')
          .select('id, last_name, first_name')
          .in('id', professorIds);
        (profs || []).forEach((p: any) => {
          profMap[p.id] = `${p.last_name} ${p.first_name}`;
        });
      }

      setProposals((propData || []).map((p: any) => ({
        ...p,
        professor_name: profMap[p.professor_id] || '—',
      })));
    } else {
      setProposals([]);
    }

    // ⑤ الأساتذة الدائمون فقط — رتبة رسمية + كود لا يبدأ بـ V
    const PERMANENT_RANKS = [
      'أستاذ التعليم العالي',
      'أستاذ محاضر - أ',
      'أستاذ محاضر - ب',
      'أستاذ مساعد - أ',
      'أستاذ مساعد - ب',
    ];
    const { data: allProfs } = await supabase
      .from('professors')
      .select('id, last_name, first_name, rank, username')
      .in('rank', PERMANENT_RANKS)
      .order('last_name');
    // استبعاد من كودهم يبدأ بـ V (مؤقتون مدرجون بالخطأ برتبة دائمة)
    setAllProfessors((allProfs || []).filter((p: any) =>
      !p.username?.toUpperCase().startsWith('V')
    ));

    setLoading(false);
  }

  async function saveSpec(spec: any) {
    setSaving(spec.id);
    await supabase.from('levels').update({
      thesis_min:     spec.thesis_min     ?? 0,
      thesis_max:     spec.thesis_max     ?? null,
      thesis_enabled: spec.thesis_enabled ?? false,
    }).eq('id', spec.id);
    setSaving(null);
    setSaved(spec.id);
    setTimeout(() => setSaved(null), 2000);
  }

  function updateSpec(id: string, field: string, value: any) {
    setSpecs(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  function toggleSpec(spec: any) {
    if (deadlinePassed) return;
    const next = !spec.thesis_enabled;
    const msg = next
      ? `هل تريد فتح باب اقتراح العناوين لـ "${spec.name_ar}"؟`
      : `هل تريد إغلاق باب الاقتراح لـ "${spec.name_ar}"؟ لن يتمكن الأساتذة من إضافة عناوين جديدة.`;
    setConfirm({
      message: msg,
      onConfirm: () => {
        updateSpec(spec.id, 'thesis_enabled', next);
        setConfirm(null);
        // حفظ فوري للتبديل
        supabase.from('levels').update({ thesis_enabled: next }).eq('id', spec.id);
      },
    });
  }

  const deadlinePassed = deadline ? new Date(deadline) < new Date() : false;
  const deadlineLabel  = deadline
    ? new Date(deadline).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'لم يُحدَّد بعد';

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
    </div>
  );

  const deptLabel = department === 'عام' ? 'القانون العام' : department === 'خاص' ? 'القانون الخاص' : 'غير محدد';

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      {confirm && (
        <ConfirmModal
          message={confirm.message}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ── رأس الصفحة ── */}
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ScrollText className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 text-xs font-semibold">إدارة مذكرات التخرج</span>
            </div>
            <h2 className="font-bold text-base">{deptLabel} — الموسم {ACADEMIC_YEAR}</h2>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border ${
            deadlinePassed
              ? 'bg-red-500/20 text-red-200 border-red-500/30'
              : deadline
                ? 'bg-green-500/20 text-green-200 border-green-500/30'
                : 'bg-white/10 text-gray-300 border-white/20'
          }`}>
            {deadlinePassed ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            <span>الموعد النهائي:</span>
            <span className="font-bold">{deadlineLabel}</span>
          </div>
        </div>

        {/* إحصائيات سريعة */}
        {(() => {
          const sentIds = new Set(proposals.map((p: any) => p.professor_id));
          const notSentCount = allProfessors.filter((p: any) => !sentIds.has(p.id)).length;
          return (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'تخصصات مفتوحة', value: specs.filter(s => s.thesis_enabled).length, clickable: false },
                { label: 'عناوين مقترحة', value: proposals.filter(p => p.status === 'مقترح' || p.status === 'مُرسَل').length, clickable: false },
                { label: 'أساتذة مشاركون', value: new Set(proposals.map(p => p.professor_id)).size, clickable: false },
                { label: 'لم يرسلوا بعد', value: notSentCount, clickable: true },
              ].map(stat => (
                stat.clickable ? (
                  <button key={stat.label}
                    onClick={() => setShowNotSent(v => !v)}
                    className={`rounded-xl p-3 text-center transition-all ${
                      showNotSent ? 'bg-amber-400/30 ring-2 ring-amber-400/50' : 'bg-white/10 hover:bg-white/20'
                    }`}>
                    <p className="text-xl font-bold text-amber-300">{stat.value}</p>
                    <p className="text-[10px] text-amber-200 mt-0.5 flex items-center justify-center gap-1">
                      {stat.label}
                      {showNotSent ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </p>
                  </button>
                ) : (
                  <div key={stat.label} className="bg-white/10 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-white">{stat.value}</p>
                    <p className="text-[10px] text-gray-300 mt-0.5">{stat.label}</p>
                  </div>
                )
              ))}
            </div>
          );
        })()}

        {/* قائمة من لم يرسلوا — منبثقة داخل الهيدر */}
        {showNotSent && (() => {
          const sentIds = new Set(proposals.map((p: any) => p.professor_id));
          const notSent = allProfessors.filter((p: any) => !sentIds.has(p.id));
          return notSent.length > 0 ? (
            <div className="mt-3 bg-white/10 rounded-xl overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#0f2347]">
                    <tr>
                      <th className="px-3 py-2 text-right text-xs font-bold text-amber-300 w-8">#</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-amber-300">اللقب</th>
                      <th className="px-3 py-2 text-right text-xs font-bold text-amber-300">الاسم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {notSent.map((p: any, i: number) => (
                      <tr key={p.id} className="hover:bg-white/5">
                        <td className="px-3 py-2.5 text-xs text-gray-400 text-center">{i + 1}</td>
                        <td className="px-3 py-2.5 text-sm text-white font-medium">{p.last_name}</td>
                        <td className="px-3 py-2.5 text-sm text-gray-300">{p.first_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="mt-3 bg-green-500/20 rounded-xl px-4 py-3 text-green-200 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> جميع الأساتذة الدائمون أرسلوا مقترحاتهم
            </div>
          );
        })()}
      </div>

      {deadlinePassed && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm flex items-center gap-2">
          <Lock className="w-4 h-4 flex-shrink-0" />
          انتهى الموعد النهائي المحدد من نائب العميد — لا يمكن فتح باب الاقتراحات حتى يُجدَّد التاريخ.
        </div>
      )}

      {/* ── إعدادات التخصصات ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-gray-800 text-sm">إعدادات الاقتراحات حسب التخصص</h3>
          <p className="text-xs text-gray-400 mt-0.5">فتح/إغلاق باب الاقتراح وتحديد الحدود الدنيا والقصوى لكل تخصص</p>
        </div>

        {specs.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-10">لا توجد تخصصات ماستر 2 مرتبطة بقسمك</p>
        )}

        <div className="divide-y divide-gray-50">
          {specs.map(spec => {
            const specProposals = proposals.filter(p =>
              String(p.level_id) === String(spec.id) ||
              String(p.speciality) === String(spec.id)
            );
            const count = specProposals.length;

            return (
              <div key={spec.id} className="p-4">
                {/* صف الإعدادات */}
                <div className="flex items-center gap-3 flex-wrap">
                  {/* زر فتح/إغلاق */}
                  <button
                    disabled={deadlinePassed}
                    onClick={() => toggleSpec(spec)}
                    title={deadlinePassed ? 'انتهى الموعد النهائي' : ''}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      spec.thesis_enabled
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    } ${deadlinePassed ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    {spec.thesis_enabled
                      ? <><Unlock className="w-3 h-3" />مفتوح</>
                      : <><Lock className="w-3 h-3" />مغلق</>}
                  </button>

                  {/* اسم التخصص */}
                  <span className="flex-1 text-sm font-semibold text-gray-800 min-w-0 truncate">
                    {spec.name_ar}
                  </span>

                  {/* عداد العناوين */}
                  <span className="text-xs text-gray-400 flex-shrink-0">
                    {count} عنوان مقترح
                  </span>
                </div>

                {/* حقول الحدود + حفظ */}
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    <span>الحد الأدنى</span>
                    <input
                      type="number" min={0} max={99}
                      value={spec.thesis_min ?? 0}
                      onChange={e => updateSpec(spec.id, 'thesis_min', Number(e.target.value))}
                      className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-400 font-bold"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-500">
                    <span>الحد الأقصى</span>
                    <input
                      type="number" min={0} max={99}
                      placeholder="∞"
                      value={spec.thesis_max ?? ''}
                      onChange={e => updateSpec(spec.id, 'thesis_max', e.target.value === '' ? null : Number(e.target.value))}
                      className="w-14 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-400 font-bold"
                    />
                  </label>
                  <button
                    onClick={() => saveSpec(spec)}
                    disabled={saving === spec.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                    style={{
                      background: saved === spec.id ? '#dcfce7' : '#fef3c7',
                      color: saved === spec.id ? '#15803d' : '#92400e',
                    }}>
                    {saved === spec.id
                      ? <><CheckCircle className="w-3 h-3" />حُفظ</>
                      : <><Save className="w-3 h-3" />حفظ الإعدادات</>}
                  </button>
                </div>

                {/* جدول العناوين المقترحة */}
                {count > 0 && (
                  <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-[#1a3a6b]/5 border-b border-gray-100">
                          <th className="px-3 py-2.5 text-right text-xs font-bold text-[#1a3a6b] w-8">#</th>
                          <th className="px-3 py-2.5 text-right text-xs font-bold text-[#1a3a6b]">الأستاذ</th>
                          <th className="px-3 py-2.5 text-right text-xs font-bold text-[#1a3a6b]">العنوان بالعربية</th>
                          <th className="px-3 py-2.5 text-right text-xs font-bold text-[#1a3a6b] w-20">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {specProposals.map((p, i) => (
                          <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-3 py-3 text-xs font-bold text-gray-400 text-center">{i + 1}</td>
                            <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{p.professor_name}</td>
                            <td className="px-3 py-3 text-sm font-medium text-gray-800 leading-relaxed">{p.title_ar}</td>
                            <td className="px-3 py-3"><StatusBadge status={p.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {count === 0 && (
                  <p className="mt-2 text-xs text-gray-300 flex items-center gap-1">
                    <X className="w-3 h-3" />
                    لا توجد اقتراحات بعد
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── أساتذة لم يرسلوا بعد ── */}
      {(() => {
        const sentIds = new Set(proposals.map((p: any) => p.professor_id));
        const notSent = allProfessors.filter((p: any) => !sentIds.has(p.id));
        return notSent.length > 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-amber-50/50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">أساتذة لم يرسلوا مقترحاتهم بعد</h3>
                <p className="text-xs text-gray-400 mt-0.5">لم يُسجَّل لهم أي عنوان مقترح حتى الآن</p>
              </div>
              <span className="bg-amber-100 text-amber-700 font-bold text-sm px-3 py-1 rounded-full">
                {notSent.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-gray-500 w-8">#</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-gray-500">اللقب</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold text-gray-500">الاسم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {notSent.map((p: any, i: number) => (
                    <tr key={p.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-gray-400 text-center">{i + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{p.last_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{p.first_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-green-700 text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            جميع الأساتذة الدائمون أرسلوا مقترحاتهم
          </div>
        );
      })()}

    </div>
  );
}
