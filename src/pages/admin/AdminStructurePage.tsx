import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ROLE_DEFS, DEPARTMENTS, roleDef } from '../../lib/roles';
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
    (lvl || []).forEach((r: any) => r.speciality && set.add(String(r.speciality).trim()));
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
    + DEPARTMENTS.length
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

        <div className="space-y-4">
          <div className={card}>
            <div className={head}>الأقسام</div>
            <div className="divide-y divide-gray-100">
              {DEPARTMENTS.map(d => <Seat key={d.value} role="dept_head" scope={d.value} label={`رئيس ${d.label}`} />)}
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
      </div>

      <div className={card}>
        <div className={head}>التخصصات</div>
        {specialities.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-10">لا توجد تخصصات</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#1a3a6b]/5 border-b border-gray-100 text-xs text-[#1a3a6b]">
                  <th className="px-4 py-2.5 text-right font-bold">التخصص</th>
                  <th className="px-4 py-2.5 text-right font-bold">مسؤول التخصص</th>
                  <th className="px-4 py-2.5 text-right font-bold">رئيس اللجنة العلمية</th>
                  <th className="px-4 py-2.5 text-right font-bold">أعضاء اللجنة العلمية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {specialities.map(sp => {
                  const cell = (role: string) => {
                    const h = holders(role, sp)[0];
                    return h
                      ? <span className="font-bold text-[#1a3a6b] text-xs">{h.name}</span>
                      : <span className="text-xs font-bold text-amber-700">شاغر</span>;
                  };
                  const members = holders('sci_member', sp);
                  return (
                    <tr key={sp} className="hover:bg-gray-50/60 align-top">
                      <td className="px-4 py-3 font-semibold text-gray-800 text-xs whitespace-nowrap">{sp}</td>
                      <td className="px-4 py-3">{cell('spec_head')}</td>
                      <td className="px-4 py-3">{cell('sci_head')}</td>
                      <td className="px-4 py-3">
                        {members.length === 0
                          ? <span className="text-xs text-gray-300">—</span>
                          : <span className="flex flex-wrap gap-1">
                              {members.map(m => (
                                <span key={m.id} className="inline-flex items-center gap-1 text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">
                                  <Users className="w-3 h-3" /> {m.name}
                                </span>
                              ))}
                            </span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
