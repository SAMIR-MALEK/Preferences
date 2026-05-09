import { useState, useRef } from 'react';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import type { ProfessorRank } from '../../types';
import { PROFESSOR_RANKS, HIGHEST_DEGREES } from '../../types';
import {
  Upload, Download, Save, X, AlertCircle, CheckCircle,
  FileSpreadsheet, Trash2, Plus, RefreshCw, Info
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface ProfRow {
  id: string;
  last_name: string;
  first_name: string;
  rank: ProfessorRank;
  highest_degree: string;
  degree_speciality: string;
  degree_title: string;
  professional_experience: number;
  email: string;
  status: 'pending' | 'saving' | 'done' | 'error';
  error?: string;
  username?: string;
  password?: string;
}

const VALID_RANKS = PROFESSOR_RANKS;

export default function AdminImportPage() {
  const [rows, setRows] = useState<ProfRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // تحميل قالب Excel
  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['اللقب', 'الاسم', 'الرتبة العلمية', 'آخر شهادة', 'تخصص الشهادة', 'عنوان الشهادة', 'الخبرة (سنوات)', 'البريد الإلكتروني'],
      ['بن علي', 'محمد', 'أستاذ محاضر - أ', 'دكتوراه', 'قانون جنائي', 'أطروحة في القانون الجنائي', '10', 'exemple@univ-bbm.dz'],
      ['عمر', 'فاطمة', 'أستاذ مساعد - أ', 'دكتوراه', 'قانون دولي', 'القانون الدولي العام', '5', ''],
    ]);
    ws['!cols'] = [15, 12, 22, 12, 20, 28, 10, 25].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الأساتذة');
    XLSX.writeFile(wb, 'قالب_استيراد_الأساتذة.xlsx');
  }

  // قراءة ملف Excel
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      const wb = XLSX.read(data, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const dataRows = raw.slice(1).filter(r => r.some(c => c !== undefined && c !== ''));

      const parsed: ProfRow[] = dataRows.map((r, i) => ({
        id: `row_${i}_${Date.now()}`,
        last_name: String(r[0] || '').trim(),
        first_name: String(r[1] || '').trim(),
        rank: (VALID_RANKS.includes(String(r[2] || '').trim() as ProfessorRank)
          ? String(r[2]).trim()
          : 'أستاذ مساعد - أ') as ProfessorRank,
        highest_degree: HIGHEST_DEGREES.includes(String(r[3] || '').trim())
          ? String(r[3]).trim()
          : 'دكتوراه',
        degree_speciality: String(r[4] || '').trim(),
        degree_title: String(r[5] || '').trim(),
        professional_experience: parseInt(String(r[6] || '0')) || 0,
        email: String(r[7] || '').trim(),
        status: 'pending',
      }));

      setRows(parsed);
      setDone(false);
      setGlobalMessage(null);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  function updateRow(id: string, field: Partial<ProfRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...field } : r));
  }

  function deleteRow(id: string) {
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function addRow() {
    setRows(prev => [...prev, {
      id: `row_${Date.now()}`,
      last_name: '', first_name: '',
      rank: 'أستاذ مساعد - أ',
      highest_degree: 'دكتوراه',
      degree_speciality: '', degree_title: '',
      professional_experience: 0, email: '',
      status: 'pending',
    }]);
  }

  // الحفظ عبر Edge Function
  async function handleImport() {
    const valid = rows.filter(r => r.status === 'pending' && r.last_name && r.first_name);
    if (valid.length === 0) {
      setGlobalMessage({ type: 'error', text: 'لا توجد صفوف صالحة للاستيراد' });
      return;
    }
    setImporting(true);

    // جلب أكبر رقم مستخدم موجود
    const { data: profs } = await supabase.from('professors').select('username');
    const maxNum = profs
      ? Math.max(0, ...profs.map(p => parseInt(p.username)).filter(n => !isNaN(n)))
      : 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.last_name || !row.first_name || row.status !== 'pending') continue;

      updateRow(row.id, { status: 'saving' });

      try {
        const result = await callEdgeFunction('create-professor', {
          last_name: row.last_name,
          first_name: row.first_name,
          rank: row.rank,
          highest_degree: row.highest_degree,
          degree_speciality: row.degree_speciality,
          degree_title: row.degree_title,
          professional_experience: row.professional_experience,
          email: row.email,
          username_index: maxNum + i + 1,
        });

        updateRow(row.id, {
          status: 'done',
          username: result.username,
          password: result.password,
        });
      } catch (e: any) {
        updateRow(row.id, { status: 'error', error: e.message });
      }
    }

    setImporting(false);
    setDone(true);
    setGlobalMessage({ type: 'success', text: 'اكتمل الاستيراد — راجع النتائج أدناه' });
  }

  function exportCredentials() {
    const doneRows = rows.filter(r => r.status === 'done');
    const ws = XLSX.utils.aoa_to_sheet([
      ['اللقب', 'الاسم', 'رقم المستخدم', 'كلمة المرور'],
      ...doneRows.map(r => [r.last_name, r.first_name, r.username, r.password]),
    ]);
    ws['!cols'] = [15, 15, 15, 15].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'بيانات الدخول');
    XLSX.writeFile(wb, 'بيانات_دخول_الأساتذة.xlsx');
  }

  const pendingCount = rows.filter(r => r.status === 'pending').length;
  const doneCount = rows.filter(r => r.status === 'done').length;
  const errorCount = rows.filter(r => r.status === 'error').length;

  return (
    <div className="space-y-5 animate-fade-in pb-8" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">استيراد الأساتذة من Excel</h2>
          <p className="text-gray-500 text-sm mt-1">رفع ملف Excel ← مراجعة وتعديل ← حفظ في قاعدة البيانات</p>
        </div>
        <button onClick={downloadTemplate}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
          <Download className="w-4 h-4" /> تحميل قالب Excel
        </button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium mb-0.5">تعليمات الاستخدام</p>
          <p className="text-blue-600 text-xs">حمّل القالب → أدخل بيانات الأساتذة → ارفع الملف → راجع البيانات → اضغط حفظ. سيُنشأ حساب لكل أستاذ تلقائياً مع اسم مستخدم وكلمة مرور.</p>
        </div>
      </div>

      {/* Upload zone */}
      {rows.length === 0 && (
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-[#1a3a6b]/30 rounded-2xl p-14 text-center cursor-pointer hover:border-[#1a3a6b]/60 hover:bg-[#1a3a6b]/[0.02] transition-all">
          <FileSpreadsheet className="w-14 h-14 text-[#1a3a6b]/30 mx-auto mb-3" />
          <p className="font-display font-bold text-gray-700 mb-1">اضغط لرفع ملف Excel</p>
          <p className="text-gray-400 text-sm">xlsx أو xls — الصف الأول عناوين، الأساتذة من الصف الثاني</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </div>
      )}

      {/* Messages */}
      {globalMessage && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          globalMessage.type === 'success'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {globalMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {globalMessage.text}
        </div>
      )}

      {/* Stats bar */}
      {rows.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
          <span className="text-sm text-gray-600 font-medium">{rows.length} أستاذ إجمالاً</span>
          {doneCount > 0 && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {doneCount} تم حفظهم</span>}
          {errorCount > 0 && <span className="text-sm text-red-600 font-medium flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {errorCount} فشل</span>}
          {pendingCount > 0 && !done && <span className="text-sm text-amber-600 font-medium">⏳ {pendingCount} في الانتظار</span>}
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">#</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">اللقب *</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">الاسم *</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">الرتبة</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">الشهادة</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">التخصص</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">الخبرة</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">م.مستخدم</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 whitespace-nowrap">ك.مرور</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, idx) => (
                  <tr key={row.id}
                    style={{
                      background: row.status === 'done' ? '#f0fdf4' :
                        row.status === 'error' ? '#fff1f2' :
                        row.status === 'saving' ? '#eff6ff' : 'white'
                    }}>
                    {/* Status + index */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        {row.status === 'pending' && <span className="text-xs text-gray-400">{idx + 1}</span>}
                        {row.status === 'saving' && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                        {row.status === 'done' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                        {row.status === 'error' && (
                          <span title={row.error}>
                            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5">
                      <input value={row.last_name} onChange={e => updateRow(row.id, { last_name: e.target.value })}
                        disabled={row.status === 'done'}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50 disabled:text-gray-500" />
                    </td>

                    <td className="px-3 py-2.5">
                      <input value={row.first_name} onChange={e => updateRow(row.id, { first_name: e.target.value })}
                        disabled={row.status === 'done'}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-24 focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50 disabled:text-gray-500" />
                    </td>

                    <td className="px-3 py-2.5">
                      <select value={row.rank} onChange={e => updateRow(row.id, { rank: e.target.value as ProfessorRank })}
                        disabled={row.status === 'done'}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50 disabled:text-gray-500 max-w-36">
                        {PROFESSOR_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>

                    <td className="px-3 py-2.5">
                      <select value={row.highest_degree} onChange={e => updateRow(row.id, { highest_degree: e.target.value })}
                        disabled={row.status === 'done'}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50 disabled:text-gray-500">
                        {HIGHEST_DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>

                    <td className="px-3 py-2.5">
                      <input value={row.degree_speciality} onChange={e => updateRow(row.id, { degree_speciality: e.target.value })}
                        disabled={row.status === 'done'}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50 disabled:text-gray-500" />
                    </td>

                    <td className="px-3 py-2.5">
                      <input type="number" min="0" value={row.professional_experience}
                        onChange={e => updateRow(row.id, { professional_experience: parseInt(e.target.value) || 0 })}
                        disabled={row.status === 'done'}
                        className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-14 focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50 disabled:text-gray-500"
                        dir="ltr" />
                    </td>

                    <td className="px-3 py-2.5">
                      {row.status === 'done'
                        ? <code className="text-xs text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded">{row.username}</code>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>

                    <td className="px-3 py-2.5">
                      {row.status === 'done'
                        ? <code className="text-xs text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded">{row.password}</code>
                        : <span className="text-xs text-gray-300">—</span>}
                    </td>

                    <td className="px-3 py-2.5">
                      {row.status !== 'done' && (
                        <button onClick={() => deleteRow(row.id)}
                          className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer actions */}
          <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
            {!done && (
              <>
                <button onClick={addRow}
                  className="flex items-center gap-2 text-[#1a3a6b] text-sm hover:underline">
                  <Plus className="w-4 h-4" /> إضافة صف
                </button>
                <button
                  onClick={() => { setRows([]); setGlobalMessage(null); }}
                  className="flex items-center gap-2 text-gray-400 text-sm hover:text-gray-600">
                  <X className="w-4 h-4" /> إلغاء
                </button>
                <button onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 text-gray-400 text-sm hover:text-gray-600">
                  <Upload className="w-4 h-4" /> رفع ملف آخر
                </button>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
                <div className="mr-auto">
                  <button onClick={handleImport} disabled={importing}
                    className="flex items-center gap-2 bg-[#1a3a6b] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2040] transition-colors disabled:opacity-50">
                    <Save className="w-4 h-4" />
                    {importing ? 'جارٍ الحفظ...' : `حفظ ${pendingCount} أستاذ في قاعدة البيانات`}
                  </button>
                </div>
              </>
            )}
            {done && doneCount > 0 && (
              <button onClick={exportCredentials}
                className="flex items-center gap-2 bg-green-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-green-700 transition-colors">
                <Download className="w-4 h-4" /> تصدير بيانات الدخول Excel
              </button>
            )}
            {done && (
              <button onClick={() => { setRows([]); setDone(false); setGlobalMessage(null); }}
                className="flex items-center gap-2 text-gray-400 text-sm hover:text-gray-600">
                <RefreshCw className="w-4 h-4" /> استيراد دفعة جديدة
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
