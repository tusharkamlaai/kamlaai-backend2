-- EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- TABLES
create table if not exists public.users (
  id uuid primary key,
  name text not null,
  email text not null unique,
  google_id text,
  is_admin boolean not null default false,
  profile_picture_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text not null,
  requirements text not null,
  skills text,
  location text not null,
  salary_range text,
  is_active boolean not null default true,
  posted_by uuid not null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.applications (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null,
  skills text,
  expected_salary text,
  cover_letter text,
  location text,
  city text,
  education text,
  position_applying text,
  resume_path text,
  status text not null default 'pending' check (status in ('pending','reviewed','approved','rejected')),
  applied_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, user_id)
);

-- VIEWS
create or replace view public.jobs_public as
select id, title, description, requirements, skills, location, salary_range, is_active, posted_by, created_at, updated_at
from public.jobs
where is_active = true;

create or replace view public.applications_view_self as
select a.*, j.title as job_title, j.location as job_location
from public.applications a
join public.jobs j on j.id = a.job_id;

create or replace view public.applications_admin_view as
select a.*, u.email as user_email, u.name as user_name, j.title as job_title
from public.applications a
join public.users u on u.id = a.user_id
join public.jobs  j on j.id = a.job_id;

create or replace view public.user_profile_view as
select u.*, (select count(*) from public.applications a where a.user_id = u.id) as applications_count
from public.users u;

-- RPC
create or replace function public.stats_overview()
returns json language sql stable as $$
  select json_build_object(
    'total_users', (select count(*) from public.users),
    'total_jobs', (select count(*) from public.jobs),
    'total_applications', (select count(*) from public.applications),
    'applications_per_job', (
      select json_agg(row_to_json(x)) from (
        select j.id as job_id, j.title, count(a.id) as applications_count
        from public.jobs j
        left join public.applications a on a.job_id = j.id
        group by j.id
        order by applications_count desc
      ) x
    )
  );
$$;

-- RLS
alter table public.users enable row level security;
alter table public.jobs enable row level security;
alter table public.applications enable row level security;

create or replace function public.jwt_role()
returns text language sql stable as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', 'user');
$$;

drop policy if exists users_self_select on public.users;
drop policy if exists users_self_update on public.users;
drop policy if exists users_admin_all on public.users;

