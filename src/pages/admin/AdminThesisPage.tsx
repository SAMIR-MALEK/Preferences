import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ScrollText, Save, CheckCircle, Lock, Unlock, ChevronDown, ChevronUp, User } from 'lucide-react';

export default function AdminThesisPage() {
  const { user } = useAuth();
  const department = user?.admin?.department; // 'عام' | 'خاص'

  const [specs, setSpecs]           = useState<any[]>([]);
  const [proposals, setProposals]   = useState<any[]>([]);
  const [deadline, setDeadline]     = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState<string | null>(null);
  const [saved, setSaved]           = useState<string | null>(null);
  const [expandedSpec, setExpandedSpec] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    // الموعد النهائي من academic_settings
    const { data: settingsData } = await supabase
      .from('academic_settings')
      .select('thesis_deadline')
      .eq('academic_year', '2026-2027')
      .single();
    setDeadline(settingsData?.thesis_deadline || null);

    // ماستر 2 فقط من القسم — المذكرات تخص ماستر 2
    const { data: levelsData } = await supabase
      .from('levels')
      .select('id, name_ar, thesis_min, thesis_max, thesis_enabled, department')
      .eq('department', department)
      .ilike('name_ar', 'ماستر 2%')
      .order('name_ar');

    const filtered = levelsData || [];
    setSpecs(filtered);

    // العناوين المقترحة لأساتذة القسم
    const levelIds = filtered.map((l: any) => l.id);
    let propData: any[] = [];
    if (levelIds.length > 0) {
      const { data } = await supabase
        .from('thesis_proposals')
        .select(`
          id, title_ar, title_fr, description, status, created_at,
          level_id,
          professor:professors(id, full_name)
        `)
        .in('level_id', levelIds)
        .eq('academic_year', '2026-2027')
        .order('created_at', { ascending: false });
      propData = data || [];
    }
    setProposals(propData);

    setLoading(false);
  }

  async function saveSpec(spec: any) {
    setSaving(spec.id);
    await supabase
      .from('levels')
      .update({
        thesis_min:     spec.thesis_min     ?? 0,
        thesis_max:     spec.thesis_max     ?? null,
        thesis_enabled: spec.thesis_enabled ?? false,
      })
      .eq('id', spec.id);
    setSaving(null);
    setSaved(spec.id);
    setTimeout(() => setSaved(null), 2000);
  }

  function updateSpec(id: string, field: string, value: any) {
    setSpecs(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }

  const deadlinePassed = deadline ? new Date(deadline) < new Date() : false;
  const deadlineLabel  = deadline
    ? `${deadlinePassed ? 'انتهى' : 'ينتهي'} ${new Date(deadline).toLocaleDateString('ar-DZ')}`
    : 'لم يُحدَّد بعد';

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <svg className="animate-spin h-6 w-6 text-amber-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-amber-600" />
            إدارة مذكرات التخرج
          </h2>
          <p className="text-gray-500 text-sm mt-0.5">قسم القانون {department} — الموسم 2026/2027</p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border ${
          deadlinePassed
            ? 'bg-red-50 text-red-600 border-red-200'
            : deadline
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-gray-50 text-gray-500 border-gray-200'
        }`}>
          <span>الموعد النهائي:</span>
          <span className="font-bold">{deadlineLabel}</span>
        </div>
      </div>

      {/* إعدادات التخصصات */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800 text-sm">إعدادات الاقتراحات حسب التخصص</h3>
          <p className="text-xs text-gray-400 mt-0.5">تحديد الحدود الدنيا والقصوى وفتح/إغلاق باب الاقتراح</p>
        </div>
        <div className="divide-y divide-gray-50">
          {specs.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">لا توجد تخصصات مرتبطة بقسمك</p>
          )}
          {specs.map(spec => (
            <div key={spec.id} className="p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {/* زر فتح/إغلاق */}
                  <button
                    disabled={deadlinePassed}
                    onClick={() => { updateSpec(spec.id, 'thesis_enabled', !spec.thesis_enabled); }}
                    title={deadlinePassed ? 'انتهى الموعد النهائي' : ''}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      spec.thesis_enabled && !deadlinePassed
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    } ${deadlinePassed ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    {spec.thesis_enabled && !deadlinePassed
                      ? <><Unlock className="w-3 h-3" />مفتوح</>
                      : <><Lock className="w-3 h-3" />مغلق</>}
                  </button>
                  <span className="text-sm font-medium text-gray-800 truncate">{spec.name_ar}</span>
                </div>

                {/* الحدود */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    الحد الأدنى
                    <input
                      type="number" min={0} max={99}
                      value={spec.thesis_min ?? 0}
                      onChange={e => updateSpec(spec.id, 'thesis_min', Number(e.target.value))}
                      className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    الحد الأقصى
                    <input
                      type="number" min={0} max={99}
                      placeholder="∞"
                      value={spec.thesis_max ?? ''}
                      onChange={e => updateSpec(spec.id, 'thesis_max', e.target.value === '' ? null : Number(e.target.value))}
                      className="w-14 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </label>
                  <button
                    onClick={() => saveSpec(spec)}
                    disabled={saving === spec.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                    {saved === spec.id
                      ? <><CheckCircle className="w-3 h-3" />حُفظ</>
                      : <><Save className="w-3 h-3" />حفظ</>}
                  </button>
                </div>
              </div>

              {/* عدد الاقتراحات */}
              {(() => {
                const count = proposals.filter(p => p.level_id === spec.id).length;
                return count > 0 ? (
                  <button
                    onClick={() => setExpandedSpec(expandedSpec === spec.id ? null : spec.id)}
                    className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 hover:text-amber-700">
                    <ScrollText className="w-3 h-3" />
                    {count} عنوان مقترح
                    {expandedSpec === spec.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-gray-300">لا توجد اقتراحات بعد</p>
                );
              })()}

              {/* قائمة الاقتراحات المنبثقة */}
              {expandedSpec === spec.id && (
                <div className="mt-3 space-y-2 pl-2 border-r-2 border-amber-200 pr-3">
                  {proposals.filter(p => p.level_id === spec.id).map(p => (
                    <div key={p.id} className="bg-amber-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-gray-800">{p.title_ar}</p>
                      {p.title_fr && <p className="text-[11px] text-gray-400 mt-0.5 italic">{p.title_fr}</p>}
                      {p.description && <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{p.description}</p>}
                      <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-gray-400">
                        <User className="w-3 h-3" />
                        {p.professor?.full_name || '—'}
                        <span className="mx-1">·</span>
                        {new Date(p.created_at).toLocaleDateString('ar-DZ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ملاحظة */}
      {deadlinePassed && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm flex items-center gap-2">
          <Lock className="w-4 h-4 flex-shrink-0" />
          انتهى الموعد النهائي المحدد من نائب العميد — لا يمكن فتح باب الاقتراحات حتى يُجدَّد التاريخ.
        </div>
      )}
    </div>
  );
}
