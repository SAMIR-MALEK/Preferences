-- ═══════════════════════════════════════════════════════════════════════════
-- متابعة حضور الأساتذة عبر القاعات (نسخة الهاتف)
-- يسجّل: رئيسا القسمين فقط، كلٌّ لحصص مستويات قسمه، والتعديل في أي وقت
-- يرى: الإدارة (super_admin / admin)، ورئيس القسم لقسمه، والأستاذ نتائجه فقط إن سمحت الإدارة
-- يُنفَّذ مرة واحدة في Supabase SQL Editor. لا يمس أي جدول قائم.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.prof_checks (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null,
  check_date    date not null,
  status        text not null check (status in ('حاضر','غائب','متأخر')),
  note          text,
  professor_id  uuid,
  assignment_id uuid,
  recorded_by   uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  unique (schedule_id, check_date)
);

create table if not exists public.prof_check_settings (
  id           int primary key default 1 check (id = 1),
  show_to_prof boolean not null default false
);
insert into public.prof_check_settings (id, show_to_prof) values (1, false) on conflict (id) do nothing;

alter table public.prof_checks enable row level security;
alter table public.prof_check_settings enable row level security;
revoke all on public.prof_checks, public.prof_check_settings from anon, authenticated;

-- ── من أنا؟ ────────────────────────────────────────────────────────────────
create or replace function public.pc_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and is_active = true and role in ('super_admin','admin'));
$$;

-- قسم رئيس القسم (حساب إدارة بدور dept_head)، وإلا null
create or replace function public.pc_my_dept() returns text
language sql stable security definer set search_path = public as $$
  select department from admins
  where user_id = auth.uid() and is_active = true and role = 'dept_head' and department in ('عام','خاص')
  limit 1;
$$;

-- قسم حصة مبرمجة (من مستوى تكليفها)
create or replace function public.pc_schedule_dept(p_schedule uuid) returns text
language sql stable security definer set search_path = public as $$
  select l.department from schedules s
  join assignments a on a.id = s.assignment_id
  join levels l on l.id = a.level_id
  where s.id = p_schedule;
$$;

-- ── التسجيل (رئيس القسم فقط، لحصص قسمه) ──────────────────────────────────
create or replace function public.pc_set(p_schedule uuid, p_date date, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_dept text := pc_my_dept(); v_prof uuid; v_asg uuid;
begin
  if v_dept is null then raise exception 'التسجيل من صلاحية رئيسي القسمين فقط'; end if;
  if coalesce(pc_schedule_dept(p_schedule), '') <> v_dept then raise exception 'هذه الحصة ليست من مستويات قسمك'; end if;
  if p_date > current_date then raise exception 'لا يمكن التسجيل لتاريخ لم يحن بعد'; end if;
  select a.professor_id, a.id into v_prof, v_asg from schedules s join assignments a on a.id = s.assignment_id where s.id = p_schedule;
  if p_status is null then
    delete from prof_checks where schedule_id = p_schedule and check_date = p_date;
    return;
  end if;
  insert into prof_checks (schedule_id, check_date, status, note, professor_id, assignment_id, recorded_by, updated_at)
  values (p_schedule, p_date, p_status, nullif(trim(p_note), ''), v_prof, v_asg, auth.uid(), now())
  on conflict (schedule_id, check_date) do update
    set status = excluded.status, note = excluded.note, recorded_by = excluded.recorded_by, updated_at = now();
end; $$;

-- ── القراءة: تسجيلات يوم (للبطاقة) ───────────────────────────────────────
create or replace function public.pc_day(p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_dept text := pc_my_dept(); v_admin boolean := pc_is_admin();
begin
  if not v_admin and v_dept is null then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('schedule_id', c.schedule_id, 'status', c.status, 'note', c.note))
    from prof_checks c
    where c.check_date = p_date and (v_admin or pc_schedule_dept(c.schedule_id) = v_dept)), '[]'::jsonb);
end; $$;

-- ── التقرير: حسب الأستاذ لفترة ────────────────────────────────────────────
create or replace function public.pc_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_dept text := pc_my_dept(); v_admin boolean := pc_is_admin();
begin
  if not v_admin and v_dept is null then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(r order by r->>'name') from (
    select jsonb_build_object(
      'professor_id', p.id,
      'name', trim(coalesce(p.last_name,'') || ' ' || coalesce(p.first_name,'')),
      'username', p.username,
      'present', count(*) filter (where c.status = 'حاضر'),
      'absent',  count(*) filter (where c.status = 'غائب'),
      'late',    count(*) filter (where c.status = 'متأخر'),
      'details', jsonb_agg(jsonb_build_object('date', c.check_date, 'status', c.status, 'note', c.note,
                 'module', m.name_ar, 'level', l.code, 'kind', a.teaching_type) order by c.check_date)
    ) as r
    from prof_checks c
    join professors p on p.id = c.professor_id
    left join assignments a on a.id = c.assignment_id
    left join modules m on m.id = a.module_id
    left join levels l on l.id = a.level_id
    where c.check_date between p_from and p_to
      and (v_admin or l.department = v_dept)
    group by p.id
  ) x), '[]'::jsonb);
end; $$;

-- ── الإظهار للأساتذة (الإدارة فقط) ────────────────────────────────────────
create or replace function public.pc_visibility() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select show_to_prof from prof_check_settings where id = 1), false);
$$;

create or replace function public.pc_set_visibility(p_show boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pc_is_admin() then raise exception 'غير مصرح'; end if;
  update prof_check_settings set show_to_prof = p_show where id = 1;
end; $$;

-- الأستاذ: نتائجه فقط، وإن سمحت الإدارة
create or replace function public.pc_my() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_prof uuid;
begin
  if not pc_visibility() then return null; end if;
  select id into v_prof from professors where user_id = auth.uid() limit 1;
  if v_prof is null then return null; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('date', c.check_date, 'status', c.status, 'note', c.note,
           'module', m.name_ar, 'level', l.code, 'kind', a.teaching_type) order by c.check_date desc)
    from prof_checks c
    left join assignments a on a.id = c.assignment_id
    left join modules m on m.id = a.module_id
    left join levels l on l.id = a.level_id
    where c.professor_id = v_prof), '[]'::jsonb);
end; $$;

do $$ declare f text; begin
  foreach f in array array['pc_is_admin()','pc_my_dept()','pc_schedule_dept(uuid)','pc_set(uuid,date,text,text)',
    'pc_day(date)','pc_report(date,date)','pc_visibility()','pc_set_visibility(boolean)','pc_my()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'prof_checks ok' as status,
  (select count(*) from admins where role = 'dept_head' and is_active and department in ('عام','خاص')) as dept_heads;
