import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import { X, Download, Search, Activity } from 'lucide-react';

interface Row {
  last_name: string; first_name: string; bac: string; year: number;
  specialite: string | null; section: number | null; groupe: number | null;
  sit_ins: string | null; last_login: string | null; logins: number;
}

type Filter = 'all' | 'in' | 'out';

function fmt(d: string | null) {
  if (!d) return '—';
  const x = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(x.getDate())}/${p(x.getMonth() + 1)}/${x.getFullYear()} ${p(x.getHours())}:${p(x.getMinutes())}`;
}

export default function AdminLoginStats({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [onlyValidated, setOnlyValidated] = useState(true);
  const [search, setSearch] = useState('');

  async function load() {
    setError(''); setRows(null);
    const { data, error: err } = await supabase.rpc('student_login_stats');
    if (err) { setError(err.message); return; }
    setRows((data as Row[]) || []);
  }
  useEffect(() => { load(); }, []);

  const base = useMemo(
    () => (rows || []).filter(r => !onlyValidated || (r.sit_ins || '').toLowerCase().startsWith('valid')),
    [rows, onlyValidated]
  );
  const entered = base.filter(r => r.logins > 0).length;

  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return base.filter(r => {
      if (filter === 'in' && r.logins === 0) return false;
      if (filter === 'out' && r.logins > 0) return false;
      if (!s) return true;
      return `${r.last_name} ${r.first_name} ${r.bac}`.toLowerCase().includes(s);
    });
  }, [base, filter, search]);

  function exportExcel() {
    const data = shown.map(r => ({
      'اللقب': r.last_name, 'الاسم': r.first_name, 'رقم البكالوريا': r.bac, 'سنة البكالوريا': r.year,
      'المستوى': r.specialite || '', 'القسم': r.section ?? '', 'الفوج': r.groupe ?? '',
      'آخر دخول': fmt(r.last_login), 'عدد الدخولات': r.logins,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    (wb as any).Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, 'دخول الطلبة');
    XLSX.writeFile(wb, 'دخول_الطلبة.xlsx');
  }

  const chip = (k: Filter, label: string) => (
    <button key={k} onClick={() => setFilter(k)}
      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${filter === k ? 'bg-[#1a3a6b] text-white border-[#1a3a6b]' : 'bg-white text-gray-600 border-gray-200'}`}>
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" dir="rtl">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2 font-bold text-[#1a3a6b]">
            <Activity className="w-5 h-5" /> دخول الطلبة إلى المنصة
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-xl p-3">{error}</div>}
          {!rows && !error && <p className="text-sm text-gray-500">جارٍ التحميل...</p>}

          {rows && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-gray-50 border p-3"><div className="text-xl font-bold text-gray-800">{base.length}</div><div className="text-xs text-gray-500">الطلبة</div></div>
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3"><div className="text-xl font-bold text-emerald-700">{entered}</div><div className="text-xs text-emerald-700">دخلوا</div></div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3"><div className="text-xl font-bold text-amber-700">{base.length - entered}</div><div className="text-xs text-amber-700">لم يدخلوا</div></div>
              </div>

              <p className="text-xs text-gray-500 leading-6">
                يُحتسب الدخول منذ تفعيل هذه الميزة، ومعه من فتح «حساباتي» قبلها. لا يُسجَّل للطالب أكثر من دخول واحد كل 30 دقيقة.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                {chip('all', 'الكل')}{chip('in', 'دخلوا')}{chip('out', 'لم يدخلوا')}
                <label className="flex items-center gap-1.5 text-sm text-gray-600 mr-auto">
                  <input type="checkbox" checked={onlyValidated} onChange={e => setOnlyValidated(e.target.checked)} />
                  المسجَّلون نهائياً فقط
                </label>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث بالاسم أو رقم البكالوريا"
                    className="w-full border rounded-xl pr-9 pl-3 py-2 text-sm" />
                </div>
                <button onClick={exportExcel}
                  className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-xl text-sm">
                  <Download className="w-4 h-4" /> Excel
                </button>
              </div>

              <div className="text-xs text-gray-500">{shown.length} طالب</div>
              <div className="border rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-right p-2">الطالب</th>
                      <th className="text-right p-2">البكالوريا</th>
                      <th className="text-right p-2">آخر دخول</th>
                      <th className="text-center p-2">المرات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.slice(0, 500).map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2 whitespace-nowrap">{r.last_name} {r.first_name}</td>
                        <td className="p-2 whitespace-nowrap" dir="ltr">{r.bac} / {r.year}</td>
                        <td className="p-2 whitespace-nowrap">{fmt(r.last_login)}</td>
                        <td className="p-2 text-center">{r.logins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {shown.length > 500 && <p className="text-xs text-gray-400">يُعرض أول 500 فقط — استعمل البحث أو Excel للبقية.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
