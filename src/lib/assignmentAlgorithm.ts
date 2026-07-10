// ══════════════════════════════════════════════════════════════════════════════
// خوارزمية الإسناد البيداغوجي — النسخة الصحيحة
// المنطق:
// - كل أستاذ له حجم ساعي أسبوعي (max_weekly_hours) يجب ملؤه
// - يُسنَد له مقاييس من رغباته بالترتيب حتى يمتلئ حجمه
// - المحاضرة = 2.25 × weekly_sessions ساعة
// - TD = 1.5 ساعة × عدد الأفواج المُسنَدة
// - التصادم: إن طلب أكثر من أستاذ نفس المقياس+نوع التدريس+نفس رقم الرغبة
//   والأفواج المتبقية لا تكفي الجميع → فرز بـ(تخصص→خبرة→أقدمية→رتبة)
// ══════════════════════════════════════════════════════════════════════════════

export interface ProfessorData {
  id: string;
  last_name: string;
  first_name: string;
  rank: string;
  professional_experience: number;
  degree_speciality: string;
  max_weekly_hours: number;
}

export interface WishData {
  professor_id: string;
  wish_order: number;
  module_id: string;
  level_id: string;
  teaching_type: 'محاضرة' | 'أعمال موجهة';
  taught_before: boolean;
  previous_years: string[];
}

export interface ModuleData {
  id: string;
  level_id: string;
  name_ar: string;
  has_lectures: boolean;
  has_td: boolean;
  semester: number;
  weekly_sessions: number; // عدد مرات التدريس في الأسبوع (1 أو 2)
  specialty_match?: string[];
}

export interface LevelSemesterData {
  level_id: string;
  semester: number;
  num_sections: number;
  num_groups: number;
}

export interface AssignmentResult {
  professor_id: string;
  professor_name: string;
  module_id: string;
  module_name: string;
  level_id: string;
  teaching_type: string;
  section_number: number;
  group_number: number | null;
  weekly_hours: number;
  wish_order_satisfied: number;
  status: 'assigned' | 'pending_conflict';
  conflict_resolved: boolean;
  score: null;
}

export interface ConflictGroup {
  module_id: string;
  module_name: string;
  level_id: string;
  teaching_type: string;
  candidates: {
    professor_id: string;
    professor_name: string;
    wish_order: number;
    speciality_match: boolean;
    experience_years: number;
    professional_experience: number;
    rank_score: number;
    hours_needed: number;
  }[];
}

export interface AlgorithmStats {
  total: number;
  fully_assigned: number;   // امتلأ حجمه الساعي بالكامل
  partially_assigned: number; // أُسنِد له شيء لكن لم يمتلئ
  unassigned: number;         // لم يُسنَد له أي شيء
}

const RANK_ORDER: Record<string, number> = {
  'أستاذ التعليم العالي': 5,
  'أستاذ محاضر - أ': 4,
  'أستاذ محاضر - ب': 3,
  'أستاذ مساعد - أ': 2,
  'أستاذ مساعد - ب': 1,
};

// ساعات الفرصة الواحدة
function opportunityHours(teachingType: string, module: ModuleData): number {
  if (teachingType === 'محاضرة') {
    return 2.25 * (module.weekly_sessions || 1);
  }
  return 1.5; // ساعة واحدة لكل فوج TD
}

// مقارنة أستاذين — 1: A أفضل، -1: B أفضل، 0: تساوٍ تام
function compare(
  profA: ProfessorData, wishA: WishData,
  profB: ProfessorData, wishB: WishData,
  moduleSpecialties: string[]
): 1 | -1 | 0 {
  // ① رقم الرغبة أولاً (الأصغر أفضل)
  if (wishA.wish_order < wishB.wish_order) return 1;
  if (wishA.wish_order > wishB.wish_order) return -1;

  // ② التخصص
  const aMatch = moduleSpecialties.some(s =>
    profA.degree_speciality?.toLowerCase().includes(s.toLowerCase()) ||
    s.toLowerCase().includes(profA.degree_speciality?.toLowerCase() || '')
  );
  const bMatch = moduleSpecialties.some(s =>
    profB.degree_speciality?.toLowerCase().includes(s.toLowerCase()) ||
    s.toLowerCase().includes(profB.degree_speciality?.toLowerCase() || '')
  );
  if (aMatch && !bMatch) return 1;
  if (!aMatch && bMatch) return -1;

  // ③ الخبرة البيداغوجية
  const expA = wishA.previous_years?.length || 0;
  const expB = wishB.previous_years?.length || 0;
  if (expA > expB) return 1;
  if (expB > expA) return -1;

  // ④ الأقدمية المهنية
  if (profA.professional_experience > profB.professional_experience) return 1;
  if (profB.professional_experience > profA.professional_experience) return -1;

  // ⑤ الرتبة
  const rankA = RANK_ORDER[profA.rank] || 0;
  const rankB = RANK_ORDER[profB.rank] || 0;
  if (rankA > rankB) return 1;
  if (rankB > rankA) return -1;

  return 0;
}