create policy users_self_select on public.users
for select using (id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub');

create policy users_self_update on public.users
for update using (id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub');

create policy users_admin_all on public.users
for all using (public.jwt_role() = 'admin');

drop policy if exists jobs_public_select on public.jobs;
drop policy if exists jobs_admin_all on public.jobs;

create policy jobs_public_select on public.jobs
for select using (is_active = true or public.jwt_role() = 'admin');

create policy jobs_admin_all on public.jobs
for all using (public.jwt_role() = 'admin');

drop policy if exists apps_self_rw on public.applications;
drop policy if exists apps_admin_all on public.applications;

create policy apps_self_rw on public.applications
for all using (user_id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub');

create policy apps_admin_all on public.applications
for all using (public.jwt_role() = 'admin');

-- STORAGE bucket (private) + policies
insert into storage.buckets (id, name, public)
values ('resumes', 'resumes', false)
on conflict (id) do nothing;

drop policy if exists resumes_read_own on storage.objects;
drop policy if exists resumes_write_own on storage.objects;
drop policy if exists resumes_admin_all on storage.objects;

create policy resumes_read_own on storage.objects
for select using (
  bucket_id = 'resumes'
  and split_part(name, '/', 2) = current_setting('request.jwt.claims', true)::jsonb->>'sub'
);

create policy resumes_write_own on storage.objects
for all using (
  bucket_id = 'resumes'
  and split_part(name, '/', 2) = current_setting('request.jwt.claims', true)::jsonb->>'sub'
);

create policy resumes_admin_all on storage.objects
for all using (public.jwt_role() = 'admin');

-- INDEXES
create index if not exists idx_jobs_active on public.jobs (is_active);
create index if not exists idx_apps_user on public.applications (user_id);
create index if not exists idx_apps_job on public.applications (job_id);


























-- -- EXTENSIONS
-- create extension if not exists "uuid-ossp";
-- create extension if not exists "pgcrypto";

-- -- TABLES
-- create table if not exists public.users (
-- id uuid primary key,
-- name text not null,
-- email text not null unique,
-- google_id text,
-- is_admin boolean not null default false,
-- profile_picture_url text,
-- created_at timestamptz not null default now(),
-- updated_at timestamptz not null default now()
-- );

-- create table if not exists public.jobs (
-- id uuid primary key default uuid_generate_v4(),
-- title text not null,
-- description text not null,
-- requirements text not null,
-- skills text,
-- location text not null,
-- qualifications text,
-- salary_range text,
-- is_active boolean not null default true,
-- posted_by uuid not null references public.users(id) on delete set null,
-- created_at timestamptz not null default now(),
-- updated_at timestamptz not null default now()
-- );

-- create table if not exists public.applications (
-- id uuid primary key default uuid_generate_v4(),
-- job_id uuid not null references public.jobs(id) on delete cascade,
-- user_id uuid not null references public.users(id) on delete cascade,
-- name text not null,
-- email text not null,
-- phone text not null,
-- skills text,
-- expected_salary text,
-- cover_letter text,
-- location text,
-- city text,
-- education text,
-- position_applying text,
-- resume_path text,
-- status text not null default 'pending' check (status in ('pending','reviewed','approved','rejected')),
-- applied_at timestamptz not null default now(),
-- updated_at timestamptz not null default now(),
-- unique (job_id, user_id)
-- );

-- -- VIEWS
-- create or replace view public.jobs_public as
-- select id, title, description, requirements, skills, location, qualifications, salary_range, is_active, posted_by, created_at, updated_at
-- from public.jobs
-- where is_active = true;

-- create or replace view public.applications_view_self as
-- select a.*, j.title as job_title, j.location as job_location
-- from public.applications a
-- join public.jobs j on j.id = a.job_id;

-- create or replace view public.applications_admin_view as
-- select a.*, u.email as user_email, u.name as user_name, j.title as job_title
-- from public.applications a
-- join public.users u on u.id = a.user_id
-- join public.jobs j on j.id = a.job_id;

-- create or replace view public.user_profile_view as
-- select u.*, (select count(*) from public.applications a where a.user_id = u.id) as applications_count
-- from public.users u;

-- -- RPC
-- create or replace function public.stats_overview()
-- returns json language sql stable as $$
-- select json_build_object(
-- 'total_users', (select count(*) from public.users),
-- 'total_jobs', (select count(*) from public.jobs),
-- 'total_applications', (select count(*) from public.applications),
-- 'applications_per_job', (
-- select json_agg(row_to_json(x)) from (
-- select j.id as job_id, j.title, count(a.id) as applications_count
-- from public.jobs j
-- left join public.applications a on a.job_id = j.id
-- group by j.id
-- order by applications_count desc
-- ) x
-- )
-- );
-- $$;

-- -- RLS
-- alter table public.users enable row level security;
-- alter table public.jobs enable row level security;
-- alter table public.applications enable row level security;

-- create or replace function public.jwt_role()
-- returns text language sql stable as $$
-- select coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', 'user');
-- $$;

-- drop policy if exists users_self_select on public.users;
-- drop policy if exists users_self_update on public.users;
-- drop policy if exists users_admin_all on public.users;

-- create policy users_self_select on public.users
-- for select using (id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub');

-- create policy users_self_update on public.users
-- for update using (id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub');

-- create policy users_admin_all on public.users
-- for all using (public.jwt_role() = 'admin');

-- drop policy if exists jobs_public_select on public.jobs;
-- drop policy if exists jobs_admin_all on public.jobs;

-- create policy jobs_public_select on public.jobs
-- for select using (is_active = true or public.jwt_role() = 'admin');

-- create policy jobs_admin_all on public.jobs
-- for all using (public.jwt_role() = 'admin');

-- drop policy if exists apps_self_rw on public.applications;
-- drop policy if exists apps_admin_all on public.applications;

-- create policy apps_self_rw on public.applications
-- for all using (user_id::text = current_setting('request.jwt.claims', true)::jsonb->>'sub');

-- create policy apps_admin_all on public.applications
-- for all using (public.jwt_role() = 'admin');

-- -- STORAGE bucket (private) + policies
-- insert into storage.buckets (id, name, public)
-- values ('resumes', 'resumes', false)
-- on conflict (id) do nothing;

-- drop policy if exists resumes_read_own on storage.objects;
-- drop policy if exists resumes_write_own on storage.objects;
-- drop policy if exists resumes_admin_all on storage.objects;

-- create policy resumes_read_own on storage.objects
-- for select using (
-- bucket_id = 'resumes'
-- and split_part(name, '/', 2) = current_setting('request.jwt.claims', true)::jsonb->>'sub'
-- );

-- create policy resumes_write_own on storage.objects
-- for all using (
-- bucket_id = 'resumes'
-- and split_part(name, '/', 2) = current_setting('request.jwt.claims', true)::jsonb->>'sub'
-- );

-- create policy resumes_admin_all on storage.objects
-- for all using (public.jwt_role() = 'admin');

-- -- INDEXES
-- create index if not exists idx_jobs_active on public.jobs (is_active);
-- create index if not exists idx_apps_user on public.applications (user_id);
-- create index if not exists idx_apps_job on public.applications (job_id);





