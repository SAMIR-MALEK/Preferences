-- ═══════════════════════════════════════════════════════════════════════════
-- ممثلو الأفواج: رقم الهاتف إلزامي
-- يُحفظ في هاتف الطالب نفسه (students.phone). إن كان موجودا لا يُطلب.
-- 1) التعيين من الإدارة يرفض طالبا بلا هاتف ما لم تُدخل الإدارة رقمه
-- 2) الممثل المعيّن سابقا بلا هاتف يُلزَم بإدخاله قبل أي تأكيد
-- يُنفَّذ مرة واحدة بعد group_reps.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- رقم جزائري: 10 أرقام تبدأ بـ 05 أو 06 أو 07 (تُحذف الفراغات والشرطات)
create or replace function public.gr_norm_phone(p text) returns text
language plpgsql immutable as $$
declare v text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if v like '213%' and length(v) = 12 then v := '0' || substr(v, 4); end if;
  if v !~ '^0[567][0-9]{8}$' then raise exception 'رقم الهاتف غير صحيح: 10 أرقام تبدأ بـ 05 أو 06 أو 07'; end if;
  return v;
end; $$;

create or replace function public.gr_my(p_bac text, p_year int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_st uuid := gr_student(p_bac, p_year); g record; v_phone text; d date; v_from date; v_now time;
        v_list jsonb := '[]'::jsonb; x record; c record;
begin
  if v_st is null then return null; end if;
  select gr.*, l.name_ar as level_name into g
  from group_reps gr join levels l on l.id = gr.level_id
  where gr.student_id = v_st and gr.academic_year = '2026-2027';
  if not found then return null; end if;
  select nullif(trim(phone), '') into v_phone from students where id = v_st;

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
                            'groupe', g.groupe, 'today', gr_today(), 'phone', v_phone, 'sessions', v_list);
end; $$;

create or replace function public.gr_confirm(p_bac text, p_year int, p_schedule uuid, p_date date,
                                             p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_st uuid := gr_student(p_bac, p_year); g record; x record;
begin
  if v_st is null then raise exception 'تعذر التعرف على الطالب'; end if;
  select * into g from group_reps where student_id = v_st and academic_year = '2026-2027';
  if not found then raise exception 'هذه الخدمة لممثلي الأفواج فقط'; end if;
  if coalesce(trim((select phone from students where id = v_st)), '') = '' then
    raise exception 'سجّل رقم هاتفك أولا';
  end if;
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

-- الممثل يسجّل هاتفه
create or replace function public.gr_set_phone(p_bac text, p_year int, p_phone text)
returns text language plpgsql security definer set search_path = public as $$
declare v_st uuid := gr_student(p_bac, p_year); v text := gr_norm_phone(p_phone);
begin
  if v_st is null or not exists (select 1 from group_reps where student_id = v_st and academic_year = '2026-2027') then
    raise exception 'هذه الخدمة لممثلي الأفواج فقط';
  end if;
  update students set phone = v where id = v_st;
  return v;
end; $$;

-- التعيين: الهاتف إلزامي (p_phone يُستعمل إن لم يكن للطالب هاتف أو لتصحيحه)
drop function if exists public.gr_assign(uuid, int, int, text, uuid);
create or replace function public.gr_assign(p_level uuid, p_section int, p_groupe int, p_role text, p_student uuid,
                                            p_phone text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if gr_scope() is null or not gr_level_ok(p_level) then raise exception 'غير مصرح'; end if;
  if p_role not in ('ممثل','نائب') then raise exception 'صفة غير صحيحة'; end if;
  if p_student is not null then
    if not exists (select 1 from students s join levels l on l.name_ar = s.specialite
                   where s.id = p_student and l.id = p_level and s.section = p_section and s.groupe = p_groupe) then
      raise exception 'الطالب ليس من هذا الفوج';
    end if;
    if nullif(trim(p_phone), '') is not null then
      update students set phone = gr_norm_phone(p_phone) where id = p_student;
    elsif coalesce(trim((select phone from students where id = p_student)), '') = '' then
      raise exception 'أدخل رقم هاتف الطالب: الهاتف إلزامي للممثل والنائب';
    end if;
  end if;
  delete from group_reps where academic_year = '2026-2027' and level_id = p_level
    and section = p_section and groupe = p_groupe and role = p_role;
  if p_student is null then return; end if;
  delete from group_reps where academic_year = '2026-2027' and student_id = p_student;
  insert into group_reps (level_id, section, groupe, role, student_id) values (p_level, p_section, p_groupe, p_role, p_student);
end; $$;

-- الإدارة تسجّل هاتف ممثل أو نائب معيّن سابقا
create or replace function public.gr_admin_phone(p_student uuid, p_phone text)
returns text language plpgsql security definer set search_path = public as $$
declare v text := gr_norm_phone(p_phone); v_level uuid;
begin
  select level_id into v_level from group_reps where student_id = p_student and academic_year = '2026-2027';
  if v_level is null then raise exception 'الطالب ليس ممثلا ولا نائبا'; end if;
  if gr_scope() is null or not gr_level_ok(v_level) then raise exception 'غير مصرح'; end if;
  update students set phone = v where id = p_student;
  return v;
end; $$;

do $$ declare f text; begin
  foreach f in array array['gr_my(text,integer)','gr_confirm(text,integer,uuid,date,text,text)','gr_set_phone(text,integer,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  foreach f in array array['gr_assign(uuid,integer,integer,text,uuid,text)','gr_admin_phone(uuid,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

select 'group_reps_phone ok' as status,
  (select count(*) from group_reps r join students s on s.id = r.student_id where coalesce(trim(s.phone), '') = '') as reps_without_phone;
