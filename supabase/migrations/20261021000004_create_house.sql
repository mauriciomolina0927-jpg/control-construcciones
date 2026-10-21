-- A house is born with its first agreement (version 1) in one transaction.
-- Runs with the caller's permissions, so row level security still applies (only the admin can create agreements).

create function public.create_house(
  organization_id uuid,
  name text,
  address text,
  stage text,
  expected_price bigint,
  partners jsonb -- [{"partner_id": "...", "profit_share_bps": 5000}, ...]
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  house_id uuid;
  agreement_id uuid;
  total_bps int;
begin
  if stage = 'settled' then
    raise exception 'a new house cannot start settled' using errcode = '22023';
  end if;
  if jsonb_typeof(partners) <> 'array' or jsonb_array_length(partners) = 0 then
    raise exception 'a house needs at least one partner' using errcode = '22023';
  end if;
  select sum((p ->> 'profit_share_bps')::int) into total_bps from jsonb_array_elements(partners) p;
  if total_bps <> 10000 then
    raise exception 'profit shares must add up to 100%%' using errcode = '22023';
  end if;

  insert into public.houses (organization_id, name, address, stage, expected_price)
  values (create_house.organization_id, create_house.name, nullif(trim(create_house.address), ''),
          create_house.stage, create_house.expected_price)
  returning id into house_id;

  insert into public.house_agreements (organization_id, house_id, version)
  values (create_house.organization_id, house_id, 1)
  returning id into agreement_id;

  insert into public.house_agreement_partners (organization_id, agreement_id, partner_id, profit_share_bps)
  select create_house.organization_id, agreement_id, (p ->> 'partner_id')::uuid, (p ->> 'profit_share_bps')::int
  from jsonb_array_elements(partners) p;

  return house_id;
end;
$$;

revoke execute on function public.create_house(uuid, text, text, text, bigint, jsonb) from public, anon;
grant execute on function public.create_house(uuid, text, text, text, bigint, jsonb) to authenticated;
