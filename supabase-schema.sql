-- Household Budget App · Supabase Schema
-- Paste & run this entire file in Supabase → SQL Editor → New query

create table if not exists categories (
  id    serial primary key,
  name  text   not null,
  color text   not null default '#A855F7',
  icon  text   not null default '💰',
  type  text   not null default 'expense' check (type in ('income','expense'))
);

create table if not exists transactions (
  id          serial      primary key,
  amount      numeric(12,2) not null,
  description text,
  category_id integer references categories(id) on delete set null,
  type        text        not null check (type in ('income','expense')),
  date        date        not null default current_date,
  created_at  timestamptz not null default now()
);

create table if not exists budget_targets (
  id           serial      primary key,
  category_id  integer     not null references categories(id) on delete cascade,
  month        text        not null,  -- 'YYYY-MM'
  limit_amount numeric(12,2) not null,
  unique (category_id, month)
);

create table if not exists savings_goals (
  id             serial      primary key,
  name           text        not null,
  target_amount  numeric(12,2) not null,
  current_amount numeric(12,2) not null default 0,
  color          text        not null default '#8bffec',
  created_at     timestamptz not null default now()
);

create table if not exists bank_accounts (
  id         serial      primary key,
  name       text        not null,
  balance    numeric(12,2) not null default 0,
  color1     text        not null default '#8bffec',
  color2     text        not null default '#A855F7',
  target     numeric(12,2),
  created_at timestamptz not null default now()
);

-- Seed default categories (safe to re-run)
insert into categories (name, color, icon, type) values
  ('Salary',        '#8bffec', '💼', 'income'),
  ('Freelance',     '#4d7cff', '💻', 'income'),
  ('Groceries',     '#f4ff7b', '🛒', 'expense'),
  ('Eating out',    '#ff4b2b', '🍽', 'expense'),
  ('Transport',     '#A855F7', '🚗', 'expense'),
  ('Utilities',     '#4d7cff', '💡', 'expense'),
  ('Entertainment', '#ff4b2b', '🎬', 'expense'),
  ('Health',        '#8bffec', '🏥', 'expense'),
  ('Clothing',      '#f4ff7b', '👕', 'expense'),
  ('Other',         '#888888', '📦', 'expense')
on conflict do nothing;
