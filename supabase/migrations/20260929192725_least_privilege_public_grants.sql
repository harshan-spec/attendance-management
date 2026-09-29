-- Existing Supabase projects may grant every table privilege to anon and
-- authenticated by default. RLS still filters rows, but TRUNCATE bypasses
-- row-level policies. Keep only the operations Attendly actually needs.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from public, anon, authenticated;

grant select, update on public.student_profiles to authenticated;
grant select, insert, update, delete on
  public.semesters,
  public.subjects,
  public.attendance_records,
  public.timetable_entries,
  public.attendance_settings
to authenticated;

grant execute on function public.save_attendly_workspace(jsonb) to authenticated;
grant execute on function public.save_attendly_workspace_data(jsonb) to authenticated;

-- Make future app objects opt-in as well. New migrations must add their
-- explicit grants beside their RLS policies.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
