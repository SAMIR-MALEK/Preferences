-- =====================================================================
-- منصة تسجيل الرغبات البيداغوجية — كلية الحقوق برج بوعريريج
-- النسخة 3 — Schema كامل مع منطق الإسناد الصحيح
-- الموسم الجامعي 2026-2027
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. الأساتذة
-- =====================================================================
CREATE TABLE professors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  username TEXT UNIQUE NOT NULL,
  last_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  rank TEXT NOT NULL DEFAULT 'أستاذ مساعد - أ',
  -- الحجم الساعي القصوى الأسبوعي: 9 ساعات للجميع
  -- محاضرة = 2.25س/أسبوع | أعمال موجهة = 1.5س/أسبوع
  max_weekly_hours DECIMAL(4,2) DEFAULT 9.00,
  professional_experience INTEGER DEFAULT 0,
  highest_degree TEXT NOT NULL DEFAULT 'دكتوراه',
  degree_speciality TEXT,
  degree_title TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  wishes_locked_s1 BOOLEAN DEFAULT false,
  wishes_locked_s2 BOOLEAN DEFAULT false,
  wishes_locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 2. المستويات (14 مستوى)
-- =====================================================================
CREATE TABLE levels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  speciality TEXT,
  degree_type TEXT NOT NULL CHECK (degree_type IN ('ليسانس','ماستر')),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 3. المجموعات والأفواج لكل مستوى × سداسي
--
--    مثال: أولى ليسانس - السداسي الأول
--      num_sections = 4  (المجموعات — للمحاضرات)
--      num_groups   = 8  (الأفواج لكل مجموعة — للأعمال الموجهة)
--
--    المنطق:
--      محاضرة  → كل section تحتاج أستاذاً واحداً
--               إذن 4 sections = 4 فرص إسناد لنفس المقياس
--      أعمال موجهة → كل group تحتاج أستاذاً واحداً
--               إذن 4 sections × 8 groups = 32 فرصة
-- =====================================================================
CREATE TABLE level_semesters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level_id UUID REFERENCES levels(id) ON DELETE CASCADE,
  semester INTEGER NOT NULL CHECK (semester IN (1,2)),
  num_sections INTEGER NOT NULL DEFAULT 1,  -- عدد المجموعات (للمحاضرات)
  num_groups INTEGER NOT NULL DEFAULT 2,    -- عدد الأفواج في كل مجموعة (للأعمال الموجهة)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(level_id, semester)
);

-- =====================================================================
-- 4. المقاييس
-- =====================================================================
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level_id UUID REFERENCES levels(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name_ar TEXT NOT NULL,
  semester INTEGER NOT NULL CHECK (semester IN (1,2)),
  has_lectures BOOLEAN DEFAULT true,
  has_td BOOLEAN DEFAULT false,
  -- ساعات ثابتة للكلية:
  weekly_hours_lecture DECIMAL(4,2) DEFAULT 2.25,  -- 2.25س/أسبوع لكل section
  weekly_hours_td DECIMAL(4,2) DEFAULT 1.50,       -- 1.5س/أسبوع لكل group
  specialty_match TEXT[],
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(level_id, code)
);

-- =====================================================================
-- 5. الرغبات (لكل سداسي على حدة)
-- =====================================================================
CREATE TABLE wishes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professor_id UUID REFERENCES professors(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL DEFAULT '2026-2027',
  semester INTEGER NOT NULL CHECK (semester IN (1,2)),
  wish_order INTEGER NOT NULL CHECK (wish_order BETWEEN 1 AND 5),
  module_id UUID REFERENCES modules(id),
  level_id UUID REFERENCES levels(id),
  teaching_type TEXT NOT NULL CHECK (teaching_type IN ('محاضرة','أعمال موجهة')),
  taught_before BOOLEAN DEFAULT false,
  previous_years TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(professor_id, academic_year, semester, wish_order)
);

