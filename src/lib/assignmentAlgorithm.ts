// ══════════════════════════════════════════════════════════════════════════════
// خوارزمية الإسناد البيداغوجي — منصة الرغبات
// المنطق: جولات متسلسلة (①→②→③→④→⑤)، طاقة استيعابية حسب المجموعات،
//         تصادم محلي يُحسم بـ(تخصص→خبرة→أقدمية→رتبة)، تساوٍ تام = معلّق
// ══════════════════════════════════════════════════════════════════════════════

export interface ProfessorData {
  id: string;
  last_name: string;
  first_name: string;
  rank: string;
  professional_experience: number;
  degree_speciality: string;
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
  level_id: string;
  teaching_type: string;
  section_number: number;
  group_number: number | null;
  weekly_hours: number;
  wish_order_satisfied: number;
  status: 'assigned' | 'pending_conflict' | 'unassigned';
  conflict_resolved: boolean;
  score: null;
  conflict_group?: ConflictGroup; // للتصادمات المعلّقة
}

export interface ConflictGroup {
  module_id: string;
  module_name: string;
  level_id: string;
  teaching_type: string;
  section_number: number;
  group_number: number | null;
  candidates: {
    professor_id: string;
    professor_name: string;
    wish_order: number;
    speciality_match: boolean;
    experience_years: number;
    professional_experience: number;
    rank_score: number;
  }[];
}

// ── ترتيب الرتب العلمية (أعلى = أفضل) ──
const RANK_ORDER: Record<string, number> = {
  'أستاذ التعليم العالي': 5,
  'أستاذ محاضر - أ': 4,
  'أستاذ محاضر - ب': 3,
  'أستاذ مساعد - أ': 2,
  'أستاذ مساعد - ب': 1,
};

// ── مفتاح الفرصة الفريد ──
function opportunityKey(moduleId: string, teachingType: string, section: number, group: number | null) {
  return `${moduleId}__${teachingType}__${section}__${group ?? 0}`;
}

// ── الطاقة الاستيعابية لمقياس/نوع ──
function getCapacity(
  moduleId: string,
  teachingType: string,
  levelId: string,
  semester: number,
  levelSemesters: LevelSemesterData[]
): { sections: number; groups: number } {
  const ls = levelSemesters.find(x => x.level_id === levelId && x.semester === semester);
  if (!ls) return { sections: 0, groups: 0 };
  if (teachingType === 'محاضرة') {
    return { sections: ls.num_sections, groups: 1 };
  } else {
    return { sections: ls.num_sections, groups: ls.num_groups };
  }
}

// ── حساب خبرة الأستاذ في مقياس معيّن (عدد سنوات من المحدد 3 الأخيرة) ──
function getPedagogicalExperience(wish: WishData): number {
  return wish.previous_years?.length || 0;
}

