-- Reject new accounts outside the exact SVCE email domain before creation.
-- Enable this function as the Before User Created hook in Supabase Auth.
create or replace function public.hook_require_svce_email(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(event -> 'user' ->> 'email', '') !~* '^[^[:space:]@]+@svce[.]ac[.]in$' then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 400,
      'message', 'Use your college email address ending in @svce.ac.in to sign up.'
    ));
  end if;
  return '{}'::jsonb;
end;
$$;

revoke all on function public.hook_require_svce_email(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_require_svce_email(jsonb) to supabase_auth_admin;
