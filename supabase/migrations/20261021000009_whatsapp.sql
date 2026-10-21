-- WhatsApp (increment 2): partners report expenses by message; the app proposes, a person confirms.
-- The webhook has no signed-in user. It reaches the database only through the functions below,
-- each gated by a webhook token whose hash lives in a schema the API does not expose.
-- Nothing here writes an expense: a suggestion becomes an expense only when someone confirms it in the app.

alter table public.partners
  add column whatsapp_phone text unique check (whatsapp_phone ~ '^[0-9]{8,15}$');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.webhook_tokens (
  name text primary key,
  token_hash text not null
);

create function private.check_webhook_token(token text) returns void
language plpgsql security definer
set search_path = private, extensions
as $$
begin
  if not exists (
    select 1 from private.webhook_tokens t
    where t.name = 'whatsapp' and t.token_hash = crypt(coalesce(token, ''), t.token_hash)
  ) then
    raise exception 'invalid webhook token' using errcode = '42501';
  end if;
end;
$$;

-- Every message in and out, so the agent can follow a short conversation ("¿Para cuál casa?" → "1").
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  partner_id uuid not null,
  wa_message_id text unique,
  direction text not null check (direction in ('in', 'out')),
  body text,
  has_media boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, partner_id) references public.partners (organization_id, id)
);
create index whatsapp_messages_partner_idx on public.whatsapp_messages (partner_id, created_at desc);

-- Photos and PDFs that came with a message. Kept apart so the audit log never copies the bytes;
-- on confirmation the app moves the file to the receipts bucket like any other receipt.
create table public.whatsapp_media (
  message_id uuid primary key references public.whatsapp_messages (id),
  organization_id uuid not null references public.organizations (id),
  mime_type text not null
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  bytes bytea not null check (octet_length(bytes) between 1 and 4 * 1024 * 1024)
);

create table public.expense_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  message_id uuid not null,
  house_id uuid,
  amount bigint check (amount > 0),
  spent_on date,
  category text,
  supplier_name text,
  description text,
  paid_by_partner_id uuid not null,
  missing text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'discarded')),
  expense_id uuid references public.expenses (id),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'confirmed' or expense_id is not null),
  foreign key (organization_id, message_id) references public.whatsapp_messages (organization_id, id),
  foreign key (organization_id, house_id) references public.houses (organization_id, id),
  foreign key (organization_id, paid_by_partner_id) references public.partners (organization_id, id)
);
create index expense_suggestions_pending_idx on public.expense_suggestions (organization_id) where status = 'pending';

-- A suggestion is reviewed once: pending → confirmed (pointing to the expense it became) or discarded.
create function public.guard_expense_suggestion() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'pending' then
    raise exception 'this suggestion was already reviewed' using errcode = 'P0001';
  end if;
  if new.status = 'confirmed' and not exists (
    select 1 from public.expenses e
    where e.id = new.expense_id and e.organization_id = new.organization_id and e.source = 'whatsapp'
  ) then
    raise exception 'a confirmed suggestion must point to its expense' using errcode = 'P0001';
  end if;
  if new.status <> 'pending' then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create trigger expense_suggestions_guard before update on public.expense_suggestions
  for each row execute function public.guard_expense_suggestion();
create trigger whatsapp_media_frozen before update or delete on public.whatsapp_media
  for each row execute function public.forbid_change();
create trigger whatsapp_messages_frozen before update or delete on public.whatsapp_messages
  for each row execute function public.forbid_change();
create trigger expense_suggestions_no_delete before delete on public.expense_suggestions
  for each row execute function public.forbid_change();

create trigger whatsapp_messages_audit after insert on public.whatsapp_messages
  for each row execute function public.write_audit_log();
create trigger expense_suggestions_audit after insert or update on public.expense_suggestions
  for each row execute function public.write_audit_log();

-- Row level security: the people who register money see and review; the viewer sees none of it.
alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_media enable row level security;
alter table public.expense_suggestions enable row level security;
revoke all on public.whatsapp_messages, public.whatsapp_media, public.expense_suggestions from anon;
revoke insert, update, delete on public.whatsapp_messages, public.whatsapp_media from authenticated;
revoke insert, delete on public.expense_suggestions from authenticated;

create policy whatsapp_messages_select on public.whatsapp_messages for select to authenticated
  using (public.can_write(organization_id));
create policy whatsapp_media_select on public.whatsapp_media for select to authenticated
  using (public.can_write(organization_id));
create policy expense_suggestions_select on public.expense_suggestions for select to authenticated
  using (public.can_write(organization_id));
create policy expense_suggestions_review on public.expense_suggestions for update to authenticated
  using (public.can_write(organization_id)) with check (public.can_write(organization_id));

-- ---------------------------------------------------------------------------
-- Webhook functions (anon + token)
-- ---------------------------------------------------------------------------

