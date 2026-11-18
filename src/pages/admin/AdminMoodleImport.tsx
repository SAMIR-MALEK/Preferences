import { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import { X, Upload, KeyRound, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

interface Row { bac: string; year: string; username: string; email: string; password: string }
interface Missing { last_name: string; first_name: string; bac: string; year: number }

const CHUNK = 400;

// نجد العمود من عنوانه مهما اختلفت الكتابة قليلاً
function pick(headers: string[], tests: ((h: string) => boolean)[]): string | null {
  for (const t of tests) {
    const h = headers.find(x => t(x.toLowerCase().trim()));
    if (h) return h;
  }
  return null;
}

export default function AdminMoodleImport({ onClose }: { onClose: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ matched: number; unmatched: { bac: string; year: number }[] } | null>(null);
  const [cov, setCov] = useState<{ validated: number; with_account: number; missing: Missing[] } | null>(null);

  async function readFile(file: File) {
    setError(''); setNote(''); setRows(null); setResult(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (raw.length === 0) { setError('الملف فارغ'); return; }
      const headers = Object.keys(raw[0]);
      const cBac = pick(headers, [h => h === 'mat. bac', h => h.includes('mat') && h.includes('bac')]);
      const cYear = pick(headers, [h => h.includes('année') || h.includes('annee')]);
      const cUser = pick(headers, [h => h.includes('مستخدم'), h => h === 'user', h => h === 'username']);
      const cPwd = pick(headers, [h => h.includes('كلمة'), h => h.includes('password')]);
      const cMail = pick(headers, [h => h.includes('بريد'), h => h.includes('mail')]);
      const missingCols = [!cBac && 'Mat. BAC', !cYear && 'Année du bac', !cUser && 'إسم المستخدم', !cPwd && 'كلمة سر موودل', !cMail && 'البريد المهني'].filter(Boolean);
      if (missingCols.length) { setError('أعمدة غير موجودة في الملف: ' + missingCols.join('، ')); return; }

      const s = (v: any) => String(v ?? '').trim();
      const all: Row[] = raw.map(r => ({
        bac: s(r[cBac!]), year: s(r[cYear!]), username: s(r[cUser!]),
        email: s(r[cMail!]).toLowerCase(), password: s(r[cPwd!]),
      }));
      const good = all.filter(r => r.bac && /^\d{4}$/.test(r.year) && r.username && r.email && r.password);
      const skipped = all.length - good.length;
      const dup = good.length - new Set(good.map(r => r.email)).size;
      setRows(good);
      setFileName(file.name);
      setNote(
        `${all.length} سطر في الملف — ${good.length} صالح للاستيراد` +
        (skipped ? ` — ${skipped} سطر بلا بريد أو كلمة سر (يُتجاهل)` : '') +
        (dup ? ` — تنبيه: ${dup} بريد مكرر` : '')
      );
    } catch (e: any) {
      setError('تعذّرت قراءة الملف: ' + (e?.message || e));
    }
  }

  async function upload() {
    if (!rows || rows.length === 0) return;
    setBusy(true); setError(''); setResult(null);
    let matched = 0;
    const unmatched: { bac: string; year: number }[] = [];
    for (let i = 0; i < rows.length; i += CHUNK) {
      setProgress(`جارٍ الرفع… ${Math.min(i + CHUNK, rows.length)} / ${rows.length}`);
      const { data, error: err } = await supabase.rpc('import_moodle_accounts', { p_rows: rows.slice(i, i + CHUNK) });
      if (err) { setError('توقف الرفع: ' + err.message + ` (تم رفع ${matched} حساباً قبل التوقف)`); setBusy(false); setProgress(''); return; }
      const res: any = data;
      matched += res?.matched || 0;
      (res?.unmatched || []).forEach((u: any) => unmatched.push(u));
    }
    setResult({ matched, unmatched });
    setProgress('');
    setBusy(false);
    setRows(null);
    loadCoverage();
  }

  async function loadCoverage() {
    setError('');
    const { data, error: err } = await supabase.rpc('moodle_coverage');
    if (err) { setError('تعذّر جلب التغطية: ' + err.message); return; }
    setCov(data as any);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-[#1a3a6b]" />
            <h3 className="font-bold text-gray-900">حسابات موودل للطلبة</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          <div className="text-sm text-gray-600 leading-relaxed bg-gray-50 border border-gray-100 rounded-xl p-4">
            ارفع ملف الإكسل الذي فيه: <b>Mat. BAC</b> و<b>Année du bac</b> و<b>إسم المستخدم</b> و<b>كلمة سر موودل</b> و<b>البريد المهني</b>.
            تُطابَق الحسابات برقم البكالوريا وسنتها، وتُحفظ في جدول مغلق لا يقرؤه أحد مباشرة. لا تظهر كلمات السر في هذه الصفحة.
          </div>

          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { if (e.target.files?.[0]) readFile(e.target.files[0]); e.target.value = ''; }} />

          <div className="flex flex-wrap gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={busy}
              className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0a1628] text-white px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50">
              <Upload className="w-4 h-4" /> اختيار ملف الإكسل
            </button>
            <button onClick={loadCoverage} disabled={busy}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50">
              <RefreshCw className="w-4 h-4" /> فحص التغطية
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> <span>{error}</span>
            </div>
          )}

          {rows && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="text-sm text-blue-900"><b>{fileName}</b><br />{note}</p>
              <button onClick={upload} disabled={busy || rows.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50">
                {busy ? progress || 'جارٍ الرفع…' : `رفع ${rows.length} حساباً`}
              </button>
            </div>
          )}

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-900 space-y-2">
              <p className="flex items-center gap-2 font-bold"><CheckCircle className="w-4 h-4" /> تم حفظ {result.matched} حساباً</p>
              {result.unmatched.length > 0 && (
                <div>
                  <p className="text-amber-800 font-medium">{result.unmatched.length} سطراً في الملف لا يطابق أي طالب عندنا (لم يُحفظ):</p>
                  <p className="text-xs text-gray-600 mt-1 font-mono break-all" dir="ltr">
                    {result.unmatched.slice(0, 20).map(u => `${u.bac}/${u.year}`).join('  ·  ')}
                    {result.unmatched.length > 20 ? ` … +${result.unmatched.length - 20}` : ''}
                  </p>
                </div>
              )}
            </div>
          )}

          {cov && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 text-center text-sm bg-gray-50 border-b border-gray-200">
                <div className="p-3"><p className="text-lg font-bold">{cov.validated}</p><p className="text-xs text-gray-500">مسجّلون نهائياً</p></div>
                <div className="p-3"><p className="text-lg font-bold text-green-700">{cov.with_account}</p><p className="text-xs text-gray-500">لهم حساب</p></div>
                <div className="p-3"><p className="text-lg font-bold text-amber-700">{cov.missing.length}</p><p className="text-xs text-gray-500">بلا حساب</p></div>
              </div>
              {cov.missing.length > 0 && (
                <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
                  {cov.missing.map((m, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span className="font-medium text-gray-800">{m.last_name} {m.first_name}</span>
                      <span className="text-xs text-gray-500 font-mono" dir="ltr">{m.bac} / {m.year}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
