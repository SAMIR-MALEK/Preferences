import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { toArabicNum } from '../../lib/utils';
import { runAssignment, type AssignmentResult, type ConflictGroup } from '../../lib/assignmentAlgorithm';
import {
  Play, CheckCircle, AlertCircle, Clock, Users,
  Award, Trash2, ChevronDown, ChevronUp, UserCheck
} from 'lucide-react';

const ACADEMIC_YEAR = '2026-2027';

export default function AdminAssignmentPage() {
  const [semester, setSemester] = useState<1 | 2>(1);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [results, setResults] = useState<{
    assignments: AssignmentResult[];
    conflicts: ConflictGroup[];
    unassigned: { professor_id: string; professor_name: string }[];
    stats: { total: number; assigned: number; pending: number; unassigned: number };
  } | null>(null);
  const [expandedConflict, setExpandedConflict] = useState<number | null>(null);

  // حسم تصادم يدوياً: الإدارة تختار الأستاذ الفائز
  async function resolveConflict(conflict: ConflictGroup, winnerProfId: string) {
    setSaving(true);
    const winner = conflict.candidates.find(c => c.professor_id === winnerProfId)!;

    const { error } = await supabase.from('assignments').insert({
      professor_id: winnerProfId,
      module_id: conflict.module_id,
      level_id: conflict.level_id,
      academic_year: ACADEMIC_YEAR,
      semester,
      teaching_type: conflict.teaching_type,
      section_number: conflict.section_number,
      group_number: conflict.group_number,
      weekly_hours: conflict.teaching_type === 'محاضرة' ? 2.25 : 1.5,
      wish_order_satisfied: winner.wish_order,
      status: 'assigned',
      conflict_resolved: true,
      score: null,
    });

    if (!error) {
      setMessage({ type: 'success', text: `تم حسم التصادم وإسناد ${winner.professor_name} للمقياس` });
      setResults(prev => prev ? {
        ...prev,
        conflicts: prev.conflicts.filter(c =>
          !(c.module_id === conflict.module_id && c.section_number === conflict.section_number && c.group_number === conflict.group_number)
        ),
        stats: { ...prev.stats, pending: prev.stats.pending - conflict.candidates.length },
      } : null);
    } else {
      setMessage({ type: 'error', text: 'حدث خطأ أثناء حسم التصادم' });
    }
    setSaving(false);
  }

  async function runAlgorithm() {
    setRunning(true);
    setMessage(null);
    setResults(null);

    try {
      // جلب البيانات اللازمة
      const [
        { data: professors },
        { data: wishes },
        { data: modules },
        { data: levelSemesters },
      ] = await Promise.all([
        supabase.from('professors').select('id, last_name, first_name, rank, professional_experience, degree_speciality'),
        supabase.from('wishes').select('*').eq('semester', semester).eq('academic_year', ACADEMIC_YEAR).lte('wish_order', 5),
        supabase.from('modules').select('*').eq('semester', semester).eq('is_active', true),
        supabase.from('level_semesters').select('*').eq('semester', semester),
      ]);

      if (!professors || !wishes || !modules || !levelSemesters) {
        throw new Error('فشل تحميل البيانات من قاعدة البيانات');
      }

      if (wishes.length === 0) {
        throw new Error('لا توجد رغبات مسجَّلة لهذا السداسي بعد');
      }

      // حذف النتائج القديمة لهذا السداسي
      await supabase.from('assignments').delete()
        .eq('academic_year', ACADEMIC_YEAR)
        .eq('semester', semester);

      // تشغيل الخوارزمية
      const result = runAssignment(professors, wishes, modules, levelSemesters, semester, ACADEMIC_YEAR);

      // حفظ النتائج المُسنَدة في القاعدة
      if (result.assignments.length > 0) {
        const toInsert = result.assignments.map(a => ({
          professor_id: a.professor_id,
          module_id: a.module_id,
          level_id: a.level_id,
          academic_year: ACADEMIC_YEAR,
          semester,
          teaching_type: a.teaching_type,
          section_number: a.section_number,
          group_number: a.group_number,
          weekly_hours: a.weekly_hours,
          wish_order_satisfied: a.wish_order_satisfied,
          status: a.status,
          conflict_resolved: a.conflict_resolved,
          score: null,
        }));
        await supabase.from('assignments').insert(toInsert);
      }

      setResults(result);
      setMessage({
        type: result.conflicts.length > 0 ? 'error' : 'success',
        text: `اكتمل الإسناد — ${toArabicNum(result.stats.assigned)} مُسنَد، ${toArabicNum(result.stats.pending)} معلّق (تصادم)، ${toArabicNum(result.stats.unassigned)} بدون إسناد`,
      });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
    setRunning(false);
  }

  return (
    <div className="space-y-5 animate-fade-in pb-8" dir="rtl">
      <div>
        <h2 className="text-xl font-bold text-gray-900 font-display">خوارزمية الإسناد البيداغوجي</h2>
        <p className="text-gray-500 text-sm mt-1">إسناد المقاييس على الأساتذة وفق رغباتهم بالأولوية، مع مراعاة الطاقة الاستيعابية لكل مستوى</p>
      </div>

      {/* اختيار السداسي وزر التشغيل */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center gap-4 flex-wrap">
        <div className="flex gap-2">
          {([1, 2] as const).map(s => (
            <button key={s} onClick={() => { setSemester(s); setResults(null); setMessage(null); }}
              className="px-5 py-2.5 rounded-xl text-sm font-medium border-2 transition-all"
              style={{
                background: semester === s ? '#1a3a6b' : 'white',
                color: semester === s ? 'white' : '#6b7280',
                borderColor: semester === s ? '#1a3a6b' : '#e5e7eb',
              }}>
              السداسي {s === 1 ? 'الأول' : 'الثاني'}
            </button>
          ))}
        </div>
        <div className="mr-auto flex items-center gap-3">
          <div className="text-xs text-gray-400 space-y-0.5">
            <p>المنطق: جولات ①→⑤، طاقة استيعابية حسب المجموعات</p>
            <p>الفصل عند التصادم: تخصص → خبرة → أقدمية → رتبة</p>
          </div>
          <button onClick={runAlgorithm} disabled={running}
            className="flex items-center gap-2 bg-[#1a3a6b] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d2040] transition-colors disabled:opacity-50">
            <Play className="w-4 h-4" />
            {running ? 'جارٍ الحساب...' : 'تشغيل الخوارزمية'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {results && (
        <>
          {/* الإحصاءات */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'إجمالي الأساتذة', value: results.stats.total, color: '#1a3a6b', icon: Users },
              { label: 'مُسنَد بنجاح', value: results.stats.assigned, color: '#16a34a', icon: CheckCircle },
              { label: 'معلّق (تصادم)', value: results.stats.pending, color: '#d97706', icon: AlertCircle },
              { label: 'بدون إسناد', value: results.stats.unassigned, color: '#dc2626', icon: Clock },
            ].map((stat, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-center">
                <p className="text-2xl font-bold font-display" style={{ color: stat.color }}>{toArabicNum(stat.value)}</p>
                <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* التصادمات المعلّقة */}
          {results.conflicts.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display font-bold text-amber-700 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                تصادمات تحتاج قراراً يدوياً ({toArabicNum(results.conflicts.length)})
              </h3>
              <p className="text-xs text-gray-500">هؤلاء الأساتذة متساوون تماماً في كل المعايير على نفس الفرصة — اختر من تريد إسناد هذه الفرصة له.</p>
              {results.conflicts.map((conflict, i) => (
                <div key={i} className="bg-white rounded-2xl border-2 border-amber-200 overflow-hidden">
                  <button onClick={() => setExpandedConflict(expandedConflict === i ? null : i)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-amber-50/50 transition-colors text-right">
                    <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800 text-sm">{conflict.module_name}</p>
                      <p className="text-xs text-gray-500">
                        {conflict.teaching_type} — مجموعة {toArabicNum(conflict.section_number)}
                        {conflict.group_number ? ` / فوج ${toArabicNum(conflict.group_number)}` : ''}
                        {' — '}{toArabicNum(conflict.candidates.length)} متنافسون
                      </p>
                    </div>
                    {expandedConflict === i ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>

                  {expandedConflict === i && (
                    <div className="border-t border-amber-100 p-4 space-y-3">
                      {conflict.candidates.map(c => (
                        <div key={c.professor_id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                          <div className="flex-1">
                            <p className="font-semibold text-gray-800 text-sm">{c.professor_name}</p>
                            <div className="flex gap-2 mt-1 flex-wrap">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${c.speciality_match ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {c.speciality_match ? '✓ تخصص متطابق' : '✗ لا يطابق التخصص'}
                              </span>
                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                خبرة سابقة: {toArabicNum(c.experience_years)} سنة
                              </span>
                              <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                                أقدمية: {toArabicNum(c.professional_experience)} سنة
                              </span>
                            </div>
                          </div>
                          <button onClick={() => resolveConflict(conflict, c.professor_id)}
                            disabled={saving}
                            className="flex items-center gap-1.5 bg-[#1a3a6b] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#0d2040] transition-colors disabled:opacity-50 flex-shrink-0">
                            <UserCheck className="w-3.5 h-3.5" />
                            اختيار هذا الأستاذ
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* الأساتذة بدون إسناد */}
          {results.unassigned.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
              <h3 className="font-display font-bold text-red-700 flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4" />
                أساتذة لم يُسنَد لهم أي مقياس ({toArabicNum(results.unassigned.length)})
              </h3>
              <p className="text-xs text-red-600">استُنفذت رغباتهم الخمس دون نتيجة — يُفضَّل مراجعة أسباب عدم الإسناد (المقاييس ممتلئة أو لا توجد مقاييس مطابقة).</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {results.unassigned.map(u => (
                  <span key={u.professor_id} className="text-xs bg-white border border-red-200 text-red-700 px-3 py-1 rounded-full">
                    {u.professor_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* نتائج الإسناد الناجحة */}
          {results.assignments.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <Award className="w-4 h-4 text-[#1a3a6b]" />
                <h3 className="font-display font-bold text-gray-800 text-sm">نتائج الإسناد الناجحة ({toArabicNum(results.assignments.length)})</h3>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الأستاذ</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">المقياس</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">نوع التدريس</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">المجموعة</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الرغبة</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {results.assignments.map((a, i) => {
                      const modName = a.module_id; // سيُستبدَل بالاسم الحقيقي
                      return (
                        <tr key={i} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 font-medium text-gray-800">{a.professor_name}</td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs">{modName}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${a.teaching_type === 'محاضرة' ? 'bg-[#1a3a6b]/08 text-[#1a3a6b]' : 'bg-[#c9a227]/12 text-[#a07820]'}`}>
                              {a.teaching_type}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 text-xs">
                            م.{toArabicNum(a.section_number)}{a.group_number ? ` / ف.${toArabicNum(a.group_number)}` : ''}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs font-bold text-gray-600">الرغبة {toArabicNum(a.wish_order_satisfied)}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            {a.conflict_resolved
                              ? <span className="text-xs text-amber-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> بعد تصادم</span>
                              : <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> مباشر</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
