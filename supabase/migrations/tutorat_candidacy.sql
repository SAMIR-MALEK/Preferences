-- ═══════════════════════════════════════════════════════════════════════════
-- المرافقة البيداغوجية — المرحلة الأولى: الترشح والاختيار
-- الأساس: المرسوم التنفيذي 09-03، القرار 148 (16/06/2010)، القرار 713 (03/11/2011)
-- يُنفَّذ مرة واحدة في Supabase SQL Editor. لا يمس أي جدول قائم.
-- كل الكتابة تمر عبر دوال RPC محمية؛ لا صلاحيات مباشرة على الجداول.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── الجداول ────────────────────────────────────────────────────────────────
create table if not exists public.tutorat_campaigns (
  academic_year  text primary key,
  semester       int  not null default 1,
  is_open        boolean not null default false,
  deadline       date,
  field_sent_at  timestamptz,      -- إرسال رئيس الميدان القائمة لرئيس القسم
  dept_sent_at   timestamptz,      -- إرسال رئيس القسم القائمة للعميد
  created_at     timestamptz not null default now()
);

create table if not exists public.tutorat_candidates (
  id              uuid primary key default gen_random_uuid(),
  academic_year   text not null,
  professor_id    uuid not null references public.professors(id) on delete cascade,
  extra_hours     numeric not null default 0,   -- الساعات الإضافية وقت الترشح
  allowed_hours   numeric not null default 0,   -- min(4, 12 - الإضافية)
  declared        boolean not null default false,
  field_decision  text check (field_decision in ('مقترح','غير مقترح')),
  dept_opinion    text check (dept_opinion in ('موافق','متحفظ')),
  dept_note       text,
  dean_decision   text check (dean_decision in ('مصادق','مرفوض')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (academic_year, professor_id)
);

-- بيانات العقد الحساسة: منفصلة، لا يراها إلا الأستاذ والعميد ونائبه والإدارة
create table if not exists public.tutorat_private (
  candidate_id   uuid primary key references public.tutorat_candidates(id) on delete cascade,
  birth_date     date not null,
  diploma        text not null,
  diploma_date   date not null,
  address        text not null,
  ccp            text not null,
  updated_at     timestamptz not null default now()
);

alter table public.tutorat_campaigns  enable row level security;
alter table public.tutorat_candidates enable row level security;
alter table public.tutorat_private    enable row level security;
revoke all on public.tutorat_campaigns, public.tutorat_candidates, public.tutorat_private from anon, authenticated;

-- ── دوال مساعدة ────────────────────────────────────────────────────────────
create or replace function public.tut_my_prof() returns uuid
language sql stable security definer set search_path = public as $$
  select id from professors where user_id = auth.uid() limit 1;
$$;

create or replace function public.tut_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and is_active = true
                 and role in ('super_admin','admin'));
$$;

create or replace function public.tut_has_role(p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from professor_roles r where r.professor_id = tut_my_prof() and r.role = p_role);
$$;

-- رئيس قسم القانون العام (السنة الأولى تابعة له): حساب أستاذ بمنصب، أو حساب إدارة رئيس قسم
create or replace function public.tut_is_dept_public() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from professor_roles r
    where r.professor_id = tut_my_prof() and r.role = 'dept_head'
      and (r.speciality = 'عام' or r.speciality in (select id::text from levels where department = 'عام'))
  ) or exists (
    select 1 from admins where user_id = auth.uid() and is_active = true and role = 'dept_head' and department = 'عام'
  );
$$;

-- من يرى البيانات الحساسة
create or replace function public.tut_sees_private() returns boolean
language sql stable security definer set search_path = public as $$
  select tut_is_admin() or tut_has_role('dean') or tut_has_role('vice_dean');
$$;

create or replace function public.tut_campaign_open(p_year text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_open and (deadline is null or current_date <= deadline)
                   from tutorat_campaigns where academic_year = p_year), false);
$$;

