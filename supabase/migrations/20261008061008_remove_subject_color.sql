-- Subject colors are presentation-only and are no longer part of the Attendly
-- workspace model. Keep the save RPC independent of the column before dropping it.
create or replace function public.save_attendly_workspace_data(p_workspace jsonb)
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

  if jsonb_typeof(p_workspace) is distinct from 'object'
    or jsonb_typeof(p_workspace -> 'semesters') is distinct from 'array'
    or jsonb_typeof(p_workspace -> 'subjects') is distinct from 'array'
    or jsonb_typeof(p_workspace -> 'records') is distinct from 'array'
    or jsonb_typeof(p_workspace -> 'timetable') is distinct from 'array'
    or jsonb_typeof(p_workspace -> 'settings') is distinct from 'object' then
    raise exception 'Invalid workspace payload' using errcode = '22023';
  end if;

  insert into public.semesters (id, user_id, name, start_date, end_date, is_archived, is_active, updated_at)
  select
    (item ->> 'id')::uuid,
    workspace_user_id,
    btrim(item ->> 'name'),
    (item ->> 'startDate')::date,
    nullif(item ->> 'endDate', '')::date,
    coalesce((item ->> 'archived')::boolean, false),
    (item ->> 'id')::uuid = active_semester_id,
    now()
  from pg_catalog.jsonb_array_elements(p_workspace -> 'semesters') as items(item)
  on conflict (id) do update set
    name = excluded.name,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    is_archived = excluded.is_archived,
    is_active = excluded.is_active,
    updated_at = now()
  where public.semesters.user_id = workspace_user_id;

  insert into public.subjects (id, user_id, semester_id, name, code, required_attendance, is_archived, subject_type, internal_marks, updated_at)
  select
    (item ->> 'id')::uuid,
    workspace_user_id,
    (item ->> 'semesterId')::uuid,
    btrim(item ->> 'name'),
    coalesce(item ->> 'code', ''),
    (item ->> 'requiredAttendance')::numeric(5, 2),
    coalesce((item ->> 'archived')::boolean, false),
    coalesce(nullif(item ->> 'subjectType', ''), 'theory'),
    coalesce(item -> 'internalMarks', '{}'::jsonb),
    now()
  from pg_catalog.jsonb_array_elements(p_workspace -> 'subjects') as items(item)
  on conflict (id) do update set
    semester_id = excluded.semester_id,
    name = excluded.name,
    code = excluded.code,
    required_attendance = excluded.required_attendance,
    is_archived = excluded.is_archived,
    subject_type = excluded.subject_type,
    internal_marks = excluded.internal_marks,
    updated_at = now()
  where public.subjects.user_id = workspace_user_id;

  insert into public.attendance_records (id, user_id, subject_id, attendance_date, periods, attended, note, updated_at)
  select
    (item ->> 'id')::uuid,
    workspace_user_id,
    (item ->> 'subjectId')::uuid,
    (item ->> 'date')::date,
    (item ->> 'periods')::smallint,
    (item ->> 'attended')::smallint,
    nullif(item ->> 'note', ''),
    now()
  from pg_catalog.jsonb_array_elements(p_workspace -> 'records') as items(item)
  on conflict (id) do update set
    subject_id = excluded.subject_id,
    attendance_date = excluded.attendance_date,
    periods = excluded.periods,
    attended = excluded.attended,
    note = excluded.note,
    updated_at = now()
  where public.attendance_records.user_id = workspace_user_id;

  insert into public.timetable_entries (user_id, semester_id, subject_id, weekday, hour, updated_at)
  select
    workspace_user_id,
    (item ->> 'semesterId')::uuid,
    (item ->> 'subjectId')::uuid,
    (item ->> 'weekday')::smallint,
    (item ->> 'hour')::smallint,
    now()
  from pg_catalog.jsonb_array_elements(p_workspace -> 'timetable') as items(item)
  on conflict (user_id, semester_id, weekday, hour) do update set
    subject_id = excluded.subject_id,
    updated_at = now();

  insert into public.attendance_settings (user_id, overall_target, default_subject_target, theme, updated_at)
  values (
    workspace_user_id,
    (p_workspace -> 'settings' ->> 'overallTarget')::numeric(5, 2),
    (p_workspace -> 'settings' ->> 'defaultSubjectTarget')::numeric(5, 2),
    p_workspace -> 'settings' ->> 'theme',
    now()
  )
  on conflict (user_id) do update set
    overall_target = excluded.overall_target,
    default_subject_target = excluded.default_subject_target,
    theme = excluded.theme,
    updated_at = now();

  delete from public.attendance_records record
  where record.user_id = workspace_user_id
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_workspace -> 'records') as items(item)
      where item ->> 'id' = record.id::text
    );

  delete from public.timetable_entries entry
  where entry.user_id = workspace_user_id
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_workspace -> 'timetable') as items(item)
      where item ->> 'semesterId' = entry.semester_id::text
        and (item ->> 'weekday')::smallint = entry.weekday
        and (item ->> 'hour')::smallint = entry.hour
    );

  delete from public.subjects subject
  where subject.user_id = workspace_user_id
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_workspace -> 'subjects') as items(item)
      where item ->> 'id' = subject.id::text
    );

  delete from public.semesters semester
  where semester.user_id = workspace_user_id
    and not exists (
      select 1 from pg_catalog.jsonb_array_elements(p_workspace -> 'semesters') as items(item)
      where item ->> 'id' = semester.id::text
    );
end;
$$;

revoke all on function public.save_attendly_workspace_data(jsonb) from public, anon;
grant execute on function public.save_attendly_workspace_data(jsonb) to authenticated;

alter table public.subjects drop column if exists color;
