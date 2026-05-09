import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Settings, Save, CheckCircle, Calendar, Bell, Lock, Unlock, Eye, EyeOff } from 'lucide-react';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  async function loadSettings() {
    const { data } = await supabase
      .from('academic_settings')
      .select('*')
      .eq('academic_year', '2026-2027')
      .single();
    if (data) setSettings(data);
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    const { error } = await supabase
      .from('academic_settings')
      .update({
        registration_open: settings.registration_open,
        registration_deadline: settings.registration_deadline,
        results_published: settings.results_published,
        appeals_open: settings.appeals_open,
        appeals_deadline: settings.appeals_deadline,
        platform_title: settings.platform_title,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settings.id);

    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 3000); }
    setSaving(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <svg className="animate-spin h-6 w-6 text-[#1a3a6b]" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">إعدادات المنصة</h2>
        <p className="text-gray-500 text-sm">الموسم الجامعي 2026/2027</p>
      </div>

      <div className="space-y-4">
        {/* Registration Toggle */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4 font-display text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#1a3a6b]" />
            حالة التسجيل
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">باب التسجيل</p>
                <p className="text-xs text-gray-400">السماح للأساتذة بتسجيل رغباتهم</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, registration_open: !settings.registration_open })}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  settings.registration_open
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
              >
                {settings.registration_open ? (
                  <><Unlock className="w-4 h-4" />مفتوح — اضغط للإغلاق</>
                ) : (
                  <><Lock className="w-4 h-4" />مغلق — اضغط للفتح</>
                )}
              </button>
            </div>

            <div>
              <label className="text-sm text-gray-600 mb-1.5 block">الموعد النهائي للتسجيل</label>
              <input
                type="datetime-local"
                value={settings.registration_deadline ? settings.registration_deadline.slice(0, 16) : ''}
                onChange={e => setSettings({ ...settings, registration_deadline: e.target.value })}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4 font-display text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#c9a227]" />
            إعلان النتائج
          </h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">نشر نتائج الإسناد</p>
              <p className="text-xs text-gray-400">السماح للأساتذة برؤية نتائج الإسناد</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, results_published: !settings.results_published })}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                settings.results_published
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {settings.results_published ? (
                <><Eye className="w-4 h-4" />منشورة</>
              ) : (
                <><EyeOff className="w-4 h-4" />غير منشورة</>
              )}
            </button>
          </div>
        </div>

        {/* Appeals */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4 font-display text-sm flex items-center gap-2">
            <Bell className="w-4 h-4 text-red-500" />
            الطعون
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">باب الطعون</p>
                <p className="text-xs text-gray-400">السماح للأساتذة بتقديم الطعون</p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, appeals_open: !settings.appeals_open })}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  settings.appeals_open
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {settings.appeals_open ? <><Unlock className="w-4 h-4" />مفتوح</> : <><Lock className="w-4 h-4" />مغلق</>}
              </button>
            </div>
            <div>
              <label className="text-sm text-gray-600 mb-1.5 block">الموعد النهائي للطعون</label>
              <input
                type="datetime-local"
                value={settings.appeals_deadline ? settings.appeals_deadline.slice(0, 16) : ''}
                onChange={e => setSettings({ ...settings, appeals_deadline: e.target.value })}
                className="border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        {/* Platform Title */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-800 mb-4 font-display text-sm flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-500" />
            إعدادات عامة
          </h3>
          <div>
            <label className="text-sm text-gray-600 mb-1.5 block">عنوان المنصة</label>
            <input
              type="text"
              value={settings.platform_title}
              onChange={e => setSettings({ ...settings, platform_title: e.target.value })}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a6b]/30 bg-gray-50"
            />
          </div>
        </div>

        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            تم حفظ الإعدادات بنجاح
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-[#1a3a6b] text-white px-6 py-3 rounded-xl font-medium hover:bg-[#0d2040] transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saving ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </div>
    </div>
  );
}
