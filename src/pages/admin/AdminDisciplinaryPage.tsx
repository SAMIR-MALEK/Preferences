import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, Users, CheckCircle, Clock, Download } from 'lucide-react';

const ACADEMIC_YEAR = '2026-2027';

const COUNCILS = [
  'المجلس التأديبي لقسم القانون العام',
  'المجلس التأديبي لقسم القانون الخاص',
  'المجلس التأديبي للكلية',
];

interface Nomination {
  id: string;
  professor_id: string;
  council: string;
  academic_year: string;
  created_at: string;
  professor: {
    last_name: string;
    first_name: string;
    rank: string;
    username: string;
  };
}

interface Stats {
  total: number;
  byCouncil: Record<string, number>;
}

export default function AdminDisciplinaryPage() {
  const [nominations, setNominations] = useState<Nomination[]>([]);
  const [loading, setLoading]         = useState(true);
  const [activeCouncil, setActiveCouncil] = useState<string | null>(null);
  const [stats, setStats]             = useState<Stats>({ total: 0, byCouncil: {} });
  const [open, setOpen]               = useState(false);         // هل الترشح مفتوح؟
  const [deadline, setDeadline]       = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);

    // جلب إعدادات الترشح
    const { data: settings } = await supabase
      .from('academic_settings')
      .select('disciplinary_open, disciplinary_deadline')
      .eq('academic_year', ACADEMIC_YEAR)
      .maybeSingle();

    setOpen(!!settings?.disciplinary_open);
    setDeadline(settings?.disciplinary_deadline || null);

    // جلب كل الترشحات مع بيانات الأساتذة
    const { data } = await supabase
      .from('disciplinary_nominations')
      .select(`
        id, professor_id, council, academic_year, created_at,
        professor:professors ( last_name, first_name, rank, username )
      `)
      .eq('academic_year', ACADEMIC_YEAR)
      .order('created_at', { ascending: false });

    const list = (data as unknown as Nomination[]) || [];
    setNominations(list);

    // إحصاءات
    const byCouncil: Record<string, number> = {};
    COUNCILS.forEach(c => { byCouncil[c] = 0; });
    list.forEach(n => { byCouncil[n.council] = (byCouncil[n.council] || 0) + 1; });
    setStats({ total: list.length, byCouncil });

    setLoading(false);
  }

  async function toggleOpen() {
    const next = !open;
    await supabase
      .from('academic_settings')
      .update({ disciplinary_open: next })
      .eq('academic_year', ACADEMIC_YEAR);
    setOpen(next);
  }

  const filtered = activeCouncil
    ? nominations.filter(n => n.council === activeCouncil)
    : nominations;

  const isTemp = (username: string) => username?.toUpperCase().startsWith('V');

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]" dir="rtl">
        <div className="w-8 h-8 border-4 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">

      {/* ── هيدر ── */}
      <div>
        <h2 className="font-display font-bold text-gray-900 text-xl">المجلس التأديبي</h2>
        <p className="text-gray-500 text-sm">ترشحات الأساتذة — {ACADEMIC_YEAR}</p>
      </div>

      {/* ── بانر الحالة ── */}
      <div className="bg-gradient-to-l from-[#0a1628] to-[#1a3a6b] rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-[#c9a227]" />
              <span className="text-[#c9a227] text-xs font-semibold">ترشحات المجالس التأديبية</span>
            </div>
            <p className="text-white text-sm">
              {open ? 'باب الترشح مفتوح حالياً' : 'باب الترشح مغلق'}
              {deadline && (
                <span className="text-gray-300 mr-2 text-xs">
                  — الموعد النهائي: {new Date(deadline).toLocaleDateString('ar-DZ', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                  })}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={toggleOpen}
            className={`px-5 py-2 rounded-xl text-xs font-bold transition-colors ${
              open
                ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30 border border-red-400/30'
                : 'bg-green-500/20 text-green-200 hover:bg-green-500/30 border border-green-400/30'
            }`}>
            {open ? 'إغلاق باب الترشح' : 'فتح باب الترشح'}
          </button>
        </div>
      </div>

      {/* ── بطاقات إحصائية ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* إجمالي */}
        <button
          onClick={() => setActiveCouncil(null)}
          className={`bg-white rounded-xl p-4 border-2 shadow-sm text-right transition-all ${
            activeCouncil === null ? 'border-[#1a3a6b]' : 'border-gray-100 hover:border-[#1a3a6b]/30'
          }`}>
          <div className="w-9 h-9 rounded-xl bg-[#1a3a6b]/10 flex items-center justify-center mb-2">
            <Users className="w-4 h-4 text-[#1a3a6b]" />
          </div>
          <p className="font-display font-bold text-2xl text-gray-900">{stats.total}</p>
          <p className="text-gray-400 text-xs mt-0.5">إجمالي الترشحات</p>
        </button>

        {/* بطاقة لكل مجلس */}
        {COUNCILS.map((council, idx) => {
          const colors = [
            { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-500', icon: 'text-blue-500' },
            { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-500', icon: 'text-purple-500' },
            { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-500', icon: 'text-amber-500' },
          ][idx];
          const shortLabel = council.replace('المجلس التأديبي ', '');
          return (
            <button
              key={council}
              onClick={() => setActiveCouncil(activeCouncil === council ? null : council)}
              className={`bg-white rounded-xl p-4 border-2 shadow-sm text-right transition-all ${
                activeCouncil === council ? colors.border : 'border-gray-100 hover:border-gray-300'
              }`}>
              <div className={`w-9 h-9 rounded-xl ${colors.bg} flex items-center justify-center mb-2`}>
                <Shield className={`w-4 h-4 ${colors.icon}`} />
              </div>
              <p className="font-display font-bold text-2xl text-gray-900">{stats.byCouncil[council] || 0}</p>
              <p className="text-gray-400 text-xs mt-0.5 leading-tight">{shortLabel}</p>
            </button>
          );
        })}
      </div>

      {/* ── جدول الترشحات ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-bold text-gray-800 text-sm">
              {activeCouncil
                ? activeCouncil.replace('المجلس التأديبي ', '')
                : 'جميع الترشحات'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">{filtered.length} مرشح</p>
          </div>
          {filtered.length > 0 && (
            <button
              onClick={() => exportCSV(filtered)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">
              <Download className="w-3.5 h-3.5" />
              تصدير CSV
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            لا توجد ترشحات بعد
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs">#</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs">الاسم</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs">الرتبة</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs">النوع</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs">المجلس</th>
                  <th className="text-right px-5 py-3 font-semibold text-gray-600 text-xs">تاريخ الترشح</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((n, i) => (
                  <tr key={n.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-5 py-3 font-medium text-gray-800">
                      {n.professor.last_name} {n.professor.first_name}
                    </td>
                    <td className="px-5 py-3 text-gray-600 text-xs">{n.professor.rank}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        isTemp(n.professor.username)
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {isTemp(n.professor.username) ? 'متعاقد' : 'دائم'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600 text-xs">
                      {n.council.replace('المجلس التأديبي ', '')}
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {new Date(n.created_at).toLocaleDateString('ar-DZ', {
                        year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ملاحظة: لا يمكن حذف الترشحات */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-amber-700 text-xs flex items-center gap-2">
        <Clock className="w-4 h-4 flex-shrink-0" />
        الترشحات نهائية ولا يمكن حذفها أو تعديلها بعد تأكيدها.
      </div>

    </div>
  );
}

function exportCSV(nominations: Nomination[]) {
  const rows = [
    ['اللقب', 'الاسم', 'الرتبة', 'النوع', 'المجلس', 'تاريخ الترشح'],
    ...nominations.map(n => [
      n.professor.last_name,
      n.professor.first_name,
      n.professor.rank,
      n.professor.username?.toUpperCase().startsWith('V') ? 'متعاقد' : 'دائم',
      n.council,
      new Date(n.created_at).toLocaleDateString('ar-DZ'),
    ]),
  ];
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `disciplinary-nominations-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