// ══════════════════════════════════════════════════════════════════════════════
// الدالة الرئيسية
// ══════════════════════════════════════════════════════════════════════════════
export function runAssignment(
  professors: ProfessorData[],
  wishes: WishData[],
  modules: ModuleData[],
  levelSemesters: LevelSemesterData[],
  semester: number,
  academicYear: string
): {
  assignments: AssignmentResult[];
  conflicts: ConflictGroup[];
  stats: AlgorithmStats;
  professor_hours: Map<string, { assigned: number; max: number; name: string }>;
} {
  const profMap = new Map(professors.map(p => [p.id, p]));
  const moduleMap = new Map(modules.map(m => [m.id, m]));

  // الحجم الساعي المتبقي لكل أستاذ
  const profHoursRemaining = new Map<string, number>();
  professors.forEach(p => profHoursRemaining.set(p.id, p.max_weekly_hours || 9));

  // الأفواج المتاحة لكل مقياس + نوع تدريس
  // key: `${module_id}__${teaching_type}`
  // value: قائمة الأفواج المتاحة { section, group }
  const availableSlots = new Map<string, { section: number; group: number | null }[]>();

  const semModules = modules.filter(m => m.semester === semester);
  for (const mod of semModules) {
    const ls = levelSemesters.find(x => x.level_id === mod.level_id && x.semester === semester);
    if (!ls) continue;

    if (mod.has_lectures) {
      const key = `${mod.id}__محاضرة`;
      const slots = [];
      for (let s = 1; s <= ls.num_sections; s++) {
        slots.push({ section: s, group: null });
      }
      availableSlots.set(key, slots);
    }

    if (mod.has_td) {
      const key = `${mod.id}__أعمال موجهة`;
      const slots = [];
      for (let s = 1; s <= ls.num_sections; s++) {
        for (let g = 1; g <= ls.num_groups; g++) {
          slots.push({ section: s, group: g });
        }
      }
      availableSlots.set(key, slots);
    }
  }

  const finalAssignments: AssignmentResult[] = [];
  const pendingConflicts: ConflictGroup[] = [];

  // نمرّ على رغبات ① → ⑤
  for (let wishOrder = 1; wishOrder <= 5; wishOrder++) {
    // اجمع رغبات هذا المستوى من الأساتذة الذين لم يمتلئ حجمهم بعد
    const wishesThisRound = wishes.filter(w =>
      w.wish_order === wishOrder &&
      (profHoursRemaining.get(w.professor_id) || 0) > 0
    );

    if (wishesThisRound.length === 0) continue;

    // جمّع حسب (module_id + teaching_type)
    const byModuleType = new Map<string, WishData[]>();
    for (const wish of wishesThisRound) {
      const mod = moduleMap.get(wish.module_id);
      if (!mod) continue;
      const key = `${wish.module_id}__${wish.teaching_type}`;
      if (!byModuleType.has(key)) byModuleType.set(key, []);
      byModuleType.get(key)!.push(wish);
    }

    for (const [modTypeKey, requestors] of byModuleType) {
      const [moduleId, teachingType] = modTypeKey.split('__');
      const mod = moduleMap.get(moduleId);
      if (!mod) continue;

      const slots = availableSlots.get(modTypeKey) || [];
      if (slots.length === 0) continue; // لا أفواج متاحة

      const hoursPerSlot = opportunityHours(teachingType, mod);
      const moduleSpecialties = mod.specialty_match || [];

      // فرز الطالبين حسب المعايير
      const sorted = [...requestors].sort((wa, wb) => {
        const pa = profMap.get(wa.professor_id)!;
        const pb = profMap.get(wb.professor_id)!;
        const cmp = compare(pa, wa, pb, wb, moduleSpecialties);
        return cmp === 1 ? -1 : cmp === -1 ? 1 : 0;
      });

      let slotIndex = 0;

      for (const wish of sorted) {
        const prof = profMap.get(wish.professor_id)!;
        let hoursLeft = profHoursRemaining.get(wish.professor_id) || 0;

        if (hoursLeft <= 0) continue;
        if (slotIndex >= slots.length) break; // لا أفواج متبقية

        // احسب كم فوج يمكن أن يأخذ هذا الأستاذ
        const maxSlotsCanTake = Math.floor(hoursLeft / hoursPerSlot);
        if (maxSlotsCanTake === 0) continue;

        const remainingSlots = slots.length - slotIndex;

        if (remainingSlots === 0) break;

        // تحقق من التساوي مع التالي (تصادم محتمل على آخر الأفواج)
        const nextWish = sorted[sorted.indexOf(wish) + 1];
        const nextProf = nextWish ? profMap.get(nextWish.professor_id) : null;
        const isTied = nextProf &&
          compare(prof, wish, nextProf, nextWish, moduleSpecialties) === 0;

        // إن كانت الأفواج تكفي الجميع أو هذا آخر طالب → أسنِد مباشرة
        if (!isTied || remainingSlots > maxSlotsCanTake) {
          // أسنِد الأفواج التي يحتاجها هذا الأستاذ
          const slotsToTake = Math.min(maxSlotsCanTake, remainingSlots);
          for (let i = 0; i < slotsToTake; i++) {
            const slot = slots[slotIndex + i];
            finalAssignments.push({
              professor_id: wish.professor_id,
              professor_name: `${prof.last_name} ${prof.first_name}`,
              module_id: moduleId,
              module_name: mod.name_ar,
              level_id: wish.level_id,
              teaching_type: teachingType,
              section_number: slot.section,
              group_number: slot.group,
              weekly_hours: hoursPerSlot,
              wish_order_satisfied: wishOrder,
              status: 'assigned',
              conflict_resolved: false,
              score: null,
            });
          }
          slotIndex += slotsToTake;
          profHoursRemaining.set(wish.professor_id, hoursLeft - slotsToTake * hoursPerSlot);
        } else {
          // تصادم حقيقي — الأفواج لا تكفي المتساوين
          // اجمع كل المتساوين
          const tiedGroup: WishData[] = [wish];
          for (const other of sorted.slice(sorted.indexOf(wish) + 1)) {
            const otherProf = profMap.get(other.professor_id)!;
            if (compare(prof, wish, otherProf, other, moduleSpecialties) === 0) {
              tiedGroup.push(other);
            } else break;
          }

          pendingConflicts.push({
            module_id: moduleId,
            module_name: mod.name_ar,
            level_id: wish.level_id,
            teaching_type: teachingType,
            candidates: tiedGroup.map(w => {
              const p = profMap.get(w.professor_id)!;
              return {
                professor_id: w.professor_id,
                professor_name: `${p.last_name} ${p.first_name}`,
                wish_order: w.wish_order,
                speciality_match: moduleSpecialties.some(s =>
                  p.degree_speciality?.toLowerCase().includes(s.toLowerCase())
                ),
                experience_years: w.previous_years?.length || 0,
                professional_experience: p.professional_experience,
                rank_score: RANK_ORDER[p.rank] || 0,
                hours_needed: hoursPerSlot,
              };
            }),
          });

          // أضف pending لكل متصادم
          for (const w of tiedGroup) {
            const p = profMap.get(w.professor_id)!;
            finalAssignments.push({
              professor_id: w.professor_id,
              professor_name: `${p.last_name} ${p.first_name}`,
              module_id: moduleId,
              module_name: mod.name_ar,
              level_id: w.level_id,
              teaching_type: teachingType,
              section_number: slots[slotIndex]?.section || 1,
              group_number: slots[slotIndex]?.group || null,
              weekly_hours: hoursPerSlot,
              wish_order_satisfied: wishOrder,
              status: 'pending_conflict',
              conflict_resolved: false,
              score: null,
            });
          }
          slotIndex = slots.length; // استهلك كل الأفواج المتبقية
        }
      }

      // حدّث الأفواج المتاحة بعد هذه الجولة
      availableSlots.set(modTypeKey, slots.slice(slotIndex));
    }
  }

  // احسب الإحصاءات
  const assignedProfIds = new Set(
    finalAssignments.filter(a => a.status === 'assigned').map(a => a.professor_id)
  );
  const profHoursAssigned = new Map<string, number>();
  for (const a of finalAssignments.filter(x => x.status === 'assigned')) {
    profHoursAssigned.set(a.professor_id, (profHoursAssigned.get(a.professor_id) || 0) + a.weekly_hours);
  }

  let fully = 0, partially = 0, unassigned = 0;
  const professor_hours = new Map<string, { assigned: number; max: number; name: string }>();

  for (const prof of professors) {
    const assigned = profHoursAssigned.get(prof.id) || 0;
    const max = prof.max_weekly_hours || 9;
    professor_hours.set(prof.id, {
      assigned,
      max,
      name: `${prof.last_name} ${prof.first_name}`,
    });
    if (assigned >= max) fully++;
    else if (assigned > 0) partially++;
    else unassigned++;
  }

  return {
    assignments: finalAssignments.filter(a => a.status === 'assigned'),
    conflicts: pendingConflicts,
    stats: {
      total: professors.length,
      fully_assigned: fully,
      partially_assigned: partially,
      unassigned,
    },
    professor_hours,
  };
}
