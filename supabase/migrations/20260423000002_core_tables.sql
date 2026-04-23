-- Users table: mirror of auth.users with profile fields.
-- Populated via trigger on auth.users insert.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  google_id text,
  university text,
  major text,
  year integer check (year between 1 and 7),
  created_at timestamptz not null default now()
);

-- Subjects: one per exam the user is cramming for.
create table public.subjects (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  code text,
  exam_date date,
  created_at timestamptz not null default now()
);

create index idx_subjects_user on public.subjects(user_id);

-- Auto-populate public.users on auth signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, google_id)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'sub'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
