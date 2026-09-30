-- DuoSave schema. Run in Supabase: SQL Editor -> New query -> paste -> Run.
create extension if not exists pgcrypto;

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  push_token text,
  created_at timestamptz not null default now()
);

create table vaults (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Vault',
  invite_code text unique not null,
  currency text not null default 'USD',
  savings_goal numeric(12,2) not null default 0,
  monthly_target numeric(12,2) not null default 0,   -- combined, per month
  reminder_day int not null default 1 check (reminder_day between 1 and 28),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table vault_members (
  vault_id uuid not null references vaults on delete cascade,
  user_id uuid not null unique references profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (vault_id, user_id)
);

-- A vault is for exactly two people.
create function enforce_two_members() returns trigger language plpgsql as $$
begin
  if (select count(*) from vault_members where vault_id = new.vault_id) >= 2 then
    raise exception 'This vault already has two members';
  end if;
  return new;
end $$;
create trigger vault_two_max before insert on vault_members
  for each row execute function enforce_two_members();

create table contributions (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  created_at timestamptz not null default now()
);

create table loans (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults on delete cascade,
  borrower_id uuid not null references profiles on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  repaid numeric(12,2) not null default 0,
  purpose text,
  status text not null default 'active' check (status in ('active','repaid')),
  created_at timestamptz not null default now()
);

create table activity (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults on delete cascade,
  actor_id uuid references profiles on delete set null,
  type text not null,            -- deposit | loan | repayment | reminder | join
  amount numeric(12,2),
  message text not null,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  vault_id uuid not null references vaults on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  type text not null,            -- reminder | partner
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Balance: every deposit adds to the pool, every unpaid loan amount is taken out of it.
create view vault_balances as
select v.id as vault_id,
       coalesce(c.total, 0)                     as total_deposited,
       coalesce(l.outstanding, 0)               as loaned_out,
       coalesce(c.total, 0) - coalesce(l.outstanding, 0) as available
from vaults v
left join (select vault_id, sum(amount) total from contributions group by vault_id) c on c.vault_id = v.id
left join (select vault_id, sum(amount - repaid) outstanding from loans where status='active' group by vault_id) l on l.vault_id = v.id;

-- Take a loan atomically (locks the vault so two people can't overdraw at once).
create function take_loan(p_vault uuid, p_user uuid, p_amount numeric, p_purpose text)
returns loans language plpgsql as $$
declare v_avail numeric; v_loan loans;
begin
  perform 1 from vaults where id = p_vault for update;
  select available into v_avail from vault_balances where vault_id = p_vault;
  if p_amount > v_avail then
    raise exception 'Not enough savings. Available: %', v_avail;
  end if;
  insert into loans (vault_id, borrower_id, amount, purpose)
  values (p_vault, p_user, p_amount, p_purpose) returning * into v_loan;
  return v_loan;
end $$;

create function repay_loan(p_loan uuid, p_user uuid, p_amount numeric)
returns loans language plpgsql as $$
declare l loans;
begin
  select * into l from loans where id = p_loan for update;
  if not found or l.borrower_id <> p_user then raise exception 'Loan not found'; end if;
  if p_amount > l.amount - l.repaid then raise exception 'Amount is more than what is still owed'; end if;
  update loans set repaid = repaid + p_amount,
    status = case when repaid + p_amount >= amount then 'repaid' else 'active' end
  where id = p_loan returning * into l;
  return l;
end $$;

-- The backend uses the service role key, so lock the tables from direct client access.
alter table profiles enable row level security;
alter table vaults enable row level security;
alter table vault_members enable row level security;
alter table contributions enable row level security;
alter table loans enable row level security;
alter table activity enable row level security;
alter table notifications enable row level security;
