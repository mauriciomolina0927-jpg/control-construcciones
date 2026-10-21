-- Core schema for the financial core (increment 1).
-- Money is whole Colombian pesos in bigint. Every table carries organization_id.
-- Money records are never deleted or edited: they are voided and replaced.

-- ---------------------------------------------------------------------------
-- Organizations, people and roles
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  timezone text not null default 'America/Bogota',
  created_at timestamptz not null default now()
);

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(trim(name)) > 0),
  user_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

-- admin: Mauricio. partner: operating partner (papá), sees everything and may register.
-- viewer: read-only partner (socio), sees only the houses where they are a partner.
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id uuid not null references auth.users (id),
  role text not null check (role in ('admin', 'partner', 'viewer')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Houses and partner agreements
-- ---------------------------------------------------------------------------

create table public.houses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  name text not null check (length(trim(name)) > 0),
  address text,
  stage text not null default 'lot'
    check (stage in ('lot', 'design', 'construction', 'for_sale', 'sold', 'settled')),
  expected_price bigint check (expected_price > 0),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

-- Who takes part in a house and how the profit is split. Versioned: a change is a new version.
create table public.house_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  house_id uuid not null,
  version int not null check (version > 0),
  notes text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (house_id, version),
  unique (organization_id, id),
  foreign key (organization_id, house_id) references public.houses (organization_id, id)
);

create table public.house_agreement_partners (
  organization_id uuid not null,
  agreement_id uuid not null,
  partner_id uuid not null,
  profit_share_bps int not null check (profit_share_bps between 0 and 10000),
  accepted_at timestamptz,
  primary key (agreement_id, partner_id),
  foreign key (organization_id, agreement_id) references public.house_agreements (organization_id, id),
  foreign key (organization_id, partner_id) references public.partners (organization_id, id)
);

-- ---------------------------------------------------------------------------
-- Money: expenses, sales, buyer payments, transfers between partners
-- ---------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  house_id uuid not null,
  amount bigint not null check (amount > 0),
  spent_on date not null,
  kind text not null check (kind in ('lot', 'construction', 'sale_cost')),
  category text not null,
  supplier_name text,
  description text,
  paid_by_partner_id uuid not null,
  has_receipt boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'whatsapp', 'agent')),
  status text not null default 'active' check (status in ('active', 'voided')),
  voided_reason text,
  replaces_id uuid references public.expenses (id),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (status = 'active' or voided_reason is not null),
  foreign key (organization_id, house_id) references public.houses (organization_id, id),
  foreign key (organization_id, paid_by_partner_id) references public.partners (organization_id, id)
);
create index expenses_house_idx on public.expenses (house_id);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  house_id uuid not null,
  buyer_name text not null,
  agreed_price bigint not null check (agreed_price > 0),
  status text not null default 'active' check (status in ('active', 'cancelled', 'completed')),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, house_id) references public.houses (organization_id, id)
);

-- A refund to the buyer is a negative amount.
create table public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  sale_id uuid not null,
  house_id uuid not null,
  amount bigint not null check (amount <> 0),
  paid_on date not null,
  source text not null check (source in ('buyer', 'bank', 'subsidy', 'severance')),
  received_by_partner_id uuid not null,
  status text not null default 'active' check (status in ('active', 'voided')),
  voided_reason text,
  replaces_id uuid references public.sale_payments (id),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (status = 'active' or voided_reason is not null),
  foreign key (organization_id, sale_id) references public.sales (organization_id, id),
  foreign key (organization_id, house_id) references public.houses (organization_id, id),
  foreign key (organization_id, received_by_partner_id) references public.partners (organization_id, id)
);
create index sale_payments_house_idx on public.sale_payments (house_id);

create table public.partner_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  house_id uuid not null,
  from_partner_id uuid not null,
  to_partner_id uuid not null,
  amount bigint not null check (amount > 0),
  transferred_on date not null,
  status text not null default 'active' check (status in ('active', 'voided')),
  voided_reason text,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (from_partner_id <> to_partner_id),
  check (status = 'active' or voided_reason is not null),
  foreign key (organization_id, house_id) references public.houses (organization_id, id),
  foreign key (organization_id, from_partner_id) references public.partners (organization_id, id),
  foreign key (organization_id, to_partner_id) references public.partners (organization_id, id)
);

-- Receipt photos and documents. The file itself lives in Supabase Storage.
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  house_id uuid not null,
  owner_type text not null check (owner_type in ('expense', 'sale_payment', 'document')),
  owner_id uuid not null,
  storage_path text not null unique,
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 15 * 1024 * 1024),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (organization_id, house_id) references public.houses (organization_id, id)
);
create index attachments_sha256_idx on public.attachments (organization_id, sha256);

-- ---------------------------------------------------------------------------
-- Final settlements: frozen, hashed, approved by every partner
-- ---------------------------------------------------------------------------

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  house_id uuid not null,
  version int not null check (version > 0),
  breakdown jsonb not null,
  hash text not null,
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  unique (house_id, version),
  unique (organization_id, id),
  foreign key (organization_id, house_id) references public.houses (organization_id, id)
);

create table public.settlement_approvals (
  organization_id uuid not null,
  settlement_id uuid not null,
  partner_id uuid not null,
  approved_by uuid not null default auth.uid() references auth.users (id),
  approved_at timestamptz not null default now(),
  primary key (settlement_id, partner_id),
  foreign key (organization_id, settlement_id) references public.settlements (organization_id, id),
  foreign key (organization_id, partner_id) references public.partners (organization_id, id)
);

-- ---------------------------------------------------------------------------
-- Audit log, written only by triggers
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid,
  house_id uuid,
  actor uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  record_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index audit_log_house_idx on public.audit_log (house_id, at desc);
