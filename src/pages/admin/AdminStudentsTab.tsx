import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Upload, Download, RefreshCw, Edit2, Key, X, Check, Plus } from 'lucide-react';
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
  mat_etudiant: string;
  specialite: string;
  phone: string;
  last_name: string;
  first_name: string;
  username: string;
  email: string;
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
  const fileRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 50;

  useEffect(() => { loadStudents(); }, []);

  async function loadStudents() {
    setLoading(true);
    const { data } = await supabase.from('students').select('*').order('last_name');
    if (data) setStudents(data);
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
      setImportMsg(`قراءة ${rows.length} طالب...`);

      const toInsert = rows.map((r: any) => ({
        mat_bac: String(r['Mat. BAC'] || '').trim(),
        mat_etudiant: String(r['Mat. Etudiant'] || '').trim(),
        specialite: String(r['specialité'] || r['specialite'] || '').trim(),
        phone: String(r['N° de téléphone'] || '').trim(),
        last_name: String(r['Nom'] || r['اللقب'] || '').trim(),
        first_name: String(r['Prénom'] || r['الإسم'] || '').trim(),
        carte_rfid: String(r['carte rfid'] || '').trim(),
        username: String(r['USER'] || '').trim(),
        password: String(r['PASSWORD'] || '').trim(),
        email: String(r['MAIL'] || '').trim(),
      })).filter(s => s.mat_etudiant || s.last_name || s.username);

      // إدخال دفعات
      const BATCH = 500;
      let inserted = 0;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH);
        await supabase.from('students').insert(batch).then(({ error }) => { if (error) console.log('batch error:', error.message); });
        inserted += batch.length;
        setImportMsg(`تم استيراد ${inserted}/${toInsert.length}...`);
      }
      setImportMsg(`✓ تم استيراد ${inserted} طالب بنجاح`);
      await loadStudents();
    } catch (e: any) {
      setImportMsg('خطأ: ' + e.message);
    }
    setImporting(false);
  }

  function exportExcel() {
    const data = filtered.map(s => ({
      'Mat. BAC': s.mat_bac,
      'Mat. Etudiant': s.mat_etudiant,
      'Spécialité': s.specialite,
      'Nom': s.last_name,
      'Prénom': s.first_name,
      'Téléphone': s.phone,
      'USER': s.username,
      'MAIL': s.email,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Étudiants');
    XLSX.writeFile(wb, `طلبة_${filterSpec || 'كل'}_${new Date().toLocaleDateString('fr')}.xlsx`);
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
      ...(newPassword ? { password: newPassword } : {}),
    }).eq('id', editStudent.id);
    setStudents(prev => prev.map(s => s.id === editStudent.id ? { ...editStudent, ...(newPassword ? { password: newPassword } : {}) } : s));
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

  const specCounts = SPECIALITES.reduce((acc, s) => {
    acc[s] = students.filter(st => st.specialite === s).length;
    return acc;
  }, {} as Record<string, number>);

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
        </div>
      </div>

      {importMsg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${importMsg.startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
          {importMsg}
        </div>
      )}

      {/* فلاتر */}
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

      <p className="text-xs text-gray-400">{filtered.length} نتيجة — صفحة {page+1}/{totalPages}</p>

      {/* جدول */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['اللقب والاسم', 'التخصص', 'اسم المستخدم', 'البريد', 'الهاتف', 'إجراءات'].map(h => (
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
                  <td className="px-4 py-3 font-mono text-xs text-[#1a3a6b]">{s.username}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.email}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.phone}</td>
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

      {/* pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
            className="px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40">السابق</button>
          <span className="px-3 py-1.5 text-sm text-gray-500">{page+1} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1}
            className="px-3 py-1.5 rounded-xl border text-sm disabled:opacity-40">التالي</button>
        </div>
      )}

      {/* نافذة التعديل */}
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
              <div>
                <label className="text-xs text-gray-500 mb-1 block">الهاتف</label>
                <input value={editStudent.phone} onChange={e => setEditStudent({...editStudent, phone: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30" dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">البريد</label>
                <input value={editStudent.email} onChange={e => setEditStudent({...editStudent, email: e.target.value})}
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
