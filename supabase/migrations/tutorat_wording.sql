-- المرافقة البيداغوجية: إزالة كلمة «حملة» من رسائل الخادم (لا تغيير في المنطق)
-- يُنفَّذ مرة واحدة في Supabase SQL Editor

create or replace function public.tut_apply(p_year text) returns void
language plpgsql security definer set search_path = public as $$
declare v_prof uuid := tut_my_prof(); v_u text;
begin
  if v_prof is null then raise exception 'حساب الأستاذ غير موجود'; end if;
  select username into v_u from professors where id = v_prof;
  if coalesce(v_u, '') ~* '^v' then raise exception 'الترشح للأساتذة الدائمين فقط'; end if;
  if not tut_campaign_open(p_year) then raise exception 'الترشح للمرافقة البيداغوجية مغلق'; end if;
  insert into tutorat_candidates (academic_year, professor_id, extra_hours, allowed_hours, declared)
  values (p_year, v_prof, 0, 0, true)
  on conflict (academic_year, professor_id) do nothing;
end; $$;

create or replace function public.tut_withdraw(p_year text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tut_campaign_open(p_year) then raise exception 'لا يمكن السحب بعد انتهاء فترة الترشح'; end if;
  delete from tutorat_candidates where academic_year = p_year and professor_id = tut_my_prof();
end; $$;

create or replace function public.tut_field_decide(p_id uuid, p_decision text) returns void
language plpgsql security definer set search_path = public as $$
declare v_year text;
begin
  if not tut_has_role('field_head') then raise exception 'غير مصرح'; end if;
  select academic_year into v_year from tutorat_candidates where id = p_id;
  if tut_campaign_open(v_year) then raise exception 'القرار بعد انتهاء فترة الترشح'; end if;
  if exists (select 1 from tutorat_campaigns where academic_year = v_year and field_sent_at is not null) then
    raise exception 'أُرسلت القائمة لرئيس القسم'; end if;
  update tutorat_candidates set field_decision = p_decision, updated_at = now() where id = p_id;
end; $$;

create or replace function public.tut_field_send(p_year text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not tut_has_role('field_head') then raise exception 'غير مصرح'; end if;
  if tut_campaign_open(p_year) then raise exception 'فترة الترشح ما زالت مفتوحة'; end if;
  if exists (select 1 from tutorat_candidates where academic_year = p_year and field_decision is null) then
    raise exception 'بقيت ملفات بلا قرار'; end if;
  update tutorat_campaigns set field_sent_at = now() where academic_year = p_year;
end; $$;

select 'wording ok' as status;