// ── مقارنة بين أستاذين على نفس الفرصة ──
// يُرجع: 1 إن A أفضل، -1 إن B أفضل، 0 إن متساويان تماماً
function compare(
  profA: ProfessorData, wishA: WishData,
  profB: ProfessorData, wishB: WishData,
  moduleSpecialties: string[]
): 1 | -1 | 0 {
  // ① التخصص
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

  // ② الخبرة البيداغوجية (سنوات تدريس هذا المقياس بالذات في آخر 3 سنوات)
  const expA = getPedagogicalExperience(wishA);
  const expB = getPedagogicalExperience(wishB);
  if (expA > expB) return 1;
  if (expB > expA) return -1;

  // ③ الأقدمية المهنية
  if (profA.professional_experience > profB.professional_experience) return 1;
  if (profB.professional_experience > profA.professional_experience) return -1;

  // ④ الرتبة العلمية
  const rankA = RANK_ORDER[profA.rank] || 0;
  const rankB = RANK_ORDER[profB.rank] || 0;
  if (rankA > rankB) return 1;
  if (rankB > rankA) return -1;

  // تساوٍ تام
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
  unassigned: { professor_id: string; professor_name: string }[];
  stats: { total: number; assigned: number; pending: number; unassigned: number };
} {
  const profMap = new Map(professors.map(p => [p.id, p]));
  const moduleMap = new Map(modules.map(m => [m.id, m]));

  // حالة كل أستاذ: next_wish_index = 0..4 (الرغبة الحالية الفعّالة)
  const profState = new Map<string, { nextWishIndex: number; assigned: boolean }>();
  professors.forEach(p => profState.set(p.id, { nextWishIndex: 0, assigned: false }));

  // الفرص المتاحة: Map من opportunityKey → عدد المقاعد المتبقية
  const opportunityCapacity = new Map<string, number>();
  // قائمة كل الفرص المتاحة لكل مقياس + نوع تدريس
  const moduleOpportunities = new Map<string, { section: number; group: number | null; key: string }[]>();

  // بناء قائمة الفرص لكل مقياس في هذا السداسي
  const semesterModules = modules.filter(m => m.semester === semester);
  for (const mod of semesterModules) {
    for (const tType of (['محاضرة', 'أعمال موجهة'] as const)) {
      if (tType === 'محاضرة' && !mod.has_lectures) continue;
      if (tType === 'أعمال موجهة' && !mod.has_td) continue;

      const cap = getCapacity(mod.id, tType, mod.level_id, semester, levelSemesters);
      const opportunities: { section: number; group: number | null; key: string }[] = [];

      if (tType === 'محاضرة') {
        for (let s = 1; s <= cap.sections; s++) {
          const key = opportunityKey(mod.id, tType, s, null);
          opportunities.push({ section: s, group: null, key });
          opportunityCapacity.set(key, 1); // كل مجموعة محاضرة = أستاذ واحد
        }
      } else {
        for (let s = 1; s <= cap.sections; s++) {
          for (let g = 1; g <= cap.groups; g++) {
            const key = opportunityKey(mod.id, tType, s, g);
            opportunities.push({ section: s, group: g, key });
            opportunityCapacity.set(key, 1);
          }
        }
      }

      const mapKey = `${mod.id}__${tType}`;
      moduleOpportunities.set(mapKey, opportunities);
    }
  }

  const finalAssignments: AssignmentResult[] = [];
  const pendingConflicts: ConflictGroup[] = [];

  // ── تشغيل الجولات ① إلى ⑤ ──
  for (let round = 1; round <= 5; round++) {
    // جمع من يحق لهم التنافس في هذه الجولة
    // (أساتذة لم يُسنَدوا بعد، ورغبتهم الفعّالة الحالية = round)
    const wishesThisRound = wishes.filter(w => {
      const state = profState.get(w.professor_id);
      if (!state) return false;
      if (state.assigned) return false;
      return w.wish_order === round && state.nextWishIndex === round - 1;
    });

    if (wishesThisRound.length === 0) continue;

    // تجميع الطلبات حسب (module_id + teaching_type)
    const requestsByModuleType = new Map<string, WishData[]>();
    for (const wish of wishesThisRound) {
      const mod = moduleMap.get(wish.module_id);
      if (!mod) continue;
      const key = `${wish.module_id}__${wish.teaching_type}`;
      if (!requestsByModuleType.has(key)) requestsByModuleType.set(key, []);
      requestsByModuleType.get(key)!.push(wish);
    }

    // معالجة كل مقياس+نوع في هذه الجولة
    for (const [modTypeKey, requestors] of requestsByModuleType) {
      const [moduleId, teachingType] = modTypeKey.split('__');
      const mod = moduleMap.get(moduleId);
      if (!mod) continue;

      const opportunities = moduleOpportunities.get(modTypeKey) || [];
      const availableOpps = opportunities.filter(o => (opportunityCapacity.get(o.key) || 0) > 0);

      if (availableOpps.length === 0) {
        // المقياس ممتلئ — كل الطالبين ينتقلون للرغبة التالية
        for (const wish of requestors) {
          const state = profState.get(wish.professor_id)!;
          profState.set(wish.professor_id, { ...state, nextWishIndex: round });
        }
        continue;
      }

      const moduleSpecialties = mod.specialty_match || [];
      let remainingRequestors = [...requestors];

      // أسند الفرص المتاحة
      for (const opp of availableOpps) {
        if (remainingRequestors.length === 0) break;

        if (remainingRequestors.length === 1) {
          // أستاذ واحد فقط → إسناد مباشر بدون تصادم
          const wish = remainingRequestors[0];
          const prof = profMap.get(wish.professor_id)!;
          const mod = moduleMap.get(wish.module_id)!;
          opportunityCapacity.set(opp.key, 0);
          profState.set(wish.professor_id, { nextWishIndex: round, assigned: true });
          finalAssignments.push({
            professor_id: wish.professor_id,
            professor_name: `${prof.last_name} ${prof.first_name}`,
            module_id: wish.module_id,
            level_id: wish.level_id,
            teaching_type: wish.teaching_type,
            section_number: opp.section,
            group_number: opp.group,
            weekly_hours: teachingType === 'محاضرة' ? 2.25 : 1.5,
            wish_order_satisfied: round,
            status: 'assigned',
            conflict_resolved: false,
            score: null,
          });
          remainingRequestors = [];
        } else {
          // أكثر من أستاذ على نفس الفرصة → فرز
          remainingRequestors.sort((wa, wb) => {
            const pa = profMap.get(wa.professor_id)!;
            const pb = profMap.get(wb.professor_id)!;
            return -compare(pa, wa, pb, wb, moduleSpecialties); // تنازلي
          });

          // تحقق من التساوي التام بين الأول والثاني
          const first = remainingRequestors[0];
          const second = remainingRequestors[1];
          const profFirst = profMap.get(first.professor_id)!;
          const profSecond = profMap.get(second.professor_id)!;
          const cmp = compare(profFirst, first, profSecond, second, moduleSpecialties);

          if (cmp === 0) {
            // تساوٍ تام — حدد من هم متساوون تماماً مع الأول
            const tiedGroup: WishData[] = [];
            for (const w of remainingRequestors) {
              const p = profMap.get(w.professor_id)!;
              if (compare(profFirst, first, p, w, moduleSpecialties) === 0) {
                tiedGroup.push(w);
              } else break;
            }

            // سجّل التصادم المعلّق لكل فرد في المجموعة المتساوية
            pendingConflicts.push({
              module_id: moduleId,
              module_name: mod.name_ar,
              level_id: wish_level(first, wishes),
              teaching_type: teachingType,
              section_number: opp.section,
              group_number: opp.group,
              candidates: tiedGroup.map(w => {
                const p = profMap.get(w.professor_id)!;
                return {
                  professor_id: w.professor_id,
                  professor_name: `${p.last_name} ${p.first_name}`,
                  wish_order: w.wish_order,
                  speciality_match: moduleSpecialties.some(s =>
                    p.degree_speciality?.toLowerCase().includes(s.toLowerCase())
                  ),
                  experience_years: getPedagogicalExperience(w),
                  professional_experience: p.professional_experience,
                  rank_score: RANK_ORDER[p.rank] || 0,
                };
              }),
            });

            // أضف سجل "pending_conflict" لكل متنافس
            for (const w of tiedGroup) {
              const p = profMap.get(w.professor_id)!;
              finalAssignments.push({
                professor_id: w.professor_id,
                professor_name: `${p.last_name} ${p.first_name}`,
                module_id: moduleId,
                level_id: w.level_id,
                teaching_type: teachingType,
                section_number: opp.section,
                group_number: opp.group,
                weekly_hours: teachingType === 'محاضرة' ? 2.25 : 1.5,
                wish_order_satisfied: round,
                status: 'pending_conflict',
                conflict_resolved: false,
                score: null,
              });
              // المتنافسون في التصادم يبقون بحالة "غير محسومة" — لا يترقّون ولا يُسنَدون
            }

            // الفرصة تُعلَّق ولا تُعطى لأحد
            opportunityCapacity.set(opp.key, 0);
            // إزالة المتنافسين المعلّقين من remainingRequestors
            const tiedIds = new Set(tiedGroup.map(w => w.professor_id));
            remainingRequestors = remainingRequestors.filter(w => !tiedIds.has(w.professor_id));

          } else {
            // الأول أفضل → يُسنَد، الباقون يترقّون
            const winner = remainingRequestors[0];
            const prof = profMap.get(winner.professor_id)!;
            opportunityCapacity.set(opp.key, 0);
            profState.set(winner.professor_id, { nextWishIndex: round, assigned: true });
            finalAssignments.push({
              professor_id: winner.professor_id,
              professor_name: `${prof.last_name} ${prof.first_name}`,
              module_id: winner.module_id,
              level_id: winner.level_id,
              teaching_type: winner.teaching_type,
              section_number: opp.section,
              group_number: opp.group,
              weekly_hours: teachingType === 'محاضرة' ? 2.25 : 1.5,
              wish_order_satisfied: round,
              status: 'assigned',
              conflict_resolved: true,
              score: null,
            });
            remainingRequestors = remainingRequestors.slice(1);
          }
        }
      }

      // من بقي بدون فرصة → رغبته التالية
      for (const wish of remainingRequestors) {
        const state = profState.get(wish.professor_id)!;
        if (!state.assigned) {
          profState.set(wish.professor_id, { ...state, nextWishIndex: round });
        }
      }
    }
  }

  // من لم يُسنَد بعد الجولات الخمس
  const unassigned: { professor_id: string; professor_name: string }[] = [];
  for (const [profId, state] of profState) {
    if (!state.assigned) {
      // تحقق أنه ليس في تصادم معلّق
      const inConflict = finalAssignments.some(a => a.professor_id === profId && a.status === 'pending_conflict');
      if (!inConflict) {
        const prof = profMap.get(profId)!;
        unassigned.push({ professor_id: profId, professor_name: `${prof.last_name} ${prof.first_name}` });
      }
    }
  }

  const assigned = finalAssignments.filter(a => a.status === 'assigned').length;
  const pending = finalAssignments.filter(a => a.status === 'pending_conflict').length;

  return {
    assignments: finalAssignments.filter(a => a.status !== 'pending_conflict'),
    conflicts: pendingConflicts,
    unassigned,
    stats: {
      total: professors.length,
      assigned,
      pending: new Set(finalAssignments.filter(a => a.status === 'pending_conflict').map(a => a.professor_id)).size,
      unassigned: unassigned.length,
    },
  };
}

function wish_level(wish: WishData, _allWishes: WishData[]): string {
  return wish.level_id;
}
