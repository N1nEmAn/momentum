-- RSIP tables
create table if not exists public.rsip_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.rsip_nodes(id) on delete cascade,
  title text not null,
  rule text not null,
  sort_order integer not null default 0,
  use_timer boolean not null default false,
  timer_minutes integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_rsip_nodes_user on public.rsip_nodes(user_id);

create table if not exists public.rsip_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_added_at timestamptz,
  allow_multiple_per_day boolean not null default false
);


-- Enable Row Level Security (RLS)
alter table if exists public.rsip_nodes enable row level security;
alter table if exists public.rsip_meta enable row level security;

-- RLS policies: authenticated users can manage their own records
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rsip_nodes' and policyname = 'Users manage their own RSIP nodes'
  ) then
    create policy "Users manage their own RSIP nodes"
      on public.rsip_nodes
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'rsip_meta' and policyname = 'Users manage their own RSIP meta'
  ) then
    create policy "Users manage their own RSIP meta"
      on public.rsip_meta
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Additional helpful indexes
create index if not exists idx_rsip_nodes_parent on public.rsip_nodes(parent_id);
create index if not exists idx_rsip_nodes_sort on public.rsip_nodes(sort_order);
