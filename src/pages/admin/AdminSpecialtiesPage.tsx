import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import type { Specialty, SpecialtyBranch } from '../../types';
import { SPECIALTY_BRANCHES } from '../../types';
import { Plus, Trash2, Save, X, Pencil, CheckCircle, AlertCircle, BookOpen } from 'lucide-react';

const emptyForm = { name_ar: '', branch: 'قانون عام' as SpecialtyBranch };

const BRANCH_COLORS: Record<SpecialtyBranch, { bg: string; text: string }> = {
  'قانون عام':    { bg: 'bg-[#1a3a6b]/08', text: 'text-[#1a3a6b]' },
  'قانون خاص':    { bg: 'bg-[#c9a227]/12', text: 'text-[#a07820]' },
  'قانون جنائي':  { bg: 'bg-red-50',        text: 'text-red-700'  },
  'أخرى':         { bg: 'bg-purple-50',     text: 'text-purple-700' },
  'علوم سياسية':  { bg: 'bg-cyan-50',       text: 'text-cyan-700' },
  'علم الاجتماع': { bg: 'bg-emerald-50',    text: 'text-emerald-700' },
};

export default function AdminSpecialtiesPage() {
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [msg, setMsg] = useState<{ t: 's' | 'e'; m: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Specialty | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const { data } = await supabase.from('specialties').select('*').eq('is_active', true).order('display_order');
    if (data) setSpecialties(data);
    setLoading(false);
  }

  function showMsg(t: 's' | 'e', m: string) {
    setMsg({ t, m });
    setTimeout(() => setMsg(null), 3000);
  }

  function resetForm() {
    setForm(emptyForm);
    setShowForm(false);
    setEditingId(null);
  }

  function startEdit(s: Specialty) {
    setForm({ name_ar: s.name_ar, branch: s.branch });
    setEditingId(s.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name_ar.trim()) { showMsg('e', 'اسم التخصص مطلوب'); return; }
    setSaving(true);

    if (editingId) {
      const { error } = await supabase.from('specialties')
        .update({ name_ar: form.name_ar.trim(), branch: form.branch })
        .eq('id', editingId);
      if (error) {
        showMsg('e', error.message.includes('duplicate') ? 'هذا التخصص موجود بالفعل' : 'حدث خطأ أثناء التعديل');
      } else {
        showMsg('s', 'تم تعديل التخصص بنجاح');
        resetForm();
        await loadData();
      }
    } else {
      const maxOrder = specialties.length > 0 ? Math.max(...specialties.map(s => s.display_order)) : 0;
      const { error } = await supabase.from('specialties')
        .insert({ name_ar: form.name_ar.trim(), branch: form.branch, display_order: maxOrder + 1 });
      if (error) {
        showMsg('e', error.message.includes('duplicate') ? 'هذا التخصص موجود بالفعل' : 'حدث خطأ أثناء الإضافة');
      } else {
        showMsg('s', `تمت إضافة "${form.name_ar}" بنجاح`);
        resetForm();
        await loadData();
      }
    }
    setSaving(false);
  }

  async function confirmDeleteAction() {
    if (!confirmDelete) return;
    const { error } = await supabase.from('specialties').update({ is_active: false }).eq('id', confirmDelete.id);
    if (!error) {
      showMsg('s', `تم حذف "${confirmDelete.name_ar}"`);
      await loadData();
    } else {
      showMsg('e', 'حدث خطأ أثناء الحذف');
    }
    setConfirmDelete(null);
  }

  const grouped = SPECIALTY_BRANCHES.map(branch => ({
    branch,
    items: specialties.filter(s => s.branch === branch),
  })).filter(g => g.items.length > 0 || true);

  if (loading) return (
    <div className="flex justify-center py-10">
      <div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display font-bold text-gray-900 text-xl">التخصصات العلمية</h2>
          <p className="text-gray-500 text-sm">
            {toArabicNum(specialties.length)} تخصص — القائمة المرجعية المستخدمة في ملفات الأساتذة وتخصصات المقاييس
          </p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0d2040] text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> تخصص جديد
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${msg.t === 's' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.t === 's' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.m}
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl p-5 border-2 border-[#1a3a6b]/20 shadow-sm animate-slide-up">
          <h3 className="font-display font-semibold text-gray-800 text-sm mb-4 flex items-center gap-2">
            {editingId ? <Pencil className="w-4 h-4 text-[#1a3a6b]" /> : <Plus className="w-4 h-4 text-[#1a3a6b]" />}
            {editingId ? 'تعديل تخصص' : 'إضافة تخصص جديد'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">اسم التخصص *</label>
              <input value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))}
                placeholder="مثال: القانون البيئي"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-gray-50" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">الفرع</label>
              <select value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value as SpecialtyBranch }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none bg-gray-50">
                {SPECIALTY_BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 bg-[#1a3a6b] text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50">
              <Save className="w-3.5 h-3.5" /> {saving ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديلات' : 'إضافة'}
            </button>
            <button onClick={resetForm} className="flex items-center gap-1.5 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-sm">
              <X className="w-3.5 h-3.5" /> إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {grouped.map(({ branch, items }) => items.length > 0 && (
          <div key={branch} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <BookOpen className={`w-4 h-4 ${BRANCH_COLORS[branch].text}`} />
              <h3 className="font-display font-semibold text-gray-700 text-sm">{branch}</h3>
              <span className="text-xs text-gray-400">({toArabicNum(items.length)})</span>
            </div>
            <div className="divide-y divide-gray-50">
              {items.map(s => (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/50 transition-colors">
                  <span className={`text-sm px-2.5 py-1 rounded-lg ${BRANCH_COLORS[branch].bg} ${BRANCH_COLORS[branch].text} font-medium`}>
                    {s.name_ar}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(s)}
                      className="p-1.5 text-gray-300 hover:text-[#1a3a6b] hover:bg-[#1a3a6b]/5 rounded-lg transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setConfirmDelete(s)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" dir="rtl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 font-display">تأكيد الحذف</h3>
                <p className="text-xs text-gray-500">هذا الإجراء لا يمكن التراجع عنه</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-5">
              هل أنت متأكد من حذف تخصص <strong>{confirmDelete.name_ar}</strong>؟
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                إلغاء
              </button>
              <button onClick={confirmDeleteAction}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors">
                حذف نهائياً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
