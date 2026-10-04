create table public.website_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('bug', 'suggestion', 'other')),
  message text not null check (char_length(btrim(message)) between 10 and 3000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved')),
  created_at timestamptz not null default now()
);

create index website_feedback_user_created_idx on public.website_feedback (user_id, created_at desc);
alter table public.website_feedback enable row level security;
revoke all on public.website_feedback from anon, authenticated;
grant select on public.website_feedback to authenticated;
grant insert (id, user_id, category, message) on public.website_feedback to authenticated;
grant all on public.website_feedback to service_role;

create policy feedback_insert_own on public.website_feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy feedback_select_own on public.website_feedback for select to authenticated
  using ((select auth.uid()) = user_id);
