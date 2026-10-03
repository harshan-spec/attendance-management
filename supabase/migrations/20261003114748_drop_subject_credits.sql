-- Apply after the app no longer selects this column.
alter table public.subjects drop column credits;
notify pgrst, 'reload schema';
