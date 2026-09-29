alter table public.semesters
  add column if not exists academic_profile jsonb;

alter table public.semesters
  drop constraint if exists semesters_academic_profile_object_check;

alter table public.semesters
  add constraint semesters_academic_profile_object_check
  check (academic_profile is null or jsonb_typeof(academic_profile) = 'object');

alter function public.save_attendly_workspace(jsonb)
  rename to save_attendly_workspace_data;

create or replace function public.save_attendly_workspace(p_workspace jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace_user_id uuid := auth.uid();
begin
  if workspace_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform public.save_attendly_workspace_data(p_workspace);

  update public.semesters as semester
  set academic_profile = items.item -> 'academicProfile',
      updated_at = now()
  from pg_catalog.jsonb_array_elements(p_workspace -> 'semesters') as items(item)
  where semester.user_id = workspace_user_id
    and semester.id = (items.item ->> 'id')::uuid
    and items.item ? 'academicProfile';
end;
$$;

revoke all on function public.save_attendly_workspace(jsonb) from public, anon;
grant execute on function public.save_attendly_workspace(jsonb) to authenticated;
