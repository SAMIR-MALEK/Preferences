-- ═══════════════════════════════════════════════════════════════════════════
-- ممثلو الأفواج — المرحلة الأولى
-- 1) السجل: ممثل ونائب لكل فوج، يعيّنهما رئيس القسم (لقسمه) أو الإدارة (المشرف، العميد، نائب العميد)
-- 2) الممثل يؤكد من فضاء الطالب: الحصة «تمت / لم تتم» + ملاحظة اختيارية
-- 3) لوحة الإدارة: أرقام اليوم، الحصص التي لم تتم، العدد لكل أستاذ. لا يراها الأستاذ.
-- يُنفَّذ مرة واحدة في Supabase SQL Editor بعد prof_checks.sql (يستعمل pc_is_admin و pc_my_dept).
-- لا يمس أي جدول قائم.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.group_reps (
  id            uuid primary key default gen_random_uuid(),
  academic_year text not null default '2026-2027',
  level_id      uuid not null,
  section       int  not null,
  groupe        int  not null,
  role          text not null check (role in ('ممثل','نائب')),
  student_id    uuid not null,
  assigned_by   uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (academic_year, level_id, section, groupe, role),
  unique (academic_year, student_id)
);

create table if not exists public.session_confirms (
  id           uuid primary key default gen_random_uuid(),
  schedule_id  uuid not null,
  session_date date not null,
  student_id   uuid not null,
  status       text not null check (status in ('تمت','لم تتم')),
  note         text,
  updated_at   timestamptz not null default now(),
  unique (schedule_id, session_date, student_id)
);
create index if not exists session_confirms_date_idx on public.session_confirms (session_date);

alter table public.group_reps enable row level security;
alter table public.session_confirms enable row level security;
revoke all on public.group_reps, public.session_confirms from anon, authenticated;

-- ── أدوات ───────────────────────────────────────────────────────────────────
-- اليوم بتوقيت الجزائر
create or replace function public.gr_today() returns date
language sql stable as $$ select (now() at time zone 'Africa/Algiers')::date; $$;