-- الساعات الإضافية والمسموحة لأستاذ (من التكاليف، للسداسي المحدد في الحملة)
create or replace function public.tut_hours(p_prof uuid, p_year text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_sem int; v_total numeric; v_max numeric; v_extra numeric;
begin
  select coalesce(semester, 1) into v_sem from tutorat_campaigns where academic_year = p_year;
  v_sem := coalesce(v_sem, 1);
  select coalesce(sum(weekly_hours), 0) into v_total from assignments
   where professor_id = p_prof and academic_year = p_year and semester = v_sem;
  select coalesce(max_weekly_hours, 9) into v_max from professors where id = p_prof;
  v_extra := greatest(0, v_total - coalesce(v_max, 9));
  return jsonb_build_object('semester', v_sem, 'total', v_total, 'extra', v_extra,
                            'allowed', least(4, greatest(0, 12 - v_extra)));
end; $$;

-- ── الحملة ─────────────────────────────────────────────────────────────────
create or replace function public.tut_campaign(p_year text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select to_jsonb(c) || jsonb_build_object('open_now', tut_campaign_open(p_year))
                   from tutorat_campaigns c where academic_year = p_year),
                  jsonb_build_object('academic_year', p_year, 'is_open', false, 'open_now', false));
$$;

create or replace function public.tut_admin_set_campaign(p_year text, p_open boolean, p_deadline date, p_semester int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tut_is_admin() then raise exception 'غير مصرح'; end if;
  insert into tutorat_campaigns (academic_year, is_open, deadline, semester)
  values (p_year, p_open, p_deadline, coalesce(p_semester, 1))
  on conflict (academic_year) do update
    set is_open = excluded.is_open, deadline = excluded.deadline, semester = excluded.semester;
end; $$;

-- تصحيح من الإدارة: إلغاء إرسال مرحلة (field أو dept)
create or replace function public.tut_admin_unsend(p_year text, p_stage text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not tut_is_admin() then raise exception 'غير مصرح'; end if;
  if p_stage = 'field' then
    update tutorat_campaigns set field_sent_at = null, dept_sent_at = null where academic_year = p_year;
  elsif p_stage = 'dept' then
    update tutorat_campaigns set dept_sent_at = null where academic_year = p_year;
  end if;
end; $$;

-- ── الأستاذ ────────────────────────────────────────────────────────────────
create or replace function public.tut_my(p_year text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_prof uuid := tut_my_prof(); v_c tutorat_candidates; v_p tutorat_private; v_u text;
begin
  if v_prof is null then return null; end if;
  select username into v_u from professors where id = v_prof;
  select * into v_c from tutorat_candidates where academic_year = p_year and professor_id = v_prof;
  if v_c.id is not null then select * into v_p from tutorat_private where candidate_id = v_c.id; end if;
  return jsonb_build_object(
    'permanent', coalesce(v_u, '') !~* '^v',
    'hours', tut_hours(v_prof, p_year),
    'campaign', tut_campaign(p_year),
    'candidate', case when v_c.id is null then null else jsonb_build_object(
        'id', v_c.id, 'allowed_hours', v_c.allowed_hours, 'extra_hours', v_c.extra_hours,
        'dean_decision', v_c.dean_decision, 'created_at', v_c.created_at) end,
    'private', case when v_p.candidate_id is null then null else jsonb_build_object(
        'birth_date', v_p.birth_date, 'diploma', v_p.diploma, 'diploma_date', v_p.diploma_date,
        'address', v_p.address, 'ccp', v_p.ccp) end);
end; $$;

create or replace function public.tut_submit(p_year text, p_birth date, p_diploma text, p_diploma_date date,
                                             p_address text, p_ccp text, p_declared boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_prof uuid := tut_my_prof(); v_u text; v_h jsonb; v_id uuid;
begin
  if v_prof is null then raise exception 'حساب الأستاذ غير موجود'; end if;
  select username into v_u from professors where id = v_prof;
  if coalesce(v_u, '') ~* '^v' then raise exception 'الترشح للأساتذة الدائمين فقط'; end if;
  if not tut_campaign_open(p_year) then raise exception 'حملة الترشح مغلقة'; end if;
  if p_declared is not true then raise exception 'يجب الإقرار بصحة المعلومات'; end if;
  if p_birth is null or p_diploma_date is null or coalesce(trim(p_diploma), '') = ''
     or coalesce(trim(p_address), '') = '' or coalesce(trim(p_ccp), '') = '' then
    raise exception 'كل الخانات إجبارية';
  end if;
  if p_birth > current_date or p_diploma_date > current_date then raise exception 'التاريخ لا يكون في المستقبل'; end if;
  v_h := tut_hours(v_prof, p_year);
  if (v_h->>'allowed')::numeric <= 0 then
    raise exception 'لا يمكن الترشح: الساعات الإضافية تبلغ السقف (12 ساعة، المادة 4 من القرار 148)';
  end if;
  insert into tutorat_candidates (academic_year, professor_id, extra_hours, allowed_hours, declared)
  values (p_year, v_prof, (v_h->>'extra')::numeric, (v_h->>'allowed')::numeric, true)
  on conflict (academic_year, professor_id) do update
    set extra_hours = excluded.extra_hours, allowed_hours = excluded.allowed_hours,
        declared = true, updated_at = now()
  returning id into v_id;
  insert into tutorat_private (candidate_id, birth_date, diploma, diploma_date, address, ccp)
  values (v_id, p_birth, trim(p_diploma), p_diploma_date, trim(p_address), trim(p_ccp))
  on conflict (candidate_id) do update
    set birth_date = excluded.birth_date, diploma = excluded.diploma, diploma_date = excluded.diploma_date,
        address = excluded.address, ccp = excluded.ccp, updated_at = now();
end; $$;

create or replace function public.tut_withdraw(p_year text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tut_campaign_open(p_year) then raise exception 'لا يمكن السحب بعد غلق الحملة'; end if;
  delete from tutorat_candidates where academic_year = p_year and professor_id = tut_my_prof();
end; $$;

-- ── قائمة الملفات حسب الدور ────────────────────────────────────────────────
create or replace function public.tut_list(p_year text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_priv boolean := tut_sees_private(); v_ok boolean;
begin
  v_ok := v_priv or tut_has_role('field_head') or tut_is_dept_public();
  if not v_ok then raise exception 'غير مصرح'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'professor_id', c.professor_id,
      'name', trim(coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '')),
      'rank', p.rank, 'phone', p.phone, 'email', p.email,
      'extra_hours', c.extra_hours, 'allowed_hours', c.allowed_hours,
      'field_decision', c.field_decision, 'dept_opinion', c.dept_opinion, 'dept_note', c.dept_note,
      'dean_decision', c.dean_decision, 'created_at', c.created_at,
      'private', case when v_priv then (select jsonb_build_object(
          'birth_date', x.birth_date, 'diploma', x.diploma, 'diploma_date', x.diploma_date,
          'address', x.address, 'ccp', x.ccp) from tutorat_private x where x.candidate_id = c.id) end
    ) order by p.last_name, p.first_name)
    from tutorat_candidates c join professors p on p.id = c.professor_id
    where c.academic_year = p_year), '[]'::jsonb);
end; $$;

-- ── رئيس الميدان: يقرر بعد غلق الحملة، ثم يرسل ────────────────────────────
create or replace function public.tut_field_decide(p_id uuid, p_decision text) returns void
language plpgsql security definer set search_path = public as $$
declare v_year text;
begin
  if not tut_has_role('field_head') then raise exception 'غير مصرح'; end if;
  select academic_year into v_year from tutorat_candidates where id = p_id;
  if tut_campaign_open(v_year) then raise exception 'القرار بعد غلق الحملة'; end if;
  if exists (select 1 from tutorat_campaigns where academic_year = v_year and field_sent_at is not null) then
    raise exception 'أُرسلت القائمة لرئيس القسم'; end if;
  update tutorat_candidates set field_decision = p_decision, updated_at = now() where id = p_id;
end; $$;

create or replace function public.tut_field_send(p_year text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tut_has_role('field_head') then raise exception 'غير مصرح'; end if;
  if tut_campaign_open(p_year) then raise exception 'الحملة ما زالت مفتوحة'; end if;
  if exists (select 1 from tutorat_candidates where academic_year = p_year and field_decision is null) then
    raise exception 'بقيت ملفات بلا قرار'; end if;
  update tutorat_campaigns set field_sent_at = now() where academic_year = p_year;
end; $$;

-- ── رئيس قسم القانون العام: رأي على المقترحين، ثم يرسل ───────────────────
create or replace function public.tut_dept_opinion(p_id uuid, p_opinion text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_year text;
begin
  if not tut_is_dept_public() then raise exception 'غير مصرح'; end if;
  select academic_year into v_year from tutorat_candidates where id = p_id and field_decision = 'مقترح';
  if v_year is null then raise exception 'الملف غير مقترح'; end if;
  if not exists (select 1 from tutorat_campaigns where academic_year = v_year
                 and field_sent_at is not null and dept_sent_at is null) then
    raise exception 'المرحلة غير متاحة'; end if;
  update tutorat_candidates set dept_opinion = p_opinion, dept_note = nullif(trim(p_note), ''), updated_at = now()
   where id = p_id;
end; $$;

create or replace function public.tut_dept_send(p_year text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tut_is_dept_public() then raise exception 'غير مصرح'; end if;
  if not exists (select 1 from tutorat_campaigns where academic_year = p_year and field_sent_at is not null) then
    raise exception 'لم تصل القائمة بعد'; end if;
  if exists (select 1 from tutorat_candidates where academic_year = p_year
             and field_decision = 'مقترح' and dept_opinion is null) then
    raise exception 'بقيت ملفات بلا رأي'; end if;
  update tutorat_campaigns set dept_sent_at = now() where academic_year = p_year;
end; $$;

-- ── العميد: يصادق أو يرفض (ملفا ملفا أو الكل) ──────────────────────────────
create or replace function public.tut_dean_decide(p_year text, p_id uuid, p_decision text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tut_has_role('dean') then raise exception 'غير مصرح'; end if;
  if not exists (select 1 from tutorat_campaigns where academic_year = p_year and dept_sent_at is not null) then
    raise exception 'لم تصل القائمة بعد'; end if;
  update tutorat_candidates set dean_decision = p_decision, updated_at = now()
   where academic_year = p_year and field_decision = 'مقترح' and (p_id is null or id = p_id);
end; $$;

-- ── العقد: للأستاذ بعد المصادقة، وللعميد ونائبه والإدارة ───────────────────
create or replace function public.tut_contract(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_c tutorat_candidates; v_p tutorat_private; v_pr professors;
begin
  select * into v_c from tutorat_candidates where id = p_id;
  if v_c.id is null then raise exception 'غير موجود'; end if;
  if not (tut_sees_private() or (v_c.professor_id = tut_my_prof() and v_c.dean_decision = 'مصادق')) then
    raise exception 'غير مصرح'; end if;
  select * into v_p from tutorat_private where candidate_id = p_id;
  select * into v_pr from professors where id = v_c.professor_id;
  return jsonb_build_object(
    'academic_year', v_c.academic_year, 'dean_decision', v_c.dean_decision,
    'name', trim(coalesce(v_pr.last_name, '') || ' ' || coalesce(v_pr.first_name, '')),
    'rank', v_pr.rank, 'phone', v_pr.phone,
    'birth_date', v_p.birth_date, 'diploma', v_p.diploma, 'diploma_date', v_p.diploma_date,
    'address', v_p.address, 'ccp', v_p.ccp);
end; $$;

-- ── الصلاحيات ──────────────────────────────────────────────────────────────
do $$ declare f text; begin
  foreach f in array array[
    'tut_my_prof()','tut_is_admin()','tut_has_role(text)','tut_is_dept_public()','tut_sees_private()',
    'tut_campaign_open(text)','tut_hours(uuid,text)','tut_campaign(text)',
    'tut_admin_set_campaign(text,boolean,date,int)','tut_admin_unsend(text,text)','tut_my(text)',
    'tut_submit(text,date,text,date,text,text,boolean)','tut_withdraw(text)','tut_list(text)',
    'tut_field_decide(uuid,text)','tut_field_send(text)','tut_dept_opinion(uuid,text,text)',
    'tut_dept_send(text)','tut_dean_decide(text,uuid,text)','tut_contract(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- tut_hours تكشف ساعات أي أستاذ: نحصرها في الدوال الداخلية فقط
revoke execute on function public.tut_hours(uuid,text) from authenticated;

-- ── تحقق ───────────────────────────────────────────────────────────────────
select 'tutorat ok' as status,
  (select count(*) from professor_roles where role = 'field_head') as field_heads,
  (select count(*) from professor_roles where role = 'dean') as deans,
  (select count(*) from professor_roles where role = 'dept_head') as dept_heads;
