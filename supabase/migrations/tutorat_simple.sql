-- ═══════════════════════════════════════════════════════════════════════════
-- المرافقة البيداغوجية — تبسيط الترشح: زر واحد، بلا ساعات ولا سقف ولا عقد ولا بيانات شخصية
-- يُنفَّذ مرة واحدة في Supabase SQL Editor بعد tutorat_candidacy.sql
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.tut_apply(p_year text) returns void
language plpgsql security definer set search_path = public as $$
declare v_prof uuid := tut_my_prof(); v_u text;
begin
  if v_prof is null then raise exception 'حساب الأستاذ غير موجود'; end if;
  select username into v_u from professors where id = v_prof;
  if coalesce(v_u, '') ~* '^v' then raise exception 'الترشح للأساتذة الدائمين فقط'; end if;
  if not tut_campaign_open(p_year) then raise exception 'حملة الترشح مغلقة'; end if;
  insert into tutorat_candidates (academic_year, professor_id, extra_hours, allowed_hours, declared)
  values (p_year, v_prof, 0, 0, true)
  on conflict (academic_year, professor_id) do nothing;
end; $$;

revoke all on function public.tut_apply(text) from public, anon;
grant execute on function public.tut_apply(text) to authenticated;

-- إيقاف المسار القديم (الاستمارة والعقد): لم يعودا مستعملين
revoke execute on function public.tut_submit(text,date,text,date,text,text,boolean) from authenticated;
revoke execute on function public.tut_contract(uuid) from authenticated;

select 'tutorat simple ok' as status;
