-- Tiny assertion helpers for SQL tests. Loaded only in the test database.

create schema test;
grant usage on schema test to authenticated, anon;

create function test.eq(actual anyelement, expected anyelement, what text) returns void
language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL %: expected %, got %', what, expected, actual;
  end if;
  raise notice 'ok - %', what;
end;
$$;

create function test.throws(statement text, pattern text, what text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlerrm not ilike '%' || pattern || '%' then
      raise exception 'FAIL %: wrong error: %', what, sqlerrm;
    end if;
    raise notice 'ok - %', what;
    return;
  end;
  raise exception 'FAIL %: expected an error matching "%"', what, pattern;
end;
$$;

-- Act as a signed-in user (or as nobody with null).
create function test.login(user_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when user_id is null then '' else json_build_object('sub', user_id)::text end, false);
end;
$$;

grant execute on all functions in schema test to authenticated, anon;
