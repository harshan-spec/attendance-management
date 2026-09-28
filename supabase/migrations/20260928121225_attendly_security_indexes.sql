revoke all on function public.create_attendly_profile() from public, anon, authenticated;

create index if not exists semesters_user_id_idx
  on public.semesters (user_id);
create index if not exists subjects_semester_owner_idx
  on public.subjects (semester_id, user_id);
create index if not exists subjects_user_id_idx
  on public.subjects (user_id);
create index if not exists attendance_records_subject_owner_idx
  on public.attendance_records (subject_id, user_id);
create index if not exists timetable_entries_semester_owner_idx
  on public.timetable_entries (semester_id, user_id);
create index if not exists timetable_entries_subject_owner_idx
  on public.timetable_entries (subject_id, user_id, semester_id);