-- اسم اليوم كما في time_slots
create or replace function public.gr_dayname(d date) returns text
language sql immutable as $$
  select (array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[extract(dow from d)::int + 1];
$$;

-- قسم المستوى المسموح: 'ALL' للإدارة، أو قسم رئيس القسم، أو null
create or replace function public.gr_scope() returns text
language sql stable security definer set search_path = public as $$
  select case when pc_is_admin() then 'ALL' else pc_my_dept() end;
$$;

create or replace function public.gr_level_ok(p_level uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select gr_scope() = 'ALL' or exists (select 1 from levels where id = p_level and department = gr_scope());
$$;

-- الطالب من رقم البكالوريا وسنتها
create or replace function public.gr_student(p_bac text, p_year int) returns uuid
language sql stable security definer set search_path = public as $$
  select id from students where mat_bac = trim(p_bac) and annee_bac::text = p_year::text limit 1;
$$;

-- حصص فوج (مستوى، مجموعة، فوج) في تاريخ: المحاضرات للمجموعة، والأعمال الموجهة للفوج
create or replace function public.gr_group_sessions(p_level uuid, p_section int, p_groupe int, p_date date)
returns table (schedule_id uuid, start_time time, end_time time, kind text, module text, professor text, room text)
language sql stable security definer set search_path = public as $$
  select s.id, ts.start_time::time, ts.end_time::time, a.teaching_type,
         coalesce(nullif(s.custom_module,''), m.name_ar),
         coalesce(nullif(s.custom_professor,''), trim(coalesce(p.last_name,'') || ' ' || coalesce(p.first_name,''))),
         r.name
  from schedules s
  join time_slots ts on ts.id = s.time_slot_id
  join assignments a on a.id = s.assignment_id
  left join modules m on m.id = a.module_id
  left join professors p on p.id = a.professor_id
  left join rooms r on r.id = s.room_id
  where s.academic_year = '2026-2027' and s.semester = 1
    and a.status in ('نهائي','مؤقت')
    and a.level_id = p_level and a.section_number = p_section
    and (a.teaching_type = 'محاضرة' or a.group_number = p_groupe)
    and replace(ts.day, 'إ', 'ا') = gr_dayname(p_date)
  order by ts.start_time;
$$;

-- ═══ جهة الطالب الممثل ══════════════════════════════════════════════════════

-- صفتي وحصص اليوم والحصص السابقة غير المؤكدة (آخر 14 يوما، ومنذ التعيين)
create or replace function public.gr_my(p_bac text, p_year int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_st uuid := gr_student(p_bac, p_year); g record; d date; v_from date; v_now time;
        v_list jsonb := '[]'::jsonb; x record; c record;
begin
  if v_st is null then return null; end if;
  select gr.*, l.name_ar as level_name into g
  from group_reps gr join levels l on l.id = gr.level_id
  where gr.student_id = v_st and gr.academic_year = '2026-2027';
  if not found then return null; end if;

  v_now := (now() at time zone 'Africa/Algiers')::time;
  v_from := greatest(g.created_at::date, gr_today() - 14);
  d := gr_today();
  while d >= v_from loop
    for x in select * from gr_group_sessions(g.level_id, g.section, g.groupe, d) loop
      select status, note into c from session_confirms
        where schedule_id = x.schedule_id and session_date = d and student_id = v_st;
      -- اليوم: كل الحصص. قبله: غير المؤكدة فقط
      if d = gr_today() or c.status is null then
        v_list := v_list || jsonb_build_object(
          'schedule_id', x.schedule_id, 'date', d, 'start', to_char(x.start_time, 'HH24:MI'),
          'end', to_char(x.end_time, 'HH24:MI'), 'kind', x.kind, 'module', x.module,
          'professor', x.professor, 'room', x.room, 'status', c.status, 'note', c.note,
          'started', (d < gr_today() or x.start_time <= v_now));
      end if;
    end loop;
    d := d - 1;
  end loop;

  return jsonb_build_object('role', g.role, 'level', g.level_name, 'section', g.section,
                            'groupe', g.groupe, 'today', gr_today(), 'sessions', v_list);
end; $$;

-- التأكيد: «تمت» أو «لم تتم» أو null للإلغاء
create or replace function public.gr_confirm(p_bac text, p_year int, p_schedule uuid, p_date date,
                                             p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_st uuid := gr_student(p_bac, p_year); g record; x record;
begin
  if v_st is null then raise exception 'تعذر التعرف على الطالب'; end if;
  select * into g from group_reps where student_id = v_st and academic_year = '2026-2027';
  if not found then raise exception 'هذه الخدمة لممثلي الأفواج فقط'; end if;
  if p_date > gr_today() or p_date < gr_today() - 14 then raise exception 'التاريخ خارج المدة المسموحة'; end if;

  select * into x from gr_group_sessions(g.level_id, g.section, g.groupe, p_date) where schedule_id = p_schedule;
  if not found then raise exception 'هذه الحصة ليست في توقيت فوجك لهذا اليوم'; end if;
  if p_date = gr_today() and x.start_time > (now() at time zone 'Africa/Algiers')::time then
    raise exception 'لم يحن وقت الحصة بعد';
  end if;

  if p_status is null then
    delete from session_confirms where schedule_id = p_schedule and session_date = p_date and student_id = v_st;
    return;
  end if;
  insert into session_confirms (schedule_id, session_date, student_id, status, note, updated_at)
  values (p_schedule, p_date, v_st, p_status, nullif(trim(p_note), ''), now())
  on conflict (schedule_id, session_date, student_id) do update
    set status = excluded.status, note = excluded.note, updated_at = now();
end; $$;

-- ═══ جهة الإدارة: السجل ═════════════════════════════════════════════════════

-- كل الأفواج (من قائمة الطلبة) في المستويات المسموحة، مع الممثل والنائب
create or replace function public.gr_registry() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if gr_scope() is null then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(j order by ord, lvl, sec, grp) from (
    select l.display_order as ord, l.code as lvl, g.section as sec, g.groupe as grp,
      jsonb_build_object('level_id', l.id, 'level_code', l.code, 'level_name', l.name_ar,
        'section', g.section, 'groupe', g.groupe, 'students', g.n,
        'rep', (select jsonb_build_object('id', s.id, 'name', trim(coalesce(s.last_name,'') || ' ' || coalesce(s.first_name,'')), 'phone', s.phone)
                from group_reps r join students s on s.id = r.student_id
                where r.academic_year = '2026-2027' and r.level_id = l.id and r.section = g.section and r.groupe = g.groupe and r.role = 'ممثل'),
        'deputy', (select jsonb_build_object('id', s.id, 'name', trim(coalesce(s.last_name,'') || ' ' || coalesce(s.first_name,'')), 'phone', s.phone)
                from group_reps r join students s on s.id = r.student_id
                where r.academic_year = '2026-2027' and r.level_id = l.id and r.section = g.section and r.groupe = g.groupe and r.role = 'نائب')
      ) as j
    from (select specialite, section, groupe, count(*) as n from students
          where section is not null and groupe is not null group by 1, 2, 3) g
    join levels l on l.name_ar = g.specialite
    where coalesce(l.is_active, true) and gr_level_ok(l.id)
  ) t), '[]'::jsonb);
end; $$;

-- طلبة فوج (للاختيار)
create or replace function public.gr_group_students(p_level uuid, p_section int, p_groupe int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if gr_scope() is null or not gr_level_ok(p_level) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', trim(coalesce(s.last_name,'') || ' ' || coalesce(s.first_name,'')),
           'mat', s.mat_etudiant, 'phone', s.phone) order by s.last_name, s.first_name)
    from students s join levels l on l.name_ar = s.specialite
    where l.id = p_level and s.section = p_section and s.groupe = p_groupe), '[]'::jsonb);