-- What the agent needs to read one message: who wrote, the open houses with their totals,
-- the last day of conversation and the suggestions still missing data. Null for an unknown phone.
create function public.whatsapp_context(token text, phone text) returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  p public.partners;
begin
  perform private.check_webhook_token(token);
  select * into p from public.partners where whatsapp_phone = phone;
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'organization_id', p.organization_id,
    'partner_id', p.id,
    'partner_name', p.name,
    'partners', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.created_at), '[]')
                 from public.partners x where x.organization_id = p.organization_id),
    'houses', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', h.id, 'name', h.name, 'stage', h.stage,
                   'lot', coalesce((select sum(e.amount) from public.expenses e
                                    where e.house_id = h.id and e.status = 'active' and e.kind = 'lot'), 0),
                   'construction', coalesce((select sum(e.amount) from public.expenses e
                                             where e.house_id = h.id and e.status = 'active' and e.kind = 'construction'), 0),
                   'without_receipt', (select count(*) from public.expenses e
                                       where e.house_id = h.id and e.status = 'active' and not e.has_receipt)
                 ) order by h.created_at), '[]')
               from public.houses h where h.organization_id = p.organization_id and h.stage <> 'settled'),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
                   'direction', m.direction, 'body', m.body, 'has_media', m.has_media, 'at', m.created_at
                 ) order by m.created_at), '[]')
               from (select * from public.whatsapp_messages
                     where partner_id = p.id and created_at > now() - interval '24 hours'
                     order by created_at desc limit 12) m),
    'open', (select coalesce(jsonb_agg(jsonb_build_object(
                 'id', s.id, 'amount', s.amount, 'house_id', s.house_id, 'category', s.category,
                 'supplier_name', s.supplier_name, 'missing', s.missing, 'at', s.created_at
               ) order by s.created_at), '[]')
             from public.expense_suggestions s
             where s.paid_by_partner_id = p.id and s.status = 'pending'
               and s.created_at > now() - interval '24 hours' and cardinality(s.missing) > 0)
  );
end;
$$;

-- Records one message in or out. Returns its id, or null when WhatsApp delivers the same message twice.
create function public.whatsapp_record(
  token text, phone text, wa_message_id text, direction text, body text,
  media_base64 text default null, media_mime text default null
) returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  p public.partners;
  message_id uuid;
begin
  perform private.check_webhook_token(token);
  select * into p from public.partners where whatsapp_phone = phone;
  if not found then
    raise exception 'unknown phone' using errcode = 'P0002';
  end if;

  insert into public.whatsapp_messages (organization_id, partner_id, wa_message_id, direction, body, has_media)
  values (p.organization_id, p.id, whatsapp_record.wa_message_id, whatsapp_record.direction,
          left(whatsapp_record.body, 4000), media_base64 is not null)
  on conflict on constraint whatsapp_messages_wa_message_id_key do nothing
  returning id into message_id;

  if message_id is not null and media_base64 is not null then
    insert into public.whatsapp_media (message_id, organization_id, mime_type, bytes)
    values (message_id, p.organization_id, media_mime, decode(media_base64, 'base64'));
  end if;
  return message_id;
end;
$$;

-- Saves what the agent understood. With update_id it fills in a suggestion that was still missing data
-- (only one from the same person, still pending). Fields the agent could not read go in "missing".
create function public.whatsapp_suggest(token text, message uuid, suggestion jsonb, update_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  m public.whatsapp_messages;
  house uuid := nullif(suggestion ->> 'house_id', '')::uuid;
  payer uuid;
  result uuid;
begin
  perform private.check_webhook_token(token);
  select * into m from public.whatsapp_messages where id = message and direction = 'in';
  if not found then
    raise exception 'message not found' using errcode = 'P0002';
  end if;
  if house is not null and not exists (
    select 1 from public.houses h where h.id = house and h.organization_id = m.organization_id and h.stage <> 'settled'
  ) then
    house := null;
  end if;
  payer := coalesce(
    (select x.id from public.partners x
     where x.id = nullif(suggestion ->> 'paid_by_partner_id', '')::uuid and x.organization_id = m.organization_id),
    m.partner_id);

  if update_id is not null then
    update public.expense_suggestions s set
      house_id = coalesce(house, s.house_id),
      amount = coalesce(nullif(suggestion ->> 'amount', '')::bigint, s.amount),
      spent_on = coalesce(nullif(suggestion ->> 'spent_on', '')::date, s.spent_on),
      category = coalesce(nullif(suggestion ->> 'category', ''), s.category),
      supplier_name = coalesce(nullif(suggestion ->> 'supplier_name', ''), s.supplier_name),
      description = coalesce(nullif(suggestion ->> 'description', ''), s.description),
      missing = coalesce(array(select jsonb_array_elements_text(suggestion -> 'missing')), '{}')
    where s.id = update_id and s.status = 'pending' and s.paid_by_partner_id = m.partner_id
      and s.organization_id = m.organization_id
    returning s.id into result;
    return result;
  end if;

  insert into public.expense_suggestions (
    organization_id, message_id, house_id, amount, spent_on, category, supplier_name, description,
    paid_by_partner_id, missing
  ) values (
    m.organization_id, m.id, house,
    nullif(suggestion ->> 'amount', '')::bigint,
    coalesce(nullif(suggestion ->> 'spent_on', '')::date, (m.created_at at time zone 'America/Bogota')::date),
    nullif(suggestion ->> 'category', ''),
    nullif(suggestion ->> 'supplier_name', ''),
    nullif(suggestion ->> 'description', ''),
    payer,
    coalesce(array(select jsonb_array_elements_text(suggestion -> 'missing')), '{}')
  ) returning id into result;
  return result;
end;
$$;

revoke execute on function public.whatsapp_context(text, text),
  public.whatsapp_record(text, text, text, text, text, text, text),
  public.whatsapp_suggest(text, uuid, jsonb, uuid) from public;
grant execute on function public.whatsapp_context(text, text),
  public.whatsapp_record(text, text, text, text, text, text, text),
  public.whatsapp_suggest(text, uuid, jsonb, uuid) to anon, authenticated;
revoke execute on function public.guard_expense_suggestion() from public, anon, authenticated;
