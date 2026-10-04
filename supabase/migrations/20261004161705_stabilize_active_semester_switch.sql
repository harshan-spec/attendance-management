-- Keep the one-active-semester invariant safe when a student switches to an
-- older semester or when two browser tabs save at nearly the same time.
create or replace function public.save_attendly_workspace(p_workspace jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace_user_id uuid := auth.uid();
  active_semester_id uuid := nullif(p_workspace ->> 'activeSemesterId', '')::uuid;
begin
  if workspace_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Serialize full-workspace saves for one student and deactivate the old
  -- semester before the workspace upsert assigns the new active semester.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(workspace_user_id::text, 0)
  );

  update public.semesters
  set is_active = false,
      updated_at = now()
  where user_id = workspace_user_id
    and is_active
    and id is distinct from active_semester_id;

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
