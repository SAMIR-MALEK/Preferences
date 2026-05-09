// =====================================================================
// Types — منصة تسجيل الرغبات v4
// =====================================================================

export type ProfessorRank =
  | 'أستاذ التعليم العالي'
  | 'أستاذ محاضر - أ'
  | 'أستاذ محاضر - ب'
  | 'أستاذ مساعد - أ'
  | 'أستاذ مساعد - ب';

export const PROFESSOR_RANKS: ProfessorRank[] = [
  'أستاذ التعليم العالي',
  'أستاذ محاضر - أ',
  'أستاذ محاضر - ب',
  'أستاذ مساعد - أ',
  'أستاذ مساعد - ب',
];

export const HIGHEST_DEGREES = [
  'دكتوراه', 'ماجيستير', 'ماستر', 'ليسانس', 'دكتوراه دولة',
];

// ── ساعات ثابتة ──────────────────────────────────────────────────────
export const HOURS_LECTURE   = 2.25;  // ساعتان وربع لكل محاضرة (section)
export const HOURS_TD        = 1.50;  // ساعة ونصف لكل TD (group)
export const MAX_WEEKLY_HOURS = 9.00; // الحد الأقصى الأسبوعي للجميع

export const PREVIOUS_YEARS = ['2025/2026', '2024/2025', '2023/2024'];

// ─────────────────────────────────────────────────────────────────────
export interface Professor {
  id: string;
  user_id: string;
  username: string;
  last_name: string;
  first_name: string;
  rank: ProfessorRank;
  max_weekly_hours: number;
  professional_experience: number;
  highest_degree: string;
  degree_speciality: string;
  degree_title: string;
  email?: string;
  phone?: string;
  is_active: boolean;
  wishes_locked_s1: boolean;
  wishes_locked_s2: boolean;
  wishes_locked_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Level {
  id: string;
  code: string;
  name_ar: string;
  speciality: string | null;
  degree_type: 'ليسانس' | 'ماستر';
  display_order: number;
  is_active: boolean;
}

/** هيكل المجموعات والأفواج لمستوى × سداسي */
export interface LevelSemester {
  id: string;
  level_id: string;
  semester: 1 | 2;
  num_sections: number; // عدد المجموعات — فرص المحاضرات
  num_groups: number;   // عدد الأفواج لكل مجموعة — فرص TD
}

export interface Module {
  id: string;
  level_id: string;
  code: string;
  name_ar: string;
  semester: 1 | 2;
  has_lectures: boolean;
  has_td: boolean;
  weekly_hours_lecture: number;
  weekly_hours_td: number;
  specialty_match: string[];
  is_active: boolean;
  display_order: number;
  level?: Level;
}

export type TeachingType = 'محاضرة' | 'أعمال موجهة';

export interface Wish {
  id: string;
  professor_id: string;
  academic_year: string;
  semester: 1 | 2;
  wish_order: number;
  module_id: string;
  level_id: string;
  teaching_type: TeachingType;
  taught_before: boolean;
  previous_years: string[];
  notes?: string;
  created_at: string;
  module?: Module;
  level?: Level;
}

// ── الإسناد ───────────────────────────────────────────────────────────
export interface Assignment {
  id: string;
  professor_id: string;
  module_id: string;
  level_id: string;
  academic_year: string;
  semester: 1 | 2;
  teaching_type: TeachingType;
  section_number: number;
  group_number?: number | null;
  weekly_hours: number;
  wish_order_satisfied: number;  // رقم الرغبة التي أُشبعت
  conflict_resolved: boolean;    // هل كان هناك تصادم؟
  score?: number | null;         // النقاط (عند التصادم فقط)
  status: 'مؤقت' | 'نهائي' | 'ملغى';
  assigned_at: string;
  professor?: Professor;
  module?: Module;
  level?: Level;
}

/** ملخص الحجم الساعي لأستاذ */
export interface ProfessorHoursSummary {
  professor_id: string;
  professor_name: string;
  total_hours: number;
  remaining: number;
  assignments_count: number;
}

/** مقياس مع معلومات slots مشغولة/فارغة */
export interface ModuleSlotStatus {
  module: Module;
  level: Level;
  level_semester: LevelSemester;
  lecture_slots_total: number;
  lecture_slots_used: number;
  lecture_slots_free: number;
  td_slots_total: number;
  td_slots_used: number;
  td_slots_free: number;
  lecture_assignments: Assignment[];
  td_assignments: Assignment[];
  is_complete: boolean;
}

export interface AssignmentCriterion {
  id: string;
  label: string;
  description?: string;
  weight: number;
  is_active: boolean;
  display_order: number;
}

export interface Appeal {
  id: string;
  professor_id: string;
  assignment_id: string;
  academic_year: string;
  reason: string;
  status: 'معلق' | 'مقبول' | 'مرفوض';
  admin_response?: string;
  submitted_at: string;
}

export interface AcademicSettings {
  id: string;
  academic_year: string;
  registration_s1_open: boolean;
  registration_s2_open: boolean;
  registration_deadline?: string;
  results_published: boolean;
  appeals_open: boolean;
  appeals_deadline?: string;
  platform_title: string;
  max_weekly_hours: number;
  hours_per_lecture: number;
  hours_per_td: number;
}

export interface Admin {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'viewer';
  is_active: boolean;
}

export type UserRole = 'professor' | 'admin' | null;

export interface AuthUser {
  id: string;
  email?: string;
  role: UserRole;
  professor?: Professor;
  admin?: Admin;
}
