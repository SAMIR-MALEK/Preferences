import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, AlertCircle, Save } from 'lucide-react';
import { toArabicNum } from '../../lib/utils';

interface ModuleRow {
  id: string;
  name_ar: string;
  level_name: string;
  semester: number;
  has_td: boolean;
  weekly_sessions: number;
  changed: boolean;
}

export default function AdminSessionsPage() {
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [semFilter, setSemFilter] = useState<0 | 1 | 2>(0);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase
      .from('modules')
      .select('id, name_ar, semester, has_td, weekly_sessions, level:levels(name_ar)')
      .eq('is_active', true)
      .order('semester')
      .order('display_order');

    if (data) {
      setModules(data.map((m: any) => ({
        id: m.id,
        name_ar: m.name_ar,
        level_name: m.level?.name_ar || '—',
        semester: m.semester,
        has_td: m.has_td,
        // القيمة الافتراضية: مقاييس TD = 2، بقية = 1
        weekly_sessions: m.weekly_sessions || (m.has_td ? 2 : 1),
        changed: false,
      })));
    }
    setLoading(false);
  }

  function setSession(id: string, val: number) {
    setModules(prev => prev.map(m =>
      m.id === id ? { ...m, weekly_sessions: val, changed: true } : m
    ));
  }

  async function saveAll() {
    const changed = modules.filter(m => m.changed);
    if (changed.length === 0) {
      setMessage({ type: 'error', text: 'لا توجد تغييرات للحفظ' });
      return;
    }
    setSaving(true);
    setMessage(null);

    let errors = 0;
    for (const m of changed) {
      const { error } = await supabase
        .from('modules')
        .update({ weekly_sessions: m.weekly_sessions })
        .eq('id', m.id);
      if (error) errors++;
    }

    if (errors === 0) {
      setMessage({ type: 'success', text: `تم حفظ ${toArabicNum(changed.length)} مقياس بنجاح` });
      setModules(prev => prev.map(m => ({ ...m, changed: false })));
    } else {
      setMessage({ type: 'error', text: `فشل حفظ ${toArabicNum(errors)} مقاييس` });
    }
    setSaving(false);
  }

  const filtered = modules.filter(m => semFilter === 0 || m.semester === semFilter);
  const changedCount = modules.filter(m => m.changed).length;

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-gray-900 text-xl">عدد الحصص الأسبوعية للمحاضرات</h2>
          <p className="text-gray-500 text-sm mt-0.5">
            المقاييس ذات TD مُحدَّدة افتراضياً بـ <strong>2 حصص</strong>. غيّر ما يلزم ثم احفظ دفعة واحدة.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* فلتر السداسي */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {[{ v: 0, l: 'الكل' }, { v: 1, l: 'السداسي 1' }, { v: 2, l: 'السداسي 2' }].map(f => (
              <button key={f.v} onClick={() => setSemFilter(f.v as 0|1|2)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${semFilter === f.v ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-gray-500'}`}>
                {f.l}
              </button>
            ))}
          </div>
          <button onClick={saveAll} disabled={saving || changedCount === 0}
            className="flex items-center gap-2 bg-[#1a3a6b] text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40 hover:bg-[#0d2040] transition-colors">
            <Save className="w-4 h-4" />
            {saving ? 'جارٍ الحفظ...' : `حفظ${changedCount > 0 ? ` (${toArabicNum(changedCount)})` : ''}`}
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">المقياس</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">المستوى</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">السداسي</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">نوع</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500">عدد الحصص الأسبوعية</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(m => (
              <tr key={m.id} className={m.changed ? 'bg-amber-50/40' : ''}>
                <td className="px-4 py-2.5 text-gray-800 font-medium">
                  {m.name_ar}
                  {m.changed && <span className="mr-1 text-xs text-amber-600">●</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{m.level_name}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{m.semester === 1 ? 'الأول' : 'الثاني'}</td>
                <td className="px-4 py-2.5">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${m.has_td ? 'bg-[#c9a227]/10 text-[#a07820]' : 'bg-[#1a3a6b]/08 text-[#1a3a6b]'}`}>
                    {m.has_td ? 'محاضرة + TD' : 'محاضرة فقط'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2 justify-center">
                    {[1, 2].map(n => (
                      <button key={n} onClick={() => setSession(m.id, n)}
                        className={`w-20 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${
                          m.weekly_sessions === n
                            ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                        }`}>
                        {n === 1 ? '× 1 (2.25س)' : '× 2 (4.5س)'}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
