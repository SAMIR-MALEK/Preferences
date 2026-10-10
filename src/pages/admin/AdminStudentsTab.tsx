import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Upload, Download, RefreshCw, Edit2, Key, X, Check } from 'lucide-react';
import * as XLSX from 'xlsx';

const SPECIALITES = [
  'أولى ليسانس', 'ثانية ليسانس', 'ثالثة ليسانس قانون عام', 'ثالثة ليسانس قانون خاص',
  'ماستر1 قانون أعمال', 'ماستر1 قانون الإعلام الآلي والإنترنت', 'ماستر1 قانون الصحة',
  'ماستر1 قانون جنائي', 'ماستر1 قانون عقاري',
  'ماستر2 قانون الأعمال', 'ماستر2 قانون الإعلام الآلي والإنترنت',
  'ماستر2 قانون التهيئة والتعمير', 'ماستر2 قانون الصحة', 'ماستر2 قانون جنائي',
];

interface Student {
  id: string;
  mat_bac: string;
  annee_bac: number | null;
  mat_etudiant: string;
  sit_ins: string | null;
  specialite: string;
  phone: string;
  last_name: string;
  first_name: string;
  username: string;
  email: string;
  section: number | null;
  groupe: number | null;
  created_at: string;
}

export default function AdminStudentsTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSpec, setFilterSpec] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 50;

  useEffect(() => { loadStudents(); }, []);

  async function loadStudents() {
    setLoading(true);
    let all: Student[] = [];
    let from = 0;
    while (true) {
      const { data } = await supabase.from('students').select('*').order('last_name').range(from, from + 999);
      if (!data || data.length === 0) break;
      all = [...all, ...data];
      if (data.length < 1000) break;
      from += 1000;
    }
    setStudents(all);
    setLoading(false);
  }

  async function importExcel(file: File) {
    setImporting(true);
    setImportMsg('جارٍ القراءة...');
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws);
      setImportMsg(`${rows.length} سطر — جارٍ المعالجة...`);

      // جلب كل الطلبة الحاليين للمقارنة
      let existing: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase.from('students').select('id, mat_bac, mat_etudiant').range(from, from + 999);
        if (!data || data.length === 0) break;
        existing = [...existing, ...data];
        if (data.length < 1000) break;
        from += 1000;
      }
      const existingMap = new Map(existing.map((s: any) => [`${String(s.mat_bac).trim()}`, s.id]));

      const toInsert: any[] = [];
      const toUpdate: any[] = [];

      for (const r of rows) {
        const matBac = String(r['Mat. BAC'] || '').trim();
        const matEtudiant = String(r['Mat. Etudiant'] || '').trim();
        const anneeBacRaw = r['Année du bac'] || r['Annee du bac'] || r['année du bac'] || r['annee_bac'] || '';
        const sitIns = String(r["Sit. d'ins."] || r["Sit d'ins"] || r['sit_ins'] || '').trim() || null;
        const record = {
          mat_bac: matBac,
          annee_bac: anneeBacRaw ? Number(String(anneeBacRaw).trim()) || null : null,
          mat_etudiant: matEtudiant,
          sit_ins: sitIns,
          specialite: String(r['specialité'] || r['specialite'] || '').trim(),
          phone: String(r['N° de téléphone'] || '').trim(),
          last_name: String(r['Nom'] || r['اللقب'] || '').trim(),
          first_name: String(r['Prénom'] || r['الإسم'] || '').trim(),
          carte_rfid: String(r['carte rfid'] || '').trim() || null,
          username: String(r['USER'] || '').trim() || null,
          password: String(r['PASSWORD'] || '').trim() || null,
          email: String(r['MAIL'] || '').trim() || null,
          section: r['Section'] ? Number(r['Section']) : null,
          groupe: r['Groupe'] ? Number(r['Groupe']) : null,
        };

        const existingId = existingMap.get(matBac);
        if (existingId) {
          toUpdate.push({ id: existingId, ...record });
        } else {
          toInsert.push(record);
        }
      }

      // INSERT الجدد
      let inserted = 0;
      const BATCH = 300;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const { error } = await supabase.from('students').insert(toInsert.slice(i, i + BATCH));
        if (error) {
          setImportMsg(`خطأ في الإضافة: ${error.message} | code: ${error.code}`);
          setImporting(false);
          return;
        }
        inserted += Math.min(BATCH, toInsert.length - i);
        setImportMsg(`إضافة ${inserted}/${toInsert.length} جديد...`);
      }

      // UPDATE الموجودين
      let updated = 0;
      for (const s of toUpdate) {
        const { id, ...fields } = s;
        await supabase.from('students').update(fields).eq('id', id);
        updated++;
        if (updated % 100 === 0) setImportMsg(`تحديث ${updated}/${toUpdate.length}...`);
      }

      setImportMsg(`✓ تم: إضافة ${inserted} جديد + تحديث ${updated} طالب`);
      await loadStudents();
    } catch (e: any) {
      setImportMsg('خطأ: ' + e.message);
    }
    setImporting(false);
  }

  function exportExcel() {
    const data = filtered.map(s => ({
      'Mat. BAC': s.mat_bac,
      'Année du bac': s.annee_bac,
      'Mat. Etudiant': s.mat_etudiant,
      "Sit. d'ins.": s.sit_ins,
      'Spécialité': s.specialite,
      'Nom': s.last_name,
      'Prénom': s.first_name,
      'Téléphone': s.phone,
      'USER': s.username,
      'MAIL': s.email,
      'Section': s.section,
      'Groupe': s.groupe,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Étudiants');
    XLSX.writeFile(wb, `طلبة_${filterSpec || 'كل'}_${new Date().toLocaleDateString('fr')}.xlsx`);
  }

  async function deleteAllStudents() {
    setDeleting(true);
    await supabase.from('students').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setStudents([]);
    setConfirmDelete(false);
    setDeleting(false);
  }

  async function saveEdit() {
    if (!editStudent) return;
    setSaving(true);
    await supabase.from('students').update({
      last_name: editStudent.last_name,
      first_name: editStudent.first_name,
      specialite: editStudent.specialite,
      phone: editStudent.phone,
      email: editStudent.email,
      section: editStudent.section,
      groupe: editStudent.groupe,
      ...(newPassword ? { password: newPassword } : {}),
    }).eq('id', editStudent.id);
    setStudents(prev => prev.map(s => s.id === editStudent.id ? { ...editStudent } : s));
    setEditStudent(null);
    setNewPassword('');
    setSaving(false);
  }

  const filtered = students.filter(s => {
    const matchSearch = !search || `${s.last_name} ${s.first_name} ${s.username} ${s.mat_etudiant}`.toLowerCase().includes(search.toLowerCase());
    const matchSpec = !filterSpec || s.specialite === filterSpec;
    return matchSearch && matchSpec;
  });

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const specCounts = SPECIALITES.reduce((acc, s) => { acc[s] = students.filter(st => st.specialite === s).length; return acc; }, {} as Record<string, number>);

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">إدارة الطلبة</h2>
          <p className="text-gray-500 text-sm">{students.length} طالب مسجّل</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { if (e.target.files?.[0]) importExcel(e.target.files[0]); }} />
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-50">
            <Upload className="w-4 h-4" /> {importing ? 'جارٍ الاستيراد...' : 'استيراد Excel'}
          </button>
          <button onClick={exportExcel}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-xl text-sm transition-colors">
            <Download className="w-4 h-4" /> تحميل Excel
          </button>
          <button onClick={loadStudents}
            className="flex items-center gap-2 bg-gray-100 text-gray-600 px-3 py-2 rounded-xl text-sm hover:bg-gray-200">
            <RefreshCw className="w-4 h-4" /> تحديث
          </button>
          <button onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-xl text-sm transition-colors">
            <X className="w-4 h-4" /> حذف الكل
          </button>
        </div>
      </div>

      {importMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${importMsg.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700'}`}>
          {importMsg}
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="بحث بالاسم أو رقم التسجيل..."
            className="w-full border border-gray-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
        </div>
        <select value={filterSpec} onChange={e => { setFilterSpec(e.target.value); setPage(0); }}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-white">
          <option value="">كل التخصصات ({students.length})</option>
          {SPECIALITES.map(s => <option key={s} value={s}>{s} ({specCounts[s] || 0})</option>)}
        </select>
      </div>

      <p className="text-xs text-gray-400">{filtered.length} نتيجة — صفحة {page+1}/{Math.max(1,totalPages)}</p>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['اللقب والاسم', 'التخصص', 'م/ف', 'اسم المستخدم', 'الهاتف', 'إجراءات'].map(h => (
                  <th key={h} className="text-right px-4 py-3 text-xs font-bold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">جارٍ التحميل...</td></tr>
              ) : paginated.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">لا توجد نتائج</td></tr>
              ) : paginated.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{s.last_name} {s.first_name}</p>
                    <p className="text-xs text-gray-400">{s.mat_etudiant}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{s.specialite}</td>
                  <td className="px-4 py-3 text-xs text-center">
                    {s.section ? <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">م{s.section}/ف{s.groupe}</span> : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[#1a3a6b]">{s.username || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.phone || '—'}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => { setEditStudent(s); setNewPassword(''); }}
                      className="text-gray-400 hover:text-[#1a3a6b] transition-colors p-1">
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
            className="px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40">السابق</button>
          <span className="px-3 py-1.5 text-sm text-gray-500">{page+1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1}
            className="px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40">التالي</button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <X className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="font-bold text-gray-800 text-lg">حذف جميع الطلبة</h3>
              <p className="text-gray-500 text-sm mt-1">سيتم حذف <span className="font-bold text-red-500">{students.length}</span> طالب نهائياً. هذا الإجراء لا يمكن التراجع عنه.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={deleteAllStudents} disabled={deleting}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50">
                {deleting ? 'جارٍ الحذف...' : 'تأكيد الحذف'}
              </button>
              <button onClick={() => setConfirmDelete(false)} disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {editStudent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditStudent(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">تعديل بيانات الطالب</h3>
              <button onClick={() => setEditStudent(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">اللقب</label>
                  <input value={editStudent.last_name} onChange={e => setEditStudent({...editStudent, last_name: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الاسم</label>
                  <input value={editStudent.first_name} onChange={e => setEditStudent({...editStudent, first_name: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">التخصص</label>
                <select value={editStudent.specialite} onChange={e => setEditStudent({...editStudent, specialite: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-white focus:ring-2 focus:ring-[#1a3a6b]/30">
                  {SPECIALITES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">المجموعة</label>
                  <input type="number" value={editStudent.section || ''} onChange={e => setEditStudent({...editStudent, section: Number(e.target.value) || null})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">الفوج</label>
                  <input type="number" value={editStudent.groupe || ''} onChange={e => setEditStudent({...editStudent, groupe: Number(e.target.value) || null})}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">الهاتف</label>
                <input value={editStudent.phone || ''} onChange={e => setEditStudent({...editStudent, phone: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1"><Key className="w-3 h-3" /> كلمة مرور جديدة (اختياري)</label>
                <input value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="اتركه فارغاً للإبقاء على كلمة المرور الحالية"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveEdit} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 bg-[#1a3a6b] text-white py-2 rounded-xl text-sm font-bold disabled:opacity-50">
                <Check className="w-4 h-4" /> {saving ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
              <button onClick={() => setEditStudent(null)}
                className="flex-1 py-2 rounded-xl text-sm border border-gray-200 text-gray-600">إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
