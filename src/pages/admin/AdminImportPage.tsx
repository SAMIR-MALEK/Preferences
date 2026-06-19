import { useState, useRef, useEffect } from 'react';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import type { ProfessorRank, Level, UEType, DeliveryMode } from '../../types';
import { PROFESSOR_RANKS, HIGHEST_DEGREES, UE_TYPES, DELIVERY_MODES } from '../../types';
import {
  Upload, Download, Save, X, AlertCircle, CheckCircle,
  FileSpreadsheet, Trash2, Plus, RefreshCw, Info, Users, BookOpen
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ─── أساتذة ──────────────────────────────────────────────────────────────────
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
  custom_username: string;
  custom_password: string;
  status: 'pending' | 'saving' | 'done' | 'error';
  error?: string;
  username?: string;
  password?: string;
}

// ─── مقاييس ──────────────────────────────────────────────────────────────────
interface ModuleRow {
  id: string;
  level_code: string;
  name_ar: string;
  semester: 1 | 2;
  has_lectures: boolean;
  has_td: boolean;
  specialty_match: string;
  ue_type: UEType;
  delivery_mode: DeliveryMode;
  status: 'pending' | 'saving' | 'done' | 'error';
  error?: string;
}

export default function AdminImportPage() {
  const [activeTab, setActiveTab] = useState<'professors' | 'modules'>('professors');

  // ── حالة الأساتذة
  const [rows, setRows] = useState<ProfRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [globalMessage, setGlobalMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── حالة المقاييس
  const [modRows, setModRows] = useState<ModuleRow[]>([]);
  const [modImporting, setModImporting] = useState(false);
  const [modDone, setModDone] = useState(false);
  const [modMessage, setModMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const modFileRef = useRef<HTMLInputElement>(null);
  const [levels, setLevels] = useState<Level[]>([]);

  useEffect(() => {
    supabase.from('levels').select('*').order('display_order').then(({ data }) => {
      if (data) setLevels(data);
    });
  }, []);

  // ════════════════════════════════════════════════════════════════
  // الأساتذة
  // ════════════════════════════════════════════════════════════════

  function downloadProfTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['اللقب', 'الاسم', 'الرتبة العلمية', 'آخر شهادة', 'تخصص الشهادة', 'عنوان الشهادة', 'الخبرة (سنوات)', 'البريد الإلكتروني', 'اسم المستخدم (اختياري)', 'كلمة المرور (اختياري)'],
      ['بن علي', 'محمد', 'أستاذ محاضر - أ', 'دكتوراه', 'قانون جنائي', 'أطروحة في القانون الجنائي', '10', 'exemple@univ-bbm.dz', 'benali.m', 'Pass2026'],
      ['عمر', 'فاطمة', 'أستاذ مساعد - أ', 'دكتوراه', 'قانون دولي', 'القانون الدولي العام', '5', '', '', ''],
      ['', 'إن تركت اسم المستخدم/كلمة المرور فارغين، سيولّدهما النظام تلقائياً', '', '', '', '', '', '', '', ''],
    ]);
    ws['!cols'] = [15, 12, 22, 12, 20, 28, 10, 25, 20, 18].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الأساتذة');
    XLSX.writeFile(wb, 'قالب_استيراد_الأساتذة.xlsx');
  }

  async function handleProfFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const dataRows = raw.slice(1).filter(r => r.some(c => c !== undefined && c !== ''));
      setRows(dataRows.map((r, i) => ({
        id: `row_${i}_${Date.now()}`,
        last_name: String(r[0] || '').trim(),
        first_name: String(r[1] || '').trim(),
        rank: (PROFESSOR_RANKS.includes(String(r[2] || '').trim() as ProfessorRank)
          ? String(r[2]).trim() : 'أستاذ مساعد - أ') as ProfessorRank,
        highest_degree: HIGHEST_DEGREES.includes(String(r[3] || '').trim()) ? String(r[3]).trim() : 'دكتوراه',
        degree_speciality: String(r[4] || '').trim(),
        degree_title: String(r[5] || '').trim(),
        professional_experience: parseInt(String(r[6] || '0')) || 0,
        email: String(r[7] || '').trim(),
        custom_username: String(r[8] || '').trim(),
        custom_password: String(r[9] || '').trim(),
        status: 'pending',
      })));
      setDone(false); setGlobalMessage(null);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  function updateRow(id: string, field: Partial<ProfRow>) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...field } : r));
  }

  async function handleImport() {
    const valid = rows.filter(r => r.status === 'pending' && r.last_name && r.first_name);
    if (!valid.length) { setGlobalMessage({ type: 'error', text: 'لا توجد صفوف صالحة للاستيراد' }); return; }

    // تحقق محلي من تكرار اسم المستخدم بين الصفوف نفسها قبل الإرسال
    const usernamesInBatch = valid.map(r => r.custom_username).filter(Boolean);
    const dupesInBatch = usernamesInBatch.filter((u, i) => usernamesInBatch.indexOf(u) !== i);
    if (dupesInBatch.length > 0) {
      setGlobalMessage({ type: 'error', text: `أسماء مستخدمين مكررة في الملف نفسه: ${[...new Set(dupesInBatch)].join('، ')}` });
      return;
    }

    setImporting(true);
    const { data: profs } = await supabase.from('professors').select('username');
    const existingUsernames = new Set(profs?.map(p => p.username) || []);
    const maxNum = profs ? Math.max(0, ...profs.map(p => parseInt(p.username)).filter(n => !isNaN(n))) : 0;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.last_name || !row.first_name || row.status !== 'pending') continue;

      // تحقق سريع قبل الاستدعاء
      if (row.custom_username && existingUsernames.has(row.custom_username)) {
        updateRow(row.id, { status: 'error', error: `اسم المستخدم "${row.custom_username}" مستخدم بالفعل من أستاذ آخر` });
        continue;
      }

      updateRow(row.id, { status: 'saving' });
      try {
        const result = await callEdgeFunction('create-professor', {
          last_name: row.last_name, first_name: row.first_name,
          rank: row.rank, highest_degree: row.highest_degree,
          degree_speciality: row.degree_speciality, degree_title: row.degree_title,
          professional_experience: row.professional_experience, email: row.email,
          username_index: maxNum + i + 1,
          custom_username: row.custom_username || undefined,
          custom_password: row.custom_password || undefined,
        });
        updateRow(row.id, { status: 'done', username: result.username, password: result.password });
        if (row.custom_username) existingUsernames.add(row.custom_username);
      } catch (e: any) {
        updateRow(row.id, { status: 'error', error: e.message });
      }
    }
    setImporting(false); setDone(true);
    setGlobalMessage({ type: 'success', text: 'اكتمل الاستيراد — راجع النتائج أدناه' });
  }

  function exportCredentials() {
    const doneRows = rows.filter(r => r.status === 'done');
    const ws = XLSX.utils.aoa_to_sheet([
      ['اللقب', 'الاسم', 'الرتبة', 'البريد الإلكتروني', 'اسم المستخدم', 'كلمة المرور'],
      ...doneRows.map(r => [r.last_name, r.first_name, r.rank, r.email || '—', r.username, r.password]),
    ]);
    ws['!cols'] = [15, 15, 22, 25, 15, 15].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'بيانات الدخول');
    XLSX.writeFile(wb, `بيانات_دخول_الأساتذة_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const pendingCount = rows.filter(r => r.status === 'pending').length;
  const doneCount = rows.filter(r => r.status === 'done').length;
  const errorCount = rows.filter(r => r.status === 'error').length;

  // ════════════════════════════════════════════════════════════════
  // المقاييس
  // ════════════════════════════════════════════════════════════════

  function downloadModTemplate() {
    const levelCodes = levels.map(l => l.code).join(' / ') || 'L1 / L2 / L3P / L3G / M1CJ / M2CJ ...';
    const ws = XLSX.utils.aoa_to_sheet([
      ['رمز المستوى', 'اسم المقياس بالعربية', 'السداسي (1 أو 2)', 'الوحدة (أساسية/منهجية/استكشافية/أفقية)', 'نمط الحضور (حضوري/عن بعد)', 'محاضرة (نعم/لا)', 'أعمال موجهة (نعم/لا)', 'تخصص الأستاذ المفضّل للإسناد (اختياري)'],
      ['L1', 'مدخل للقانون', '1', 'أساسية', 'حضوري', 'نعم', 'نعم', 'قانون خاص,قانون عام'],
      ['L2', 'القانون الدستوري', '1', 'أساسية', 'حضوري', 'نعم', 'نعم', 'قانون عام'],
      ['M1CJ', 'الإجراءات الجزائية', '2', 'منهجية', 'حضوري', 'نعم', 'نعم', 'قانون جنائي'],
      ['L3G', 'حقوق الإنسان', '1', 'استكشافية', 'عن بعد', 'نعم', 'لا', 'قانون عام'],
      ['', `رموز المستويات المتاحة: ${levelCodes}`, '', '', '', '', '', ''],
      ['', 'الوحدات: أساسية / منهجية / استكشافية / أفقية', '', '', '', '', '', ''],
      ['', 'نمط الحضور: حضوري / عن بعد (عن بعد عادة بدون أعمال موجهة)', '', '', '', '', '', ''],
      ['', 'تنبيه: عمود التخصص الأخير لا علاقة له بتخصص المستوى (قانون عام/خاص) — هو فقط لتفضيل الإسناد', '', '', '', '', '', ''],
    ]);
    ws['!cols'] = [12, 30, 12, 20, 20, 16, 18, 28].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'المقاييس');
    XLSX.writeFile(wb, 'قالب_استيراد_المقاييس.xlsx');
  }

  async function handleModFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const dataRows = raw.slice(1).filter(r => r[0] && r[1]);
      setModRows(dataRows.map((r, i) => {
        const ueRaw = String(r[3] || 'أساسية').trim();
        const ue: UEType = (UE_TYPES as string[]).includes(ueRaw) ? ueRaw as UEType : 'أساسية';
        const dmRaw = String(r[4] || 'حضوري').trim();
        const dm: DeliveryMode = (DELIVERY_MODES as string[]).includes(dmRaw) ? dmRaw as DeliveryMode : 'حضوري';
        return {
          id: `mod_${i}_${Date.now()}`,
          level_code: String(r[0] || '').trim().toUpperCase(),
          name_ar: String(r[1] || '').trim(),
          semester: (parseInt(String(r[2] || '1')) === 2 ? 2 : 1) as 1 | 2,
          ue_type: ue,
          delivery_mode: dm,
          has_lectures: String(r[5] || 'نعم').trim() !== 'لا',
          has_td: dm === 'عن بعد' ? false : String(r[6] || 'نعم').trim() !== 'لا',
          specialty_match: String(r[7] || '').trim(),
          status: 'pending' as const,
        };
      }));
      setModDone(false); setModMessage(null);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  function updateModRow(id: string, field: Partial<ModuleRow>) {
    setModRows(prev => prev.map(r => r.id === id ? { ...r, ...field } : r));
  }

  async function handleModImport() {
    const valid = modRows.filter(r => r.status === 'pending' && r.level_code && r.name_ar);
    if (!valid.length) { setModMessage({ type: 'error', text: 'لا توجد مقاييس صالحة للاستيراد' }); return; }
    setModImporting(true);

    // جلب المقاييس الموجودة لتحديد display_order
    const { data: existingMods } = await supabase.from('modules').select('level_id, semester, display_order');

    for (let i = 0; i < modRows.length; i++) {
      const row = modRows[i];
      if (!row.level_code || !row.name_ar || row.status !== 'pending') continue;

      const level = levels.find(l => l.code.toUpperCase() === row.level_code.toUpperCase());
      if (!level) {
        updateModRow(row.id, { status: 'error', error: `رمز المستوى "${row.level_code}" غير موجود` });
        continue;
      }

      updateModRow(row.id, { status: 'saving' });

      try {
        const sameLevel = existingMods?.filter(m => m.level_id === level.id && m.semester === row.semester) || [];
        const maxOrder = sameLevel.length > 0 ? Math.max(...sameLevel.map(m => m.display_order || 0)) : -1;

        const specialty = row.specialty_match
          ? row.specialty_match.split(',').map(s => s.trim()).filter(Boolean)
          : [];

        const { error } = await supabase.from('modules').insert({
          level_id: level.id,
          code: `${row.level_code}-S${row.semester}-${Date.now()}`,
          name_ar: row.name_ar,
          semester: row.semester,
          has_lectures: row.has_lectures,
          has_td: row.has_td,
          weekly_hours_lecture: 2.25,
          weekly_hours_td: row.has_td ? 1.5 : 0,
          specialty_match: specialty,
          ue_type: row.ue_type,
          delivery_mode: row.delivery_mode,
          is_active: true,
          display_order: maxOrder + 1,
        });

        if (error) throw new Error(error.message);
        updateModRow(row.id, { status: 'done' });
        // تحديث القائمة المحلية للـ display_order
        existingMods?.push({ level_id: level.id, semester: row.semester, display_order: maxOrder + 1 });
      } catch (e: any) {
        updateModRow(row.id, { status: 'error', error: e.message });
      }
    }

    setModImporting(false); setModDone(true);
    setModMessage({ type: 'success', text: 'اكتمل استيراد المقاييس' });
  }

  const modPending = modRows.filter(r => r.status === 'pending').length;
  const modDoneCount = modRows.filter(r => r.status === 'done').length;
  const modErrorCount = modRows.filter(r => r.status === 'error').length;

  // ════════════════════════════════════════════════════════════════
  // Render
  // ════════════════════════════════════════════════════════════════

  return (
    <div className="space-y-5 animate-fade-in pb-8" dir="rtl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">الاستيراد من Excel</h2>
        <p className="text-gray-500 text-sm mt-1">استيراد الأساتذة والمقاييس من ملفات Excel</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('professors')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'professors'
              ? 'bg-white text-[#1a3a6b] shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          <Users className="w-4 h-4" /> استيراد الأساتذة
        </button>
        <button
          onClick={() => setActiveTab('modules')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'modules'
              ? 'bg-white text-[#1a3a6b] shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}>
          <BookOpen className="w-4 h-4" /> استيراد المقاييس
        </button>
      </div>

      {/* ════ تبويب الأساتذة ════ */}
      {activeTab === 'professors' && (
        <div className="space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <p className="text-gray-500 text-sm">رفع ملف Excel ← مراجعة وتعديل ← حفظ في قاعدة البيانات</p>
            <button onClick={downloadProfTemplate}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
              <Download className="w-4 h-4" /> تحميل قالب Excel
            </button>
          </div>

          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-blue-600 text-xs">حمّل القالب → أدخل بيانات الأساتذة → ارفع الملف → راجع البيانات → اضغط حفظ. اترك خانتي "اسم المستخدم" و"كلمة المرور" فارغتين ليولّدهما النظام تلقائياً، أو أدخلهما بنفسك — وفي حالة استخدام اسم موجود مسبقاً سيظهر تنبيه واضح.</p>
          </div>

          {rows.length === 0 && (
            <div onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-[#1a3a6b]/30 rounded-2xl p-14 text-center cursor-pointer hover:border-[#1a3a6b]/60 hover:bg-[#1a3a6b]/[0.02] transition-all">
              <FileSpreadsheet className="w-14 h-14 text-[#1a3a6b]/30 mx-auto mb-3" />
              <p className="font-display font-bold text-gray-700 mb-1">اضغط لرفع ملف Excel</p>
              <p className="text-gray-400 text-sm">xlsx أو xls — الصف الأول عناوين، الأساتذة من الصف الثاني</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleProfFile} className="hidden" />
            </div>
          )}

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

          {rows.length > 0 && (
            <div className="flex items-center gap-4 flex-wrap bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
              <span className="text-sm text-gray-600 font-medium">{toArabicNum(rows.length)} أستاذ إجمالاً</span>
              {doneCount > 0 && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {toArabicNum(doneCount)} تم حفظهم</span>}
              {errorCount > 0 && <span className="text-sm text-red-600 font-medium flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {toArabicNum(errorCount)} فشل</span>}
              {pendingCount > 0 && !done && <span className="text-sm text-amber-600 font-medium">⏳ {toArabicNum(pendingCount)} في الانتظار</span>}
            </div>
          )}

          {rows.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">#</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">اللقب *</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">الاسم *</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">الرتبة</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">الشهادة</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">التخصص</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">الخبرة</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">م.مستخدم (اختياري)</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">ك.مرور (اختياري)</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((row, idx) => (
                      <tr key={row.id} style={{
                        background: row.status === 'done' ? '#f0fdf4' :
                          row.status === 'error' ? '#fff1f2' :
                          row.status === 'saving' ? '#eff6ff' : 'white'
                      }}>
                        <td className="px-3 py-2.5">
                          {row.status === 'pending' && <span className="text-xs text-gray-400">{toArabicNum(idx + 1)}</span>}
                          {row.status === 'saving' && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                          {row.status === 'done' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                          {row.status === 'error' && <span title={row.error}><AlertCircle className="w-3.5 h-3.5 text-red-500" /></span>}
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
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50 max-w-36">
                            {PROFESSOR_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <select value={row.highest_degree} onChange={e => updateRow(row.id, { highest_degree: e.target.value })}
                            disabled={row.status === 'done'}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50">
                            {HIGHEST_DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <input value={row.degree_speciality} onChange={e => updateRow(row.id, { degree_speciality: e.target.value })}
                            disabled={row.status === 'done'}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-28 focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50" />
                        </td>
                        <td className="px-3 py-2.5">
                          <input type="number" min="0" value={row.professional_experience}
                            onChange={e => updateRow(row.id, { professional_experience: parseInt(e.target.value) || 0 })}
                            disabled={row.status === 'done'}
                            className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-14 focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50"
                            dir="ltr" />
                        </td>
                        <td className="px-3 py-2.5">
                          {row.status === 'done'
                            ? <code className="text-xs text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded">{row.username}</code>
                            : <input value={row.custom_username} onChange={e => updateRow(row.id, { custom_username: e.target.value })}
                                placeholder="تلقائي"
                                disabled={row.status !== 'pending'}
                                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50 placeholder:text-gray-300"
                                dir="ltr" />}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.status === 'done'
                            ? <code className="text-xs text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded">{row.password}</code>
                            : <input value={row.custom_password} onChange={e => updateRow(row.id, { custom_password: e.target.value })}
                                placeholder="تلقائي"
                                disabled={row.status !== 'pending'}
                                className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-20 focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50 placeholder:text-gray-300"
                                dir="ltr" />}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.status !== 'done' && (
                            <button onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))}
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
              <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                {!done && (
                  <>
                    <button onClick={() => setRows(prev => [...prev, {
                      id: `row_${Date.now()}`, last_name: '', first_name: '',
                      rank: 'أستاذ مساعد - أ', highest_degree: 'دكتوراه',
                      degree_speciality: '', degree_title: '', professional_experience: 0,
                      email: '', custom_username: '', custom_password: '', status: 'pending',
                    }])} className="flex items-center gap-2 text-[#1a3a6b] text-sm hover:underline">
                      <Plus className="w-4 h-4" /> إضافة صف
                    </button>
                    <button onClick={() => { setRows([]); setGlobalMessage(null); }}
                      className="flex items-center gap-2 text-gray-400 text-sm hover:text-gray-600">
                      <X className="w-4 h-4" /> إلغاء
                    </button>
                    <button onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 text-gray-400 text-sm hover:text-gray-600">
                      <Upload className="w-4 h-4" /> رفع ملف آخر
                    </button>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleProfFile} className="hidden" />
                    <div className="mr-auto">
                      <button onClick={handleImport} disabled={importing}
                        className="flex items-center gap-2 bg-[#1a3a6b] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2040] transition-colors disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {importing ? 'جارٍ الحفظ...' : `حفظ ${toArabicNum(pendingCount)} أستاذ في قاعدة البيانات`}
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
      )}

      {/* ════ تبويب المقاييس ════ */}
      {activeTab === 'modules' && (
        <div className="space-y-4">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <p className="text-gray-500 text-sm">رفع ملف Excel بأسماء المقاييس ومستوياتها ← مراجعة ← حفظ</p>
            <button onClick={downloadModTemplate}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors">
              <Download className="w-4 h-4" /> تحميل قالب Excel
            </button>
          </div>

          <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="text-blue-600 text-xs space-y-1">
              <p>استخدم رموز المستويات الدقيقة: <strong>L1 · L2 · L3P · L3G · M1CJ · M2CJ · M1AFF · M2AFF · M1INFO · M2INFO · M1URB · M2URB · M1SAN · M2SAN</strong></p>
              <p>السداسي: اكتب 1 أو 2 — محاضرة/أعمال موجهة: اكتب نعم أو لا</p>
              <p><strong>تخصص الأستاذ المفضّل للإسناد</strong>: حقل اختياري لا علاقة له بتخصص المستوى (مثل قانون عام/خاص) — يُستخدم فقط داخل خوارزمية الإسناد لتفضيل الأستاذ الذي يحمل هذا التخصص عند التصادم بين عدة أساتذة على نفس المقياس. اكتب قائمة تخصصات مفصولة بفاصلة، أو اتركه فارغاً.</p>
            </div>
          </div>

          {modRows.length === 0 && (
            <div onClick={() => modFileRef.current?.click()}
              className="border-2 border-dashed border-[#1a3a6b]/30 rounded-2xl p-14 text-center cursor-pointer hover:border-[#1a3a6b]/60 hover:bg-[#1a3a6b]/[0.02] transition-all">
              <FileSpreadsheet className="w-14 h-14 text-[#1a3a6b]/30 mx-auto mb-3" />
              <p className="font-display font-bold text-gray-700 mb-1">اضغط لرفع ملف Excel</p>
              <p className="text-gray-400 text-sm">xlsx أو xls — الصف الأول عناوين، المقاييس من الصف الثاني</p>
              <input ref={modFileRef} type="file" accept=".xlsx,.xls" onChange={handleModFile} className="hidden" />
            </div>
          )}

          {modMessage && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
              modMessage.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}>
              {modMessage.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {modMessage.text}
            </div>
          )}

          {modRows.length > 0 && (
            <div className="flex items-center gap-4 flex-wrap bg-white rounded-xl px-4 py-3 border border-gray-100 shadow-sm">
              <span className="text-sm text-gray-600 font-medium">{toArabicNum(modRows.length)} مقياس إجمالاً</span>
              {modDoneCount > 0 && <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> {toArabicNum(modDoneCount)} تم حفظها</span>}
              {modErrorCount > 0 && <span className="text-sm text-red-600 font-medium flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {toArabicNum(modErrorCount)} فشل</span>}
              {modPending > 0 && !modDone && <span className="text-sm text-amber-600 font-medium">⏳ {toArabicNum(modPending)} في الانتظار</span>}
            </div>
          )}

          {modRows.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">#</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">المستوى *</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">اسم المقياس *</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">السداسي</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">الوحدة</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">نمط الحضور</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">محاضرة</th>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">أعمال موجهة</th>
                      <th className="px-3 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {modRows.map((row, idx) => {
                      const levelFound = levels.find(l => l.code.toUpperCase() === row.level_code.toUpperCase());
                      return (
                        <tr key={row.id} style={{
                          background: row.status === 'done' ? '#f0fdf4' :
                            row.status === 'error' ? '#fff1f2' :
                            row.status === 'saving' ? '#eff6ff' : 'white'
                        }}>
                          <td className="px-3 py-2.5">
                            {row.status === 'pending' && <span className="text-xs text-gray-400">{toArabicNum(idx + 1)}</span>}
                            {row.status === 'saving' && <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                            {row.status === 'done' && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
                            {row.status === 'error' && <span title={row.error}><AlertCircle className="w-3.5 h-3.5 text-red-500" /></span>}
                          </td>
                          <td className="px-3 py-2.5">
                            <select value={row.level_code}
                              onChange={e => updateModRow(row.id, { level_code: e.target.value })}
                              disabled={row.status === 'done'}
                              className={`border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50 ${
                                !levelFound && row.status === 'pending' ? 'border-red-300 bg-red-50' : 'border-gray-200'
                              }`}>
                              {levels.map(l => <option key={l.id} value={l.code}>{l.code} — {l.name_ar}</option>)}
                              {!levelFound && <option value={row.level_code}>{row.level_code} ⚠ غير موجود</option>}
                            </select>
                          </td>
                          <td className="px-3 py-2.5">
                            <input value={row.name_ar}
                              onChange={e => updateModRow(row.id, { name_ar: e.target.value })}
                              disabled={row.status === 'done'}
                              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs w-48 focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50" />
                          </td>
                          <td className="px-3 py-2.5">
                            <select value={row.semester}
                              onChange={e => updateModRow(row.id, { semester: parseInt(e.target.value) as 1 | 2 })}
                              disabled={row.status === 'done'}
                              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50">
                              <option value={1}>الأول</option>
                              <option value={2}>الثاني</option>
                            </select>
                          </td>
                          <td className="px-3 py-2.5">
                            <select value={row.ue_type}
                              onChange={e => updateModRow(row.id, { ue_type: e.target.value as UEType })}
                              disabled={row.status === 'done'}
                              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50">
                              {UE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2.5">
                            <select value={row.delivery_mode}
                              onChange={e => {
                                const dm = e.target.value as DeliveryMode;
                                updateModRow(row.id, { delivery_mode: dm, has_td: dm === 'عن بعد' ? false : row.has_td });
                              }}
                              disabled={row.status === 'done'}
                              className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#1a3a6b]/30 disabled:bg-gray-50">
                              {DELIVERY_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2.5">
                            <input type="checkbox" checked={row.has_lectures}
                              onChange={e => updateModRow(row.id, { has_lectures: e.target.checked })}
                              disabled={row.status === 'done'}
                              className="w-4 h-4 accent-[#1a3a6b]" />
                          </td>
                          <td className="px-3 py-2.5">
                            <input type="checkbox" checked={row.has_td}
                              onChange={e => updateModRow(row.id, { has_td: e.target.checked })}
                              disabled={row.status === 'done' || row.delivery_mode === 'عن بعد'}
                              className="w-4 h-4 accent-[#1a3a6b] disabled:opacity-40" />
                          </td>
                          <td className="px-3 py-2.5">
                            {row.status !== 'done' && (
                              <button onClick={() => setModRows(prev => prev.filter(r => r.id !== row.id))}
                                className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                {!modDone && (
                  <>
                    <button onClick={() => setModRows(prev => [...prev, {
                      id: `mod_${Date.now()}`,
                      level_code: levels[0]?.code || 'L1',
                      name_ar: '', semester: 1,
                      ue_type: 'أساسية', delivery_mode: 'حضوري',
                      has_lectures: true, has_td: true,
                      specialty_match: '', status: 'pending',
                    }])} className="flex items-center gap-2 text-[#1a3a6b] text-sm hover:underline">
                      <Plus className="w-4 h-4" /> إضافة صف
                    </button>
                    <button onClick={() => { setModRows([]); setModMessage(null); }}
                      className="flex items-center gap-2 text-gray-400 text-sm hover:text-gray-600">
                      <X className="w-4 h-4" /> إلغاء
                    </button>
                    <button onClick={() => modFileRef.current?.click()}
                      className="flex items-center gap-2 text-gray-400 text-sm hover:text-gray-600">
                      <Upload className="w-4 h-4" /> رفع ملف آخر
                    </button>
                    <input ref={modFileRef} type="file" accept=".xlsx,.xls" onChange={handleModFile} className="hidden" />
                    <div className="mr-auto">
                      <button onClick={handleModImport} disabled={modImporting}
                        className="flex items-center gap-2 bg-[#1a3a6b] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2040] transition-colors disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {modImporting ? 'جارٍ الحفظ...' : `حفظ ${toArabicNum(modPending)} مقياس في قاعدة البيانات`}
                      </button>
                    </div>
                  </>
                )}
                {modDone && (
                  <button onClick={() => { setModRows([]); setModDone(false); setModMessage(null); }}
                    className="flex items-center gap-2 text-gray-400 text-sm hover:text-gray-600">
                    <RefreshCw className="w-4 h-4" /> استيراد دفعة جديدة
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
