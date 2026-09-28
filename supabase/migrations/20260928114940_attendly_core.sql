create table public.student_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  department text,
  department_code text,
  section text,
  section_code text,
  study_year smallint check (study_year between 1 and 4),
  semester smallint check (semester between 1 and 8),
  academic_year text,
  academic_year_code text,
  college_timetable_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (semester is null or study_year is null or ceil(semester / 2.0)::smallint = study_year)
);

create or replace function public.create_attendly_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  academic_profile jsonb := new.raw_user_meta_data -> 'academic_profile';
begin
  insert into public.student_profiles (
    id, full_name, department, department_code, section, section_code,
    study_year, semester, academic_year, academic_year_code, college_timetable_url
  ) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    academic_profile ->> 'department',
    academic_profile ->> 'departmentCode',
    academic_profile ->> 'section',
    academic_profile ->> 'sectionCode',
    case when academic_profile ->> 'studyYear' ~ '^[1-4]$' then (academic_profile ->> 'studyYear')::smallint end,
    case when academic_profile ->> 'semester' ~ '^[1-8]$' then (academic_profile ->> 'semester')::smallint end,
    academic_profile ->> 'academicYear',
    academic_profile ->> 'academicYearCode',
    academic_profile ->> 'collegeTimetableUrl'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    department = excluded.department,
    department_code = excluded.department_code,
    section = excluded.section,
    section_code = excluded.section_code,
    study_year = excluded.study_year,
    semester = excluded.semester,
    academic_year = excluded.academic_year,
    academic_year_code = excluded.academic_year_code,
    college_timetable_url = excluded.college_timetable_url,
    updated_at = now();
  return new;
end;
$$;

create trigger on_attendly_auth_user_created
  after insert on auth.users
  for each row execute function public.create_attendly_profile();

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  start_date date not null,
  end_date date,
  is_archived boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_date is null or end_date >= start_date)
);

create unique index semesters_one_active_per_user
  on public.semesters (user_id) where is_active;

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  semester_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  code text not null default '' check (char_length(code) <= 20),
  credits smallint not null default 3 check (credits between 1 and 10),
  required_attendance numeric(5, 2) not null default 75 check (required_attendance between 75 and 100),
  color text not null default '#4f8f78' check (char_length(color) <= 20),
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (id, user_id, semester_id),
  foreign key (semester_id, user_id) references public.semesters (id, user_id) on delete cascade
);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject_id uuid not null,
  attendance_date date not null,
  day_of_week smallint generated always as (extract(dow from attendance_date)::smallint) stored,
  periods smallint not null check (periods between 1 and 12),
  attended smallint not null check (attended between 0 and periods),
  note text check (note is null or char_length(note) <= 140),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, user_id) references public.subjects (id, user_id) on delete cascade
);

create index attendance_records_user_date_idx
  on public.attendance_records (user_id, attendance_date desc);

create table public.timetable_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  semester_id uuid not null,
  subject_id uuid not null,
  weekday smallint not null check (weekday between 1 and 5),
  hour smallint not null check (hour between 1 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, semester_id, weekday, hour),
  foreign key (semester_id, user_id) references public.semesters (id, user_id) on delete cascade,
  foreign key (subject_id, user_id, semester_id) references public.subjects (id, user_id, semester_id) on delete cascade
);

create table public.attendance_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  overall_target numeric(5, 2) not null default 80 check (overall_target between 0 and 100),
  default_subject_target numeric(5, 2) not null default 75 check (default_subject_target between 75 and 100),
  theme text not null default 'light' check (theme in ('light', 'dark')),
  updated_at timestamptz not null default now()
);

alter table public.student_profiles enable row level security;
alter table public.semesters enable row level security;
alter table public.subjects enable row level security;
alter table public.attendance_records enable row level security;
alter table public.timetable_entries enable row level security;
alter table public.attendance_settings enable row level security;

create policy student_profiles_read_own on public.student_profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy student_profiles_update_own on public.student_profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy semesters_owner_all on public.semesters
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy subjects_owner_all on public.subjects
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy attendance_records_owner_all on public.attendance_records
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy timetable_entries_owner_all on public.timetable_entries
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy attendance_settings_owner_all on public.attendance_settings
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, update on public.student_profiles to authenticated;
grant select, insert, update, delete on
  public.semesters, public.subjects, public.attendance_records,
  public.timetable_entries, public.attendance_settings to authenticated;

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

  insert into public.subjects (id, user_id, semester_id, name, code, credits, required_attendance, color, is_archived, updated_at)
  select
    (item ->> 'id')::uuid,
    workspace_user_id,
    (item ->> 'semesterId')::uuid,
    btrim(item ->> 'name'),
    coalesce(item ->> 'code', ''),
    (item ->> 'credits')::smallint,
    (item ->> 'requiredAttendance')::numeric(5, 2),
    coalesce(item ->> 'color', '#4f8f78'),
    coalesce((item ->> 'archived')::boolean, false),
    now()
  from pg_catalog.jsonb_array_elements(p_workspace -> 'subjects') as items(item)
  on conflict (id) do update set
    semester_id = excluded.semester_id,
    name = excluded.name,
    code = excluded.code,
    credits = excluded.credits,
    required_attendance = excluded.required_attendance,
    color = excluded.color,
    is_archived = excluded.is_archived,
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

revoke all on function public.save_attendly_workspace(jsonb) from public, anon;
grant execute on function public.save_attendly_workspace(jsonb) to authenticated;
