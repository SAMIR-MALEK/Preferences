import { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const CLS: Record<string, string> = { 'حاضر': 'bg-green-100 text-green-700', 'غائب': 'bg-red-100 text-red-700', 'متأخر': 'bg-amber-100 text-amber-700' };

// نتائج متابعة حضور الأستاذ (تظهر فقط إن سمحت الإدارة)
export default function ProfChecksMine() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { supabase.rpc('pc_my').then(({ data }) => setRows(Array.isArray(data) ? data : [])); }, []);
  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  const n = (st: string) => rows.filter(r => r.status === st).length;
  return (
    <div className="space-y-4" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#1a3a6b] flex items-center justify-center"><ClipboardCheck className="w-5 h-5 text-[#c9a227]" /></div>
        <div>
          <h2 className="font-bold text-gray-900">متابعة حضوري</h2>
          <p className="text-xs text-gray-500">حاضر {n('حاضر')} — غائب {n('غائب')} — متأخر {n('متأخر')}</p>
        </div>
      </div>
      {rows.length === 0 ? <p className="text-center text-sm text-gray-400 py-10">لا توجد تسجيلات</p> : (
        <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
          {rows.map((r, i) => (
            <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-gray-800">{String(r.date).split('-').reverse().join('/')} — {r.module}</p>
                <p className="text-[11px] text-gray-500">{r.level} — {r.kind === 'محاضرة' ? 'محاضرة' : 'أعمال موجهة'}{r.note ? ` — ${r.note}` : ''}</p>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${CLS[r.status] || ''}`}>{r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
