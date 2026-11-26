-- متابعة حضور الأساتذة: السماح للإدارة (المشرف العام، العميد، نائب العميد) بالتسجيل لكل الأقسام
-- رئيسا القسمين يبقيان محصورين في قسميهما. يُنفَّذ مرة واحدة بعد prof_checks.sql

create or replace function public.pc_set(p_schedule uuid, p_date date, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare v_dept text := pc_my_dept(); v_admin boolean := pc_is_admin(); v_prof uuid; v_asg uuid;
begin
  if not v_admin and v_dept is null then raise exception 'التسجيل من صلاحية الإدارة ورئيسي القسمين فقط'; end if;
  if not v_admin and coalesce(pc_schedule_dept(p_schedule), '') <> v_dept then raise exception 'هذه الحصة ليست من مستويات قسمك'; end if;
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

select 'prof_checks admin ok' as status;
