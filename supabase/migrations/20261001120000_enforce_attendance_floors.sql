-- Keep the product's stated attendance minimums enforced in the database,
-- even when a workspace is written outside the web settings form.
update public.attendance_settings
set overall_target = 80
where overall_target < 80;

alter table public.attendance_settings
  drop constraint if exists attendance_settings_overall_target_check;

alter table public.attendance_settings
  add constraint attendance_settings_overall_target_check
  check (overall_target between 80 and 100);