-- =====================================================================
-- 6. الإسنادات النهائية
--
--    section_number: رقم المجموعة (1..num_sections)
--    group_number:   رقم الفوج    (1..num_groups) — للأعمال الموجهة فقط
-- =====================================================================
CREATE TABLE assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professor_id UUID REFERENCES professors(id),
  module_id UUID REFERENCES modules(id),
  level_id UUID REFERENCES levels(id),
  academic_year TEXT NOT NULL DEFAULT '2026-2027',
  semester INTEGER NOT NULL CHECK (semester IN (1,2)),
  teaching_type TEXT NOT NULL CHECK (teaching_type IN ('محاضرة','أعمال موجهة')),
  section_number INTEGER NOT NULL,
  group_number INTEGER,           -- null للمحاضرات
  weekly_hours DECIMAL(4,2),      -- الساعات الفعلية (2.25 أو 1.5)
  wish_order_satisfied INTEGER,   -- رقم الرغبة التي أُشبعت
  conflict_resolved BOOLEAN DEFAULT false, -- هل كان هناك تصادم؟
  score DECIMAL(5,2),             -- نقاط المعايير (تُستخدم فقط عند التصادم)
  status TEXT DEFAULT 'مؤقت' CHECK (status IN ('مؤقت','نهائي','ملغى')),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 7. الطعون
-- =====================================================================
CREATE TABLE appeals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  professor_id UUID REFERENCES professors(id),
  assignment_id UUID REFERENCES assignments(id),
  academic_year TEXT NOT NULL DEFAULT '2026-2027',
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'معلق' CHECK (status IN ('معلق','مقبول','مرفوض')),
  admin_response TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id)
);

