alter table public.student_profiles
  add column if not exists phone_number text;

alter table public.student_profiles
  drop constraint if exists student_profiles_phone_number_format_check;

alter table public.student_profiles
  add constraint student_profiles_phone_number_format_check
  check (phone_number is null or phone_number ~ '^[+]?[0-9][0-9 ()-]{6,24}$');

create or replace function public.create_attendly_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  academic_profile jsonb := new.raw_user_meta_data -> 'academic_profile';
  phone_number text := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone_number', '')), '');
begin
  insert into public.student_profiles (
    id, full_name, phone_number, department, department_code, section, section_code,
    study_year, semester, academic_year, academic_year_code, college_timetable_url
  ) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    phone_number,
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
    phone_number = excluded.phone_number,
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

revoke all on function public.create_attendly_profile() from public, anon, authenticated;
