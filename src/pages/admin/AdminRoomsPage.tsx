import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import * as XLSX from 'xlsx';
import { Upload, Plus, Save, Trash2, CheckCircle, AlertCircle, Pencil, X } from 'lucide-react';

interface Room {
  id: string;
  name: string;
  capacity: number;
  floor: number;
  type: string;
  is_active: boolean;
}

const ROOM_TYPES = ['مدرج', 'قاعة محاضرات', 'قاعة', 'مخبر'];

const emptyRoom = { name: '', capacity: 30, floor: 0, type: 'قاعة', is_active: true };

export default function AdminRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyRoom);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(emptyRoom);
  const [typeFilter, setTypeFilter] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadRooms(); }, []);

  async function loadRooms() {
    setLoading(true);
    const { data } = await supabase.from('rooms').select('*').order('floor').order('name');
    if (data) setRooms(data);
    setLoading(false);
  }

  async function addRoom() {
    if (!addForm.name.trim()) { setMessage({ type: 'error', text: 'يرجى إدخال اسم القاعة' }); return; }
    setSaving(true);
    const { error } = await supabase.from('rooms').insert(addForm);
    if (error) setMessage({ type: 'error', text: error.message });
    else { setMessage({ type: 'success', text: 'تمت إضافة القاعة' }); setAddForm(emptyRoom); setShowAddForm(false); await loadRooms(); }
    setSaving(false);
  }

  async function saveEdit() {
    if (!editForm.name.trim()) return;
    setSaving(true);
    const { error } = await supabase.from('rooms').update(editForm).eq('id', editingId!);
    if (error) setMessage({ type: 'error', text: error.message });
    else { setMessage({ type: 'success', text: 'تم التعديل' }); setEditingId(null); await loadRooms(); }
    setSaving(false);
  }

  async function deleteRoom(id: string) {
    if (!window.confirm('حذف هذه القاعة؟')) return;
    await supabase.from('rooms').update({ is_active: false }).eq('id', id);
    await loadRooms();
  }

  function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const toInsert = raw.slice(1).filter(r => r[0]).map(r => ({
        name: String(r[0] || '').trim(),
        capacity: Number(r[1]) || 30,
        floor: Number(r[2]) || 0,
        type: String(r[3] || 'قاعة').trim(),
        is_active: true,
      }));
      if (toInsert.length === 0) { setMessage({ type: 'error', text: 'لا توجد بيانات في الملف' }); return; }
      const { error } = await supabase.from('rooms').insert(toInsert);
      if (error) setMessage({ type: 'error', text: error.message });
      else { setMessage({ type: 'success', text: `تم استيراد ${toArabicNum(toInsert.length)} قاعة` }); await loadRooms(); }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  const filtered = rooms.filter(r => r.is_active && (!typeFilter || r.type === typeFilter));

  if (loading) return <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-[#1a3a6b] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 font-display">إدارة القاعات والمدرجات</h2>
          <p className="text-gray-500 text-sm mt-0.5">{toArabicNum(filtered.length)} قاعة نشطة</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
            <Upload className="w-4 h-4" /> استيراد Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleExcel} className="hidden" />
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-[#1a3a6b] hover:bg-[#0d2040] text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-colors">
            <Plus className="w-4 h-4" /> إضافة قاعة
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* نموذج إضافة */}
      {showAddForm && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
          <h3 className="font-semibold text-gray-800">قاعة جديدة</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">اسم القاعة</label>
              <input value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b]" placeholder="مثال: قاعة 5" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الطاقة الاستيعابية</label>
              <input type="number" value={addForm.capacity} onChange={e => setAddForm(f => ({ ...f, capacity: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b]" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">الطابق</label>
              <input type="number" value={addForm.floor} onChange={e => setAddForm(f => ({ ...f, floor: Number(e.target.value) }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b]" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">النوع</label>
              <select value={addForm.type} onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a3a6b] bg-white">
                {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={addRoom} disabled={saving}
              className="flex items-center gap-2 bg-[#1a3a6b] text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
              <Save className="w-4 h-4" /> حفظ
            </button>
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">إلغاء</button>
          </div>
        </div>
      )}

      {/* فلتر النوع */}
      <div className="flex gap-2 flex-wrap">
        {['', ...ROOM_TYPES].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${typeFilter === t ? 'bg-[#1a3a6b] text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'}`}>
            {t || 'الكل'}
          </button>
        ))}
      </div>

      {/* جدول القاعات */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">القاعة</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">النوع</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الطاقة</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الطابق</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(room => (
              <tr key={room.id}>
                {editingId === room.id ? (
                  <>
                    <td className="px-4 py-2">
                      <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-[#1a3a6b]" />
                    </td>
                    <td className="px-4 py-2">
                      <select value={editForm.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none">
                        {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" value={editForm.capacity} onChange={e => setEditForm(f => ({ ...f, capacity: Number(e.target.value) }))}
                        className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" value={editForm.floor} onChange={e => setEditForm(f => ({ ...f, floor: Number(e.target.value) }))}
                        className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none" />
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <button onClick={saveEdit} className="text-green-600 hover:text-green-700"><CheckCircle className="w-4 h-4" /></button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium text-gray-800">{room.name}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        room.type === 'مدرج' ? 'bg-purple-100 text-purple-700' :
                        room.type === 'قاعة محاضرات' ? 'bg-blue-100 text-blue-700' :
                        room.type === 'مخبر' ? 'bg-green-100 text-green-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>{room.type}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{toArabicNum(room.capacity)} مقعد</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">الطابق {toArabicNum(room.floor)}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingId(room.id); setEditForm({ name: room.name, capacity: room.capacity, floor: room.floor, type: room.type, is_active: room.is_active }); }}
                          className="text-gray-400 hover:text-[#1a3a6b] transition-colors"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => deleteRoom(room.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-center py-10 text-gray-400 text-sm">لا توجد قاعات — أضف من Excel أو يدوياً</p>
        )}
      </div>

      {/* تعليمات Excel */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-700">
        <strong>تنسيق ملف Excel:</strong> العمود A = اسم القاعة | B = الطاقة | C = الطابق | D = النوع (مدرج / قاعة محاضرات / قاعة / مخبر)
      </div>
    </div>
  );
}