end; $$;

-- تعيين ممثل أو نائب (p_student = null للإلغاء). الطالب ينتقل إن كان معيّنا في مكان آخر.
create or replace function public.gr_assign(p_level uuid, p_section int, p_groupe int, p_role text, p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if gr_scope() is null or not gr_level_ok(p_level) then raise exception 'غير مصرح'; end if;
  if p_role not in ('ممثل','نائب') then raise exception 'صفة غير صحيحة'; end if;
  delete from group_reps where academic_year = '2026-2027' and level_id = p_level
    and section = p_section and groupe = p_groupe and role = p_role;
  if p_student is null then return; end if;
  if not exists (select 1 from students s join levels l on l.name_ar = s.specialite
                 where s.id = p_student and l.id = p_level and s.section = p_section and s.groupe = p_groupe) then
    raise exception 'الطالب ليس من هذا الفوج';
  end if;
  delete from group_reps where academic_year = '2026-2027' and student_id = p_student;
  insert into group_reps (level_id, section, groupe, role, student_id) values (p_level, p_section, p_groupe, p_role, p_student);
end; $$;

-- ═══ جهة الإدارة: اللوحة ════════════════════════════════════════════════════
-- حالة الحصة: «لم تتم» إذا كانت تأكيدات «لم تتم» ≥ «تمت» (وواحدة على الأقل)، «تمت» إن غلبت، وإلا بلا جواب.
-- تُحتسب فقط حصص الأفواج والمجموعات التي لها ممثل أو نائب.
create or replace function public.gr_dashboard(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_scope text := gr_scope(); v_today date := gr_today();
begin
  if v_scope is null then raise exception 'غير مصرح'; end if;
  if p_to - p_from > 120 then raise exception 'المدة طويلة جدا (120 يوما كحد أقصى)'; end if;

  return (
    with days as (
      select g::date as d from generate_series(p_from, p_to, interval '1 day') g
      union select v_today
    ),
    occ as (
      select s.id as schedule_id, dy.d, ts.start_time::time as start_time, a.teaching_type as kind, a.professor_id,
             coalesce(nullif(s.custom_module,''), m.name_ar) as module,
             coalesce(nullif(s.custom_professor,''), trim(coalesce(p.last_name,'') || ' ' || coalesce(p.first_name,''))) as professor,
             l.code as level, a.section_number as sec, a.group_number as grp, r.name as room
      from days dy
      join time_slots ts on replace(ts.day, 'إ', 'ا') = gr_dayname(dy.d)
      join schedules s on s.time_slot_id = ts.id and s.academic_year = '2026-2027' and s.semester = 1
      join assignments a on a.id = s.assignment_id and a.status in ('نهائي','مؤقت')
      join levels l on l.id = a.level_id
      left join modules m on m.id = a.module_id
      left join professors p on p.id = a.professor_id
      left join rooms r on r.id = s.room_id
      where (v_scope = 'ALL' or l.department = v_scope)
        and exists (select 1 from group_reps gr where gr.academic_year = '2026-2027' and gr.level_id = a.level_id
                    and gr.section = a.section_number and (a.teaching_type = 'محاضرة' or gr.groupe = a.group_number))
    ),
    agg as (
      select o.*,
        (select count(*) from session_confirms c where c.schedule_id = o.schedule_id and c.session_date = o.d and c.status = 'تمت') as yes,
        (select count(*) from session_confirms c where c.schedule_id = o.schedule_id and c.session_date = o.d and c.status = 'لم تتم') as no,
        (select jsonb_agg(c.note) from session_confirms c where c.schedule_id = o.schedule_id and c.session_date = o.d and c.note is not null) as notes
      from occ o
    ),
    st as (
      select agg.*, case when no > 0 and no >= yes then 'لم تتم' when yes > 0 then 'تمت' else null end as status from agg
    )
    select jsonb_build_object(
      'today', (select jsonb_build_object(
          'date', v_today,
          'scheduled', count(*),
          'done', count(*) filter (where status = 'تمت'),
          'not_done', count(*) filter (where status = 'لم تتم'),
          'unanswered', count(*) filter (where status is null)) from st where d = v_today),
      'list', coalesce((select jsonb_agg(jsonb_build_object(
          'date', d, 'start', to_char(start_time, 'HH24:MI'), 'kind', kind, 'module', module, 'professor', professor,
          'level', level, 'section', sec, 'groupe', grp, 'room', room, 'status', status, 'yes', yes, 'no', no, 'notes', notes)
          order by d desc, start_time)
        from st where d between p_from and p_to and (status = 'لم تتم' or notes is not null)), '[]'::jsonb),
      'profs', coalesce((select jsonb_agg(jsonb_build_object('professor', professor, 'count', n) order by n desc, professor)
        from (select professor, count(*) as n from st where d between p_from and p_to and status = 'لم تتم' group by professor) z), '[]'::jsonb)
    )
  );
end; $$;

-- ── الصلاحيات ──────────────────────────────────────────────────────────────
do $$ declare f text; begin
  -- دوال داخلية: لا تُستدعى من الخارج
  foreach f in array array['gr_scope()','gr_level_ok(uuid)','gr_student(text,integer)',
    'gr_group_sessions(uuid,integer,integer,date)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  -- الطالب (غير مسجل في Supabase Auth)
  foreach f in array array['gr_my(text,integer)','gr_confirm(text,integer,uuid,date,text,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  -- الإدارة
  foreach f in array array['gr_registry()','gr_group_students(uuid,integer,integer)',
    'gr_assign(uuid,integer,integer,text,uuid)','gr_dashboard(date,date)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'group_reps ok' as status,
  (select count(*) from students where section is not null and groupe is not null) as students_with_group;
