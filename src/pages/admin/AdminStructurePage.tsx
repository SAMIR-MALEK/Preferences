import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ROLE_DEFS, DEPARTMENTS, roleDef, normalizeSpeciality } from '../../lib/roles';
import { Shield, RefreshCw, UserX, Users } from 'lucide-react';

interface Holder { id: string; name: string; rank?: string }

export default function AdminStructurePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [specialities, setSpecialities] = useState<string[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError('');
    const { data, error: e1 } = await supabase
      .from('professor_roles')
      .select('id, role, speciality, professor_id, professors(last_name, first_name, rank)');
    if (e1) { setError('تعذّر قراءة المناصب: ' + e1.message); setLoading(false); return; }
    setRows(data || []);
    const { data: lvl } = await supabase.from('levels').select('speciality').not('speciality', 'is', null);
    const set = new Set<string>();
    (lvl || []).forEach((r: any) => r.speciality && set.add(normalizeSpeciality(r.speciality)));
    setSpecialities([...set].sort((a, b) => a.localeCompare(b, 'ar')));
    setLoading(false);
  }

  function holders(role: string, scope: string | null): Holder[] {
    return rows
      .filter(r => r.role === role && (scope === null ? !r.speciality : r.speciality === scope))
      .map(r => {
        const p = Array.isArray(r.professors) ? r.professors[0] : r.professors;
        return { id: r.id, name: p ? `${p.last_name} ${p.first_name}` : '—', rank: p?.rank };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }

  const totalSingle = ROLE_DEFS.filter(r => r.scope === 'none').length
    + DEPARTMENTS.length * ROLE_DEFS.filter(r => r.scope === 'department' && !r.multi).length
    + specialities.length * ROLE_DEFS.filter(r => r.scope === 'specialty' && !r.multi).length;
  const filledSingle = rows.filter(r => !roleDef(r.role)?.multi).length;

  function Seat({ role, scope, label }: { role: string; scope: string | null; label: string }) {
    const hs = holders(role, scope);
    return (
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm text-gray-600">{label}</span>
        {hs.length > 0 ? (
          <span className="text-right">
            <span className="block text-sm font-bold text-[#1a3a6b]">{hs[0].name}</span>
            {hs[0].rank && <span className="block text-[11px] text-gray-400">{hs[0].rank}</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            <UserX className="w-3 h-3" /> شاغر
          </span>
        )}
      </div>
    );
  }

  // عضو بحكم المنصب: يظهر تلقائياً من منصبه الأصلي
  function CouncilEx({ role, scope, label }: { role: string; scope: string | null; label: string }) {
    return <Seat role={role} scope={scope} label={label} />;
  }

  // عدة شاغلين لنفس الصفة (ممثلون، مدراء مخابر)
  function Multi({ role, scope, label, want }: { role: string; scope: string | null; label: string; want: number }) {
    const hs = holders(role, scope);
    return (
      <div className="px-4 py-3">
        <p className="text-sm text-gray-600 mb-2">{label} <span className="text-xs text-gray-400">({hs.length} من {want})</span></p>
        {hs.length === 0
          ? <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full"><UserX className="w-3 h-3" /> شاغر</span>
          : <span className="flex flex-wrap gap-1.5">
              {hs.map(m => (
                <span key={m.id} className="inline-flex items-center gap-1 text-[11px] bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                  <Users className="w-3 h-3" /> {m.name}
                </span>
              ))}
            </span>}
      </div>
    );
  }

  const councilSeats = 1 + 3 + 2 + 2 + 3 + 2 + 1;
  const councilFilled =
    Math.min(1, holders('council_head', null).length)
    + (['dean', 'vice_dean', 'vice_dean_research'] as const).filter(r => holders(r, null).length > 0).length
    + DEPARTMENTS.filter(d => holders('dept_head', d.value).length > 0).length
    + DEPARTMENTS.filter(d => holders('sci_head', d.value).length > 0).length
    + Math.min(2, holders('council_rep_prof', 'عام').length) + Math.min(1, holders('council_rep_prof', 'خاص').length)
    + Math.min(2, holders('council_rep_assist', null).length)
    + Math.min(1, holders('lab_director', null).length);

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin h-6 w-6 border-2 border-amber-500 border-t-transparent rounded-full" />
    </div>
  );

  if (error) return (
    <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl px-5 py-4 text-sm" dir="rtl">{error}</div>
  );

  const card = 'bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden';
  const head = 'px-4 py-3 border-b border-gray-100 bg-gray-50/60 font-bold text-gray-800 text-sm';

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-amber-400" />
              <span className="text-amber-400 text-xs font-semibold">الهيكل الإداري والبيداغوجي</span>
            </div>
            <h2 className="font-bold text-base">كلية الحقوق والعلوم السياسية</h2>
            <p className="text-xs text-gray-300 mt-1">التعيين والاستبدال من صفحة الأساتذة (زر الدرع في سطر الأستاذ).</p>
          </div>
          <button onClick={load} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl text-xs">
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 max-w-sm">
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xl font-bold">{filledSingle}</p>
            <p className="text-[10px] text-gray-300 mt-0.5">منصب مشغول</p>
          </div>
          <div className="bg-white/10 rounded-xl p-3 text-center">
            <p className="text-xl font-bold text-amber-300">{Math.max(0, totalSingle - filledSingle)}</p>
            <p className="text-[10px] text-amber-200 mt-0.5">منصب شاغر</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <div className={head}>إدارة الكلية</div>
          <div className="divide-y divide-gray-100">
            {ROLE_DEFS.filter(r => r.group === 'إدارة الكلية').map(r => <Seat key={r.key} role={r.key} scope={null} label={r.label} />)}
          </div>
        </div>
        <div className={card}>
          <div className={head}>الميدان والشعبة</div>
          <div className="divide-y divide-gray-100">
            <Seat role="field_head" scope={null} label="مسؤول الميدان" />
            <Seat role="branch_head" scope={null} label="مسؤول شعبة الحقوق" />
          </div>
        </div>
      </div>

      <div className={card}>
        <div className="px-4 py-3 border-b border-gray-100 bg-[#c9a227] text-white font-bold text-sm flex items-center justify-between gap-2">
          <span>المجلس العلمي للكلية</span>
          <span className="text-[11px] font-medium bg-white/20 rounded-full px-2.5 py-0.5">{councilFilled} من {councilSeats}</span>
        </div>
        <div className="divide-y divide-gray-100">
          <Seat role="council_head" scope={null} label="رئيس المجلس العلمي" />
          <CouncilEx role="dean" scope={null} label="عميد الكلية" />
          <CouncilEx role="vice_dean" scope={null} label="نائب العميد المكلف بالبيداغوجيا" />
          <CouncilEx role="vice_dean_research" scope={null} label="نائب العميد المكلف بالبحث العلمي" />
          {DEPARTMENTS.map(d => <CouncilEx key={'dh' + d.value} role="dept_head" scope={d.value} label={`رئيس ${d.label}`} />)}
          {DEPARTMENTS.map(d => <CouncilEx key={'sh' + d.value} role="sci_head" scope={d.value} label={`رئيس اللجنة العلمية ل${d.label}`} />)}
          {DEPARTMENTS.map(d => <Multi key={'rp' + d.value} role="council_rep_prof" scope={d.value} label={`ممثلو الأساتذة ذوي مصف الأستاذية — ${d.label}`} want={d.value === 'عام' ? 2 : 1} />)}
          <Multi role="council_rep_assist" scope={null} label="ممثلو الأساتذة المساعدين" want={2} />
          <Multi role="lab_director" scope={null} label="مدير مخبر بحث" want={1} />
        </div>
        <p className="px-4 py-2.5 text-[11px] text-gray-400 border-t border-gray-100">
          العميد ونائباه ورئيسا القسمين ورئيسا اللجنتين العلميتين أعضاء بحكم منصبهم فيظهرون هنا تلقائياً. الباقون يُعيَّنون من صفحة الأساتذة.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {DEPARTMENTS.map(d => {
          const members = holders('sci_member', d.value);
          return (
            <div key={d.value} className={card}>
              <div className="px-4 py-3 border-b border-gray-100 bg-[#1a3a6b] text-white font-bold text-sm">{d.label}</div>
              <div className="divide-y divide-gray-100">
                <Seat role="dept_head" scope={d.value} label="رئيس القسم" />
                <Seat role="sci_head" scope={d.value} label="رئيس اللجنة العلمية" />
                <div className="px-4 py-3">
                  <p className="text-sm text-gray-600 mb-2">أعضاء اللجنة العلمية <span className="text-xs text-gray-400">({members.length})</span></p>
                  {members.length === 0
                    ? <span className="text-xs text-gray-300">لا يوجد أعضاء بعد</span>
                    : <span className="flex flex-wrap gap-1.5">
                        {members.map(m => (
                          <span key={m.id} className="inline-flex items-center gap-1 text-[11px] bg-gray-100 text-gray-700 px-2 py-1 rounded-full">
                            <Users className="w-3 h-3" /> {m.name}
                          </span>
                        ))}
                      </span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={card}>
        <div className={head}>مسؤولو التخصصات</div>
        {specialities.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-10">لا توجد تخصصات</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {specialities.map(sp => <Seat key={sp} role="spec_head" scope={sp} label={sp} />)}
          </div>
        )}
      </div>
    </div>
  );
}