-- =====================================================================
-- 8. معايير الإسناد (قابلة للتعديل من الإدارة)
--    تُستخدم فقط عند التصادم بين رغبتين بنفس الرقم
-- =====================================================================
CREATE TABLE assignment_criteria (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL,
  description TEXT,
  weight DECIMAL(5,2) NOT NULL DEFAULT 25.00, -- نسبة مئوية
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 9. إعدادات الموسم
-- =====================================================================
CREATE TABLE academic_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  academic_year TEXT UNIQUE NOT NULL DEFAULT '2026-2027',
  registration_s1_open BOOLEAN DEFAULT true,
  registration_s2_open BOOLEAN DEFAULT false,
  registration_deadline TIMESTAMPTZ,
  results_published BOOLEAN DEFAULT false,
  appeals_open BOOLEAN DEFAULT false,
  appeals_deadline TIMESTAMPTZ,
  platform_title TEXT DEFAULT 'منصة تسجيل الرغبات البيداغوجية',
  max_weekly_hours DECIMAL(4,2) DEFAULT 9.00,
  hours_per_lecture DECIMAL(4,2) DEFAULT 2.25,
  hours_per_td DECIMAL(4,2) DEFAULT 1.50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- 10. المشرفون
-- =====================================================================
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'admin' CHECK (role IN ('super_admin','admin','viewer')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================================
-- INSERT: المستويات الـ14
-- =====================================================================
INSERT INTO levels (code, name_ar, speciality, degree_type, display_order) VALUES
('L1',     'أولى ليسانس',                        NULL,                              'ليسانس', 1),
('L2',     'ثانية ليسانس',                        NULL,                              'ليسانس', 2),
('L3P',    'ثالثة ليسانس قانون خاص',              'قانون خاص',                       'ليسانس', 3),
('L3G',    'ثالثة ليسانس قانون عام',               'قانون عام',                       'ليسانس', 4),
('M1CJ',   'ماستر 1 قانون جنائي',                 'قانون جنائي',                     'ماستر',  5),
('M2CJ',   'ماستر 2 قانون جنائي',                 'قانون جنائي',                     'ماستر',  6),
('M1AFF',  'ماستر 1 قانون أعمال',                 'قانون أعمال',                     'ماستر',  7),
('M2AFF',  'ماستر 2 قانون أعمال',                 'قانون أعمال',                     'ماستر',  8),
('M1INFO', 'ماستر 1 قانون الإعلام الآلي والإنترنت','قانون الإعلام الآلي والإنترنت', 'ماستر',  9),
('M2INFO', 'ماستر 2 قانون الإعلام الآلي والإنترنت','قانون الإعلام الآلي والإنترنت', 'ماستر', 10),
('M1URB',  'ماستر 1 قانون التهيئة والتعمير',       'قانون التهيئة والتعمير',          'ماستر', 11),
('M2URB',  'ماستر 2 قانون التهيئة والتعمير',       'قانون التهيئة والتعمير',          'ماستر', 12),
('M1SAN',  'ماستر 1 قانون الصحة',                 'قانون الصحة',                     'ماستر', 13),
('M2SAN',  'ماستر 2 قانون الصحة',                 'قانون الصحة',                     'ماستر', 14);

-- =====================================================================
-- INSERT: المجموعات والأفواج لكل مستوى × سداسي
--   (قيم نموذجية — قابلة للتعديل من لوحة الإدارة)
--
--   أولى  ليسانس : 4 مجموعات × 8 أفواج
--   ثانية ليسانس : 4 مجموعات × 8 أفواج
--   ثالثة خاص   : 2 مجموعات × 6 أفواج
--   ثالثة عام   : 2 مجموعات × 6 أفواج
--   ماستر        : 1 مجموعة  × 2 أفواج
-- =====================================================================
DO $$
DECLARE
  v_level RECORD;
  v_sem INTEGER;
  v_sections INTEGER;
  v_groups INTEGER;
BEGIN
  FOR v_level IN SELECT id, code FROM levels LOOP
    FOR v_sem IN 1..2 LOOP
      -- تحديد الأعداد حسب المستوى
      IF v_level.code IN ('L1','L2') THEN
        v_sections := 4; v_groups := 8;
      ELSIF v_level.code IN ('L3P','L3G') THEN
        v_sections := 2; v_groups := 6;
      ELSE -- ماستر
        v_sections := 1; v_groups := 2;
      END IF;

      INSERT INTO level_semesters (level_id, semester, num_sections, num_groups)
      VALUES (v_level.id, v_sem, v_sections, v_groups)
      ON CONFLICT (level_id, semester) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- =====================================================================
-- INSERT: معايير الإسناد الافتراضية
--   تُطبَّق فقط عند التصادم بين رغبتين بنفس الرقم
-- =====================================================================
INSERT INTO assignment_criteria (label, description, weight, display_order) VALUES
('تطابق التخصص',    'مطابقة تخصص شهادة الأستاذ مع التخصصات المناسبة للمقياس',    40, 1),
('الرتبة العلمية',  'كلما ارتفعت الرتبة العلمية زادت الأولوية عند التصادم',        30, 2),
('التدريس السابق',  'هل درّس الأستاذ هذا المقياس في إحدى السنوات الثلاث الماضية', 20, 3),
('الخبرة المهنية',  'عدد سنوات الخبرة في التدريس الجامعي',                          10, 4);

-- =====================================================================
-- INSERT: إعدادات الموسم
-- =====================================================================
INSERT INTO academic_settings (
  academic_year, registration_s1_open, registration_s2_open,
  platform_title, max_weekly_hours, hours_per_lecture, hours_per_td
) VALUES (
  '2026-2027', true, false,
  'منصة تسجيل الرغبات البيداغوجية — كلية الحقوق والعلوم السياسية',
  9.00, 2.25, 1.50
);

-- =====================================================================
-- INSERT: المقاييس النموذجية
-- =====================================================================

-- أولى ليسانس
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L1-S1-01', 'مدخل للقانون',           1, true, true,  ARRAY['قانون عام','قانون خاص','قانون جنائي'], 1 FROM levels WHERE code='L1';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L1-S1-02', 'القانون الدستوري',        1, true, true,  ARRAY['قانون عام','قانون جنائي'], 2 FROM levels WHERE code='L1';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L1-S1-03', 'مدخل لعلم السياسة',      1, true, false, ARRAY['قانون عام'], 3 FROM levels WHERE code='L1';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L1-S2-01', 'نظرية الالتزامات',       2, true, true,  ARRAY['قانون خاص','قانون أعمال'], 1 FROM levels WHERE code='L1';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L1-S2-02', 'تاريخ المؤسسات',         2, true, false, ARRAY['قانون عام','قانون خاص'], 2 FROM levels WHERE code='L1';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L1-S2-03', 'الاقتصاد السياسي',       2, true, false, ARRAY['قانون عام','قانون أعمال'], 3 FROM levels WHERE code='L1';

-- ثانية ليسانس
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L2-S1-01', 'القانون المدني — العقود', 1, true, true, ARRAY['قانون خاص','قانون أعمال'], 1 FROM levels WHERE code='L2';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L2-S1-02', 'القانون الإداري',         1, true, true, ARRAY['قانون عام'], 2 FROM levels WHERE code='L2';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L2-S1-03', 'القانون الجنائي العام',   1, true, true, ARRAY['قانون جنائي','قانون عام'], 3 FROM levels WHERE code='L2';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L2-S2-01', 'قانون الأسرة',            2, true, true, ARRAY['قانون خاص'], 1 FROM levels WHERE code='L2';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L2-S2-02', 'القانون التجاري',         2, true, true, ARRAY['قانون أعمال','قانون خاص'], 2 FROM levels WHERE code='L2';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L2-S2-03', 'المالية العامة',          2, true, false, ARRAY['قانون عام'], 3 FROM levels WHERE code='L2';

-- ثالثة ليسانس قانون خاص
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3P-S1-01', 'قانون العقود الخاصة',      1, true, true, ARRAY['قانون خاص'], 1 FROM levels WHERE code='L3P';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3P-S1-02', 'قانون العمل',               1, true, true, ARRAY['قانون خاص','قانون أعمال'], 2 FROM levels WHERE code='L3P';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3P-S1-03', 'الإجراءات المدنية والإدارية',1, true, true, ARRAY['قانون خاص','قانون عام'], 3 FROM levels WHERE code='L3P';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3P-S2-01', 'قانون الشركات',             2, true, true, ARRAY['قانون خاص','قانون أعمال'], 1 FROM levels WHERE code='L3P';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3P-S2-02', 'قانون الملكية الفكرية',     2, true, false, ARRAY['قانون خاص'], 2 FROM levels WHERE code='L3P';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3P-S2-03', 'قانون التأمينات',           2, true, false, ARRAY['قانون خاص','قانون أعمال'], 3 FROM levels WHERE code='L3P';

-- ثالثة ليسانس قانون عام
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3G-S1-01', 'القانون الإداري المتقدم',   1, true, true, ARRAY['قانون عام'], 1 FROM levels WHERE code='L3G';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3G-S1-02', 'القانون الدولي العام',       1, true, true, ARRAY['قانون عام'], 2 FROM levels WHERE code='L3G';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3G-S1-03', 'المنازعات الإدارية',         1, true, true, ARRAY['قانون عام'], 3 FROM levels WHERE code='L3G';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3G-S2-01', 'القانون الدستوري المقارن',   2, true, false, ARRAY['قانون عام'], 1 FROM levels WHERE code='L3G';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'L3G-S2-02', 'قانون الوظيفة العمومية',    2, true, true, ARRAY['قانون عام'], 2 FROM levels WHERE code='L3G';

-- ماستر 1 قانون جنائي
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1CJ-S1-01', 'القانون الجنائي الخاص',      1, true, true,  ARRAY['قانون جنائي'], 1 FROM levels WHERE code='M1CJ';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1CJ-S1-02', 'الإجراءات الجزائية',         1, true, true,  ARRAY['قانون جنائي'], 2 FROM levels WHERE code='M1CJ';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1CJ-S1-03', 'علم الإجرام وعلم العقاب',    1, true, false, ARRAY['قانون جنائي'], 3 FROM levels WHERE code='M1CJ';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1CJ-S2-01', 'جرائم الأعمال',              2, true, false, ARRAY['قانون جنائي','قانون أعمال'], 1 FROM levels WHERE code='M1CJ';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1CJ-S2-02', 'الجريمة المنظمة العابرة للحدود',2, true, false, ARRAY['قانون جنائي'], 2 FROM levels WHERE code='M1CJ';

-- ماستر 2 قانون جنائي
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M2CJ-S1-01', 'جرائم الفساد والإرهاب',       1, true, false, ARRAY['قانون جنائي'], 1 FROM levels WHERE code='M2CJ';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M2CJ-S1-02', 'التعاون القضائي الدولي الجنائي',1,true, false, ARRAY['قانون جنائي'], 2 FROM levels WHERE code='M2CJ';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M2CJ-S2-01', 'منهجية البحث القانوني الجنائي',2, true, true,  ARRAY['قانون جنائي'], 1 FROM levels WHERE code='M2CJ';

-- ماستر 1 قانون أعمال
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1AFF-S1-01', 'قانون الشركات التجارية المتقدم',1, true, true, ARRAY['قانون أعمال','قانون خاص'], 1 FROM levels WHERE code='M1AFF';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1AFF-S1-02', 'القانون المصرفي',              1, true, true, ARRAY['قانون أعمال'], 2 FROM levels WHERE code='M1AFF';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1AFF-S2-01', 'العقود التجارية الدولية',      2, true, false, ARRAY['قانون أعمال'], 1 FROM levels WHERE code='M1AFF';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1AFF-S2-02', 'قانون المنافسة والأسعار',      2, true, false, ARRAY['قانون أعمال'], 2 FROM levels WHERE code='M1AFF';

-- ماستر 2 قانون أعمال
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M2AFF-S1-01', 'تسوية النزاعات التجارية الدولية',1,true,false,ARRAY['قانون أعمال'], 1 FROM levels WHERE code='M2AFF';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M2AFF-S2-01', 'الاستثمار الأجنبي المباشر',    2, true, false, ARRAY['قانون أعمال','قانون عام'], 1 FROM levels WHERE code='M2AFF';

-- ماستر 1 قانون الإعلام الآلي
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1INFO-S1-01', 'حماية البيانات الشخصية',      1, true, true,  ARRAY['قانون الإعلام الآلي والإنترنت'], 1 FROM levels WHERE code='M1INFO';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1INFO-S1-02', 'الجرائم المعلوماتية',          1, true, false, ARRAY['قانون الإعلام الآلي والإنترنت','قانون جنائي'], 2 FROM levels WHERE code='M1INFO';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1INFO-S2-01', 'قانون التجارة الإلكترونية',    2, true, false, ARRAY['قانون الإعلام الآلي والإنترنت','قانون أعمال'], 1 FROM levels WHERE code='M1INFO';

-- ماستر 2 قانون الإعلام الآلي
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M2INFO-S1-01', 'الحوكمة الرقمية',             1, true, false, ARRAY['قانون الإعلام الآلي والإنترنت'], 1 FROM levels WHERE code='M2INFO';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M2INFO-S2-01', 'الأمن السيبراني والقانون',     2, true, false, ARRAY['قانون الإعلام الآلي والإنترنت','قانون جنائي'], 1 FROM levels WHERE code='M2INFO';

-- ماستر 1 قانون التهيئة والتعمير
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1URB-S1-01', 'قانون التهيئة والتعمير',        1, true, true, ARRAY['قانون التهيئة والتعمير','قانون عام'], 1 FROM levels WHERE code='M1URB';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1URB-S1-02', 'قانون البيئة',                  1, true, false, ARRAY['قانون التهيئة والتعمير','قانون عام'], 2 FROM levels WHERE code='M1URB';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1URB-S2-01', 'نزع الملكية وإجراءاته',        2, true, true, ARRAY['قانون التهيئة والتعمير','قانون عام'], 1 FROM levels WHERE code='M1URB';

-- ماستر 2 قانون التهيئة
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M2URB-S1-01', 'التخطيط العمراني في الجزائر',   1, true, false, ARRAY['قانون التهيئة والتعمير'], 1 FROM levels WHERE code='M2URB';

-- ماستر 1 قانون الصحة
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1SAN-S1-01', 'القانون الصحي العام',            1, true, true, ARRAY['قانون الصحة','قانون عام'], 1 FROM levels WHERE code='M1SAN';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1SAN-S1-02', 'المسؤولية الطبية',               1, true, false, ARRAY['قانون الصحة','قانون خاص'], 2 FROM levels WHERE code='M1SAN';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M1SAN-S2-01', 'تنظيم المنظومة الصحية',          2, true, false, ARRAY['قانون الصحة','قانون عام'], 1 FROM levels WHERE code='M1SAN';

-- ماستر 2 قانون الصحة
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M2SAN-S1-01', 'أخلاقيات الطب والقانون',         1, true, false, ARRAY['قانون الصحة'], 1 FROM levels WHERE code='M2SAN';
INSERT INTO modules (level_id, code, name_ar, semester, has_lectures, has_td, specialty_match, display_order)
SELECT id, 'M2SAN-S2-01', 'قانون الدواء والصيدلة',           2, true, false, ARRAY['قانون الصحة'], 1 FROM levels WHERE code='M2SAN';

-- =====================================================================
-- RLS — Row Level Security
-- =====================================================================
ALTER TABLE professors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE appeals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE levels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_semesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_professor"    ON professors     FOR ALL    USING (auth.uid() = user_id);
CREATE POLICY "own_wishes"       ON wishes         FOR ALL    USING (professor_id IN (SELECT id FROM professors WHERE user_id = auth.uid()));
CREATE POLICY "public_levels"    ON levels         FOR SELECT USING (true);
CREATE POLICY "public_ls"        ON level_semesters FOR SELECT USING (true);
CREATE POLICY "public_modules"   ON modules        FOR SELECT USING (true);
CREATE POLICY "own_assignments"  ON assignments    FOR SELECT USING (professor_id IN (SELECT id FROM professors WHERE user_id = auth.uid()));
CREATE POLICY "own_appeals"      ON appeals        FOR ALL    USING (professor_id IN (SELECT id FROM professors WHERE user_id = auth.uid()));

-- =====================================================================
-- FUNCTION: حساب نقاط الأستاذ لمقياس معين (عند التصادم فقط)
-- =====================================================================
CREATE OR REPLACE FUNCTION score_professor_for_module(
  p_professor_id UUID,
  p_module_id    UUID,
  p_wish_id      UUID   -- لجلب بيانات التدريس السابق
) RETURNS DECIMAL AS $$
DECLARE
  v_prof   professors%ROWTYPE;
  v_mod    modules%ROWTYPE;
  v_wish   wishes%ROWTYPE;
  v_rank_score    INTEGER;
  v_spec_score    INTEGER;
  v_prev_score    INTEGER;
  v_exp_score     INTEGER;
  v_total         DECIMAL;
  -- أوزان المعايير (تُجلب من جدول assignment_criteria)
  w_spec  DECIMAL; w_rank DECIMAL; w_prev DECIMAL; w_exp DECIMAL;
BEGIN
  SELECT * INTO v_prof FROM professors WHERE id = p_professor_id;
  SELECT * INTO v_mod  FROM modules    WHERE id = p_module_id;
  SELECT * INTO v_wish FROM wishes     WHERE id = p_wish_id;

  -- جلب الأوزان
  SELECT weight INTO w_spec FROM assignment_criteria WHERE label = 'تطابق التخصص'  AND is_active LIMIT 1;
  SELECT weight INTO w_rank FROM assignment_criteria WHERE label = 'الرتبة العلمية' AND is_active LIMIT 1;
  SELECT weight INTO w_prev FROM assignment_criteria WHERE label = 'التدريس السابق' AND is_active LIMIT 1;
  SELECT weight INTO w_exp  FROM assignment_criteria WHERE label = 'الخبرة المهنية' AND is_active LIMIT 1;

  -- 1. تطابق التخصص
  IF v_mod.specialty_match @> ARRAY[v_prof.degree_speciality] THEN
    v_spec_score := 100;
  ELSE
    v_spec_score := 20;
  END IF;

  -- 2. الرتبة العلمية
  v_rank_score := CASE v_prof.rank
    WHEN 'أستاذ التعليم العالي' THEN 100
    WHEN 'أستاذ محاضر - أ'      THEN 80
    WHEN 'أستاذ محاضر - ب'      THEN 60
    WHEN 'أستاذ مساعد - أ'      THEN 40
    WHEN 'أستاذ مساعد - ب'      THEN 20
    ELSE 10
  END;

  -- 3. التدريس السابق
  IF v_wish.taught_before THEN
    v_prev_score := CASE array_length(v_wish.previous_years, 1)
      WHEN 3 THEN 100 WHEN 2 THEN 70 WHEN 1 THEN 40 ELSE 0
    END;
  ELSE
    v_prev_score := 0;
  END IF;

  -- 4. الخبرة
  v_exp_score := LEAST(v_prof.professional_experience * 5, 100);

  v_total := COALESCE(
    (v_spec_score * w_spec / 100) +
    (v_rank_score * w_rank / 100) +
    (v_prev_score * w_prev / 100) +
    (v_exp_score  * w_exp  / 100),
    0
  );
  RETURN ROUND(v_total, 2);
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- FUNCTION: خوارزمية الإسناد الكاملة
--
--  المنطق:
--  ① لكل رغبة بالترتيب (1..5):
--     - احسب الساعات المتبقية للأستاذ
--     - تحقق من وجود slot فارغة (section أو group)
--     - إذا لا يوجد تصادم → أسنِد فوراً
--     - إذا يوجد تصادم بنفس رقم الرغبة → قارن بالنقاط
--  ② الأستاذ الأضعف يُحرم، الأقوى يأخذ الـ slot
--  ③ الرغبة المحرومة تبقى محرومة (لا ننتقل لرغبة بديلة بعدها تلقائياً)
--     لكن نتابع بقية رغباته بالترتيب
-- =====================================================================
CREATE OR REPLACE FUNCTION run_assignment_algorithm(p_year TEXT DEFAULT '2026-2027')
RETURNS TABLE (
  professor_name  TEXT,
  module_name     TEXT,
  level_name      TEXT,
  semester        INTEGER,
  teaching_type   TEXT,
  section_number  INTEGER,
  group_number    INTEGER,
  wish_order      INTEGER,
  weekly_hours    DECIMAL,
  had_conflict    BOOLEAN,
  score           DECIMAL
) AS $$
DECLARE
  v_wish          RECORD;
  v_ls            level_semesters%ROWTYPE;
  v_mod           modules%ROWTYPE;
  v_hours         DECIMAL;
  v_used_hours    DECIMAL;
  v_max_hours     DECIMAL := 9.00;
  v_slots_total   INTEGER;
  v_slots_used    INTEGER;
  v_free_slot     INTEGER;
  v_conflict_wish RECORD;
  v_my_score      DECIMAL;
  v_their_score   DECIMAL;
  v_assigned_sec  INTEGER;
  v_assigned_grp  INTEGER;
BEGIN
  -- حذف الإسنادات القديمة المؤقتة
  DELETE FROM assignments WHERE academic_year = p_year AND status = 'مؤقت';

  -- جلب جميع الرغبات مرتبة بالأولوية: wish_order ثم rank
  FOR v_wish IN
    SELECT
      w.*,
      p.rank, p.degree_speciality, p.professional_experience,
      p.last_name || ' ' || p.first_name AS prof_name,
      p.max_weekly_hours
    FROM wishes w
    JOIN professors p ON p.id = w.professor_id
    WHERE w.academic_year = p_year
      AND p.is_active = true
    ORDER BY
      w.wish_order ASC,
      -- عند نفس رقم الرغبة نقدم الأقوى أولاً في المعالجة
      CASE p.rank
        WHEN 'أستاذ التعليم العالي' THEN 1
        WHEN 'أستاذ محاضر - أ'      THEN 2
        WHEN 'أستاذ محاضر - ب'      THEN 3
        WHEN 'أستاذ مساعد - أ'      THEN 4
        ELSE 5
      END
  LOOP
    -- الحجم الساعي المستخدم حتى الآن لهذا الأستاذ
    SELECT COALESCE(SUM(weekly_hours), 0) INTO v_used_hours
    FROM assignments
    WHERE professor_id = v_wish.professor_id AND academic_year = p_year;

    -- حدد ساعات هذه الرغبة
    SELECT * INTO v_mod FROM modules WHERE id = v_wish.module_id;
    IF v_wish.teaching_type = 'محاضرة' THEN
      v_hours := 2.25;
    ELSE
      v_hours := 1.50;
    END IF;

    -- هل يتجاوز الحجم الساعي؟
    IF v_used_hours + v_hours > v_max_hours THEN
      CONTINUE; -- تجاهل هذه الرغبة
    END IF;

    -- جلب إعدادات المجموعات لهذا المستوى والسداسي
    SELECT * INTO v_ls FROM level_semesters
    WHERE level_id = v_wish.level_id AND semester = v_wish.semester;

    IF NOT FOUND THEN CONTINUE; END IF;

    -- تحديد عدد الـ slots المتاحة
    IF v_wish.teaching_type = 'محاضرة' THEN
      v_slots_total := v_ls.num_sections;
    ELSE
      v_slots_total := v_ls.num_sections * v_ls.num_groups;
    END IF;

    -- عدد الـ slots المشغولة لهذا المقياس + نوع + مستوى
    SELECT COUNT(*) INTO v_slots_used
    FROM assignments
    WHERE module_id = v_wish.module_id
      AND teaching_type = v_wish.teaching_type
      AND level_id = v_wish.level_id
      AND semester = v_wish.semester
      AND academic_year = p_year
      AND status != 'ملغى';

    -- هل هناك slot فارغة؟
    IF v_slots_used >= v_slots_total THEN
      CONTINUE; -- لا مكان
    END IF;

    -- هل يوجد تصادم: أستاذ آخر له نفس الرغبة (نفس الرقم) لنفس المقياس؟
    SELECT a.*
    INTO v_conflict_wish
    FROM assignments a
    WHERE a.module_id     = v_wish.module_id
      AND a.teaching_type = v_wish.teaching_type
      AND a.level_id      = v_wish.level_id
      AND a.semester      = v_wish.semester
      AND a.academic_year = p_year
      AND a.wish_order_satisfied = v_wish.wish_order
      AND a.status != 'ملغى'
    LIMIT 1;

    -- إذا لا يوجد تصادم → أسنِد مباشرة
    IF NOT FOUND THEN
      -- احسب رقم الـ slot الفارغة
      IF v_wish.teaching_type = 'محاضرة' THEN
        v_free_slot := v_slots_used + 1;
        v_assigned_sec := v_free_slot;
        v_assigned_grp := NULL;
      ELSE
        v_free_slot := v_slots_used + 1;
        v_assigned_sec := CEIL(v_free_slot::DECIMAL / v_ls.num_groups);
        v_assigned_grp := v_free_slot - ((v_assigned_sec - 1) * v_ls.num_groups);
      END IF;

      INSERT INTO assignments (
        professor_id, module_id, level_id, academic_year, semester,
        teaching_type, section_number, group_number, weekly_hours,
        wish_order_satisfied, conflict_resolved, score, status
      ) VALUES (
        v_wish.professor_id, v_wish.module_id, v_wish.level_id,
        p_year, v_wish.semester, v_wish.teaching_type,
        v_assigned_sec, v_assigned_grp, v_hours,
        v_wish.wish_order, false, NULL, 'مؤقت'
      );

    ELSE
      -- يوجد تصادم → قارن النقاط
      v_my_score    := score_professor_for_module(v_wish.professor_id, v_wish.module_id, v_wish.id);
      v_their_score := COALESCE(v_conflict_wish.score, 0);

      IF v_my_score > v_their_score THEN
        -- الأستاذ الحالي أقوى → ألغِ الإسناد القديم وأسنِد للجديد
        UPDATE assignments SET status = 'ملغى' WHERE id = v_conflict_wish.id;

        IF v_wish.teaching_type = 'محاضرة' THEN
          v_assigned_sec := v_conflict_wish.section_number;
          v_assigned_grp := NULL;
        ELSE
          v_assigned_sec := v_conflict_wish.section_number;
          v_assigned_grp := v_conflict_wish.group_number;
        END IF;

        INSERT INTO assignments (
          professor_id, module_id, level_id, academic_year, semester,
          teaching_type, section_number, group_number, weekly_hours,
          wish_order_satisfied, conflict_resolved, score, status
        ) VALUES (
          v_wish.professor_id, v_wish.module_id, v_wish.level_id,
          p_year, v_wish.semester, v_wish.teaching_type,
          v_assigned_sec, v_assigned_grp, v_hours,
          v_wish.wish_order, true, v_my_score, 'مؤقت'
        );
      END IF;
      -- إذا الأستاذ الحالي أضعف → لا نفعل شيئاً (يبقى محروماً)
    END IF;

  END LOOP;

  -- إرجاع النتائج
  RETURN QUERY
  SELECT
    p.last_name || ' ' || p.first_name,
    m.name_ar,
    l.name_ar,
    a.semester,
    a.teaching_type,
    a.section_number,
    a.group_number,
    a.wish_order_satisfied,
    a.weekly_hours,
    a.conflict_resolved,
    a.score
  FROM assignments a
  JOIN professors p ON p.id = a.professor_id
  JOIN modules    m ON m.id = a.module_id
  JOIN levels     l ON l.id = a.level_id
  WHERE a.academic_year = p_year AND a.status = 'مؤقت'
  ORDER BY a.semester, l.display_order, m.display_order, a.section_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- FUNCTION: ملخص الحجم الساعي لكل أستاذ
-- =====================================================================
CREATE OR REPLACE FUNCTION get_professor_hours_summary(p_year TEXT DEFAULT '2026-2027')
RETURNS TABLE (
  professor_id   UUID,
  professor_name TEXT,
  total_hours    DECIMAL,
  remaining      DECIMAL,
  assignments_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.last_name || ' ' || p.first_name,
    COALESCE(SUM(a.weekly_hours), 0),
    9.00 - COALESCE(SUM(a.weekly_hours), 0),
    COUNT(a.id)::INTEGER
  FROM professors p
  LEFT JOIN assignments a ON a.professor_id = p.id
    AND a.academic_year = p_year AND a.status != 'ملغى'
  WHERE p.is_active = true
  GROUP BY p.id, p.last_name, p.first_name
  ORDER BY SUM(a.weekly_hours) DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- Triggers
-- =====================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_professors_updated_at  BEFORE UPDATE ON professors      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER t_settings_updated_at    BEFORE UPDATE ON academic_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER t_ls_updated_at          BEFORE UPDATE ON level_semesters  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
