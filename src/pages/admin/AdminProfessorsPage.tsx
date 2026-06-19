import { useState, useEffect } from 'react';
import { supabase, callEdgeFunction } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import type { Professor, ProfessorRank } from '../../types';
import { PROFESSOR_RANKS, HIGHEST_DEGREES } from '../../types';
import {
  UserPlus, Search, Lock, Unlock, Pencil,
  CheckCircle, AlertCircle, X, Save, RefreshCw, Download, Trash2
} from 'lucide-react';

const emptyForm = {
  last_name: '',
  first_name: '',
  rank: 'أستاذ مساعد - أ' as ProfessorRank,
  professional_experience: 0,
  highest_degree: 'دكتوراه',
  degree_speciality: '',
  degree_title: '',
  email: '',
};

export default function AdminProfessorsPage() {
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [newCredentials, setNewCredentials] = useState<{ username: string; password: string } | null>(null);

  const [form, setForm] = useState(emptyForm);

  // تحديد متعدد
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);

  useEffect(() => { loadProfessors(); }, []);

  async function loadProfessors() {
    setLoading(true);
    const { data } = await supabase.from('professors').select('*').order('last_name');
    if (data) setProfessors(data);
    setLoading(false);
  }

  function resetForm() {
    setForm(emptyForm);
    setShowForm(false);
    setEditingId(null);
    setNewCredentials(null);
  }

  function startEdit(prof: Professor) {
    setForm({
      last_name: prof.last_name,
      first_name: prof.first_name,
      rank: prof.rank,
      professional_experience: prof.professional_experience,
      highest_degree: prof.highest_degree,
      degree_speciality: prof.degree_speciality || '',
      degree_title: prof.degree_title || '',
      email: prof.email || '',
    });
    setEditingId(prof.id);
    setNewCredentials(null);
    setShowForm(true);
  }

  async function handleCreate() {
    if (!form.last_name.trim() || !form.first_name.trim()) {
      setMessage({ type: 'error', text: 'اللقب والاسم مطلوبان' });
      return;
    }
    setSaving(true);
    try {
      const existingUsernames = professors.map(p => p.username);
      const numbers = existingUsernames.map(u => parseInt(u)).filter(n => !isNaN(n));
      const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;

      const result = await callEdgeFunction('create-professor', {
        ...form,
        last_name: form.last_name.trim(),
        first_name: form.first_name.trim(),
        username_index: maxNum + 1,
      });

      setNewCredentials({ username: result.username, password: result.password });
      setMessage({ type: 'success', text: `تم إنشاء حساب الأستاذ ${form.last_name} ${form.first_name} بنجاح` });
      await loadProfessors();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'حدث خطأ أثناء الإنشاء' });
    }
    setSaving(false);
  }

  async function handleUpdate() {
    if (!editingId) return;
    if (!form.last_name.trim() || !form.first_name.trim()) {
      setMessage({ type: 'error', text: 'اللقب والاسم مطلوبان' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('professors').update({
      last_name: form.last_name.trim(),
      first_name: form.first_name.trim(),
      rank: form.rank,
      professional_experience: form.professional_experience,
      highest_degree: form.highest_degree,
      degree_speciality: form.degree_speciality,
      degree_title: form.degree_title,
      email: form.email,
    }).eq('id', editingId);

    if (error) {
      setMessage({ type: 'error', text: 'حدث خطأ أثناء التعديل' });
    } else {
      setMessage({ type: 'success', text: 'تم تعديل بيانات الأستاذ بنجاح' });
      resetForm();
      await loadProfessors();
    }
    setSaving(false);
  }

  async function handleToggleLock(prof: Professor) {
    const newVal = !prof.wishes_locked_s1;
    const { error } = await supabase
      .from('professors')
      .update({ wishes_locked_s1: newVal })
      .eq('id', prof.id);
    if (!error) {
      setMessage({ type: 'success', text: newVal ? 'تم إغلاق رغبات الأستاذ' : 'تم فتح رغبات الأستاذ' });
      await loadProfessors();
    }
  }

  async function handleResetPassword(prof: Professor) {
    try {
      const result = await callEdgeFunction('reset-professor-password', { user_id: prof.user_id });
      setNewCredentials({ username: prof.username, password: result.password });
      setMessage({ type: 'success', text: 'تم إعادة تعيين كلمة المرور' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
  }

  // ── الحذف ──
  function askDeleteOne(prof: Professor) {
    setConfirmDelete({ ids: [prof.id], label: `${prof.last_name} ${prof.first_name}` });
  }

  function askDeleteSelected() {
    if (selected.size === 0) return;
    setConfirmDelete({ ids: Array.from(selected), label: `${toArabicNum(selected.size)} أستاذ محدّد` });
  }

  function askDeleteAll() {
    if (filtered.length === 0) return;
    setConfirmDelete({ ids: filtered.map(p => p.id), label: `جميع الأساتذة المعروضين (${toArabicNum(filtered.length)})` });
  }

  async function confirmDeleteAction() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await callEdgeFunction('delete-professor', { professor_ids: confirmDelete.ids });
      setMessage({ type: 'success', text: `تم حذف ${confirmDelete.label} بنجاح` });
      setSelected(new Set());
      await loadProfessors();
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'حدث خطأ أثناء الحذف' });
    }
    setDeleting(false);
    setConfirmDelete(null);
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(p => p.id)));
    }
  }

  const filtered = professors.filter(p =>
    `${p.last_name} ${p.first_name} ${p.username}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">إدارة الأساتذة</h2>
          <p className="text-gray-500 text-sm">{toArabicNum(professors.length)} أستاذ مسجّل</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-[#1a3a6b] text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-[#0d2040] transition-colors">
          <UserPlus className="w-4 h-4" />
          إضافة أستاذ
        </button>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
          <button onClick={() => setMessage(null)} className="mr-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {newCredentials && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5">
          <h4 className="font-bold text-amber-800 mb-3">🔑 بيانات الدخول — سلّمها للأستاذ</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'اسم المستخدم', value: newCredentials.username },
              { label: 'كلمة المرور', value: newCredentials.password },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-xl p-3 border border-amber-200">
                <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                <p className="font-mono font-bold text-gray-800 text-lg">{item.value}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(`اسم المستخدم: ${newCredentials.username}\nكلمة المرور: ${newCredentials.password}`)}
            className="mt-3 flex items-center gap-2 text-amber-700 text-xs hover:text-amber-900">
            <Download className="w-3.5 h-3.5" /> نسخ بيانات الدخول
          </button>
          <button onClick={() => setNewCredentials(null)} className="mt-2 text-xs text-gray-400 hover:text-gray-600 block">إغلاق</button>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border-2 border-[#1a3a6b]/20 animate-slide-up">
          <h3 className="font-bold text-gray-800 mb-4 font-display flex items-center gap-2">
            {editingId ? <Pencil className="w-5 h-5 text-[#1a3a6b]" /> : <UserPlus className="w-5 h-5 text-[#1a3a6b]" />}
            {editingId ? 'تعديل بيانات أستاذ' : 'إضافة أستاذ جديد'}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {[
              { label: 'اللقب *', key: 'last_name', placeholder: 'بن علي' },
              { label: 'الاسم *', key: 'first_name', placeholder: 'محمد' },
              { label: 'البريد الإلكتروني', key: 'email', placeholder: 'exemple@univ-bbm.dz' },
              { label: 'تخصص الشهادة', key: 'degree_speciality', placeholder: 'قانون جنائي' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-sm text-gray-600 mb-1 block">{f.label}</label>
                <input
                  type="text"
                  value={(form as any)[f.key]}
                  onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50" />
              </div>
            ))}
            <div>
              <label className="text-sm text-gray-600 mb-1 block">الرتبة العلمية</label>
              <select value={form.rank} onChange={e => setForm({ ...form, rank: e.target.value as ProfessorRank })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50">
                {PROFESSOR_RANKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">آخر شهادة</label>
              <select value={form.highest_degree} onChange={e => setForm({ ...form, highest_degree: e.target.value })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50">
                {HIGHEST_DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1 block">الخبرة (سنوات)</label>
              <input type="number" min="0" value={form.professional_experience}
                onChange={e => setForm({ ...form, professional_experience: parseInt(e.target.value) || 0 })}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50" dir="ltr" />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-sm text-gray-600 mb-1 block">عنوان الشهادة</label>
            <textarea value={form.degree_title} onChange={e => setForm({ ...form, degree_title: e.target.value })}
              rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50 resize-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={editingId ? handleUpdate : handleCreate} disabled={saving}
              className="flex items-center gap-2 bg-[#1a3a6b] text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-[#0d2040] transition-colors disabled:opacity-50">
              <Save className="w-4 h-4" />
              {saving ? 'جارٍ الحفظ...' : editingId ? 'حفظ التعديلات' : 'إنشاء الحساب'}
            </button>
            <button onClick={resetForm}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition-colors">
              <X className="w-4 h-4" /> إلغاء
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو اسم المستخدم..."
            className="w-full border border-gray-200 rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-white" />
        </div>

        {selected.size > 0 && (
          <button onClick={askDeleteSelected}
            className="flex items-center gap-2 bg-red-50 text-red-600 border border-red-200 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors">
            <Trash2 className="w-4 h-4" /> حذف المحدّدين ({toArabicNum(selected.size)})
          </button>
        )}

        {filtered.length > 0 && (
          <button onClick={askDeleteAll}
            className="flex items-center gap-2 text-gray-400 border border-gray-200 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 hover:text-red-500 hover:border-red-200 transition-colors">
            <Trash2 className="w-4 h-4" /> حذف الكل
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-10">
            <svg className="animate-spin h-6 w-6 text-[#1a3a6b]" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox"
                      checked={filtered.length > 0 && selected.size === filtered.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 accent-[#1a3a6b]" />
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الأستاذ</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الرتبة</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">رقم المستخدم</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الرغبات</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(prof => (
                  <tr key={prof.id} className={`hover:bg-gray-50/50 transition-colors ${selected.has(prof.id) ? 'bg-[#1a3a6b]/5' : ''}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox"
                        checked={selected.has(prof.id)}
                        onChange={() => toggleSelect(prof.id)}
                        className="w-4 h-4 accent-[#1a3a6b]" />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{prof.last_name} {prof.first_name}</p>
                      <p className="text-gray-400 text-xs">{prof.degree_speciality || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-lg">{prof.rank}</span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs text-[#1a3a6b] bg-[#1a3a6b]/5 px-2 py-1 rounded font-bold">{prof.username}</code>
                    </td>
                    <td className="px-4 py-3">
                      {prof.wishes_locked_s1 ? (
                        <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                          <Lock className="w-3 h-3" /> مؤكدة
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                          <CheckCircle className="w-3 h-3" /> مفتوحة
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => startEdit(prof)}
                          title="تعديل البيانات"
                          className="p-1.5 text-gray-400 hover:text-[#1a3a6b] hover:bg-[#1a3a6b]/5 rounded-lg transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleToggleLock(prof)}
                          title={prof.wishes_locked_s1 ? 'فتح الرغبات' : 'إغلاق الرغبات'}
                          className="p-1.5 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors">
                          {prof.wishes_locked_s1 ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleResetPassword(prof)}
                          title="إعادة تعيين كلمة المرور"
                          className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors">
                          <RefreshCw className="w-4 h-4" />
                        </button>
                        <button onClick={() => askDeleteOne(prof)}
                          title="حذف الأستاذ"
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">لا توجد نتائج</div>}
          </div>
        )}
      </div>

      {/* Confirm Delete Dialog */}
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
              هل أنت متأكد من حذف <strong>{confirmDelete.label}</strong>؟ سيُحذف الحساب وكل رغباته وإسناداته نهائياً.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors">
                إلغاء
              </button>
              <button
                onClick={confirmDeleteAction}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50">
                {deleting ? 'جارٍ الحذف...' : 'حذف نهائياً'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
