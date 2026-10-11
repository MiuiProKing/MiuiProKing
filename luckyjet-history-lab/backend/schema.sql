begin;
create table if not exists public.lucky_lab_state (
 id boolean primary key default true check(id), enabled boolean not null default true,
 started_at timestamptz not null default now(), checked_at timestamptz,
 last_success_at timestamptz, run_count bigint not null default 0,
 lease_token uuid, lease_until timestamptz,
 prediction jsonb, large jsonb not null default '[]', last_order bigint not null default 0,
 last_big_id text, error text not null default '', model_version text not null default 'cloud-v1-kyiv'
);
insert into public.lucky_lab_state(id) values(true) on conflict do nothing;
create table if not exists public.lucky_lab_windows (
 id text primary key, kind text not null check(kind in ('rules','large-history')),
 target float8 not null check(target>=1 and target<'Infinity'::float8 and target<>'NaN'::float8),
 created_at timestamptz not null default clock_timestamp(), starts_at timestamptz not null,
 ends_at timestamptz not null, status text not null default 'pending' check(status in ('pending','hit','miss','unknown')),
 result float8, round_id text, result_at timestamptz, checked_at timestamptz,
 next_check_at timestamptz not null default now(), reason text not null default '',
 verification text, model_version text not null default 'cloud-v1-kyiv',
 check(ends_at>starts_at and ends_at>created_at)
);
create index if not exists lucky_lab_windows_due on public.lucky_lab_windows(next_check_at) where status in ('pending','unknown');
create index if not exists lucky_lab_windows_created on public.lucky_lab_windows(created_at desc);
create index if not exists lucky_lab_round_time on public.luckyjet_rounds(round_timestamp) where not estimated;
alter table public.lucky_lab_state enable row level security;
alter table public.lucky_lab_windows enable row level security;
revoke all on public.lucky_lab_state,public.lucky_lab_windows from public,anon,authenticated;
grant all on public.lucky_lab_state,public.lucky_lab_windows to service_role;

create or replace function public.lucky_lab_verify_windows() returns integer
language plpgsql security definer set search_path=public as $$
declare w record; h record; n integer:=0; t timestamptz:=clock_timestamp();
begin
 for w in select * from lucky_lab_windows where status in ('pending','unknown') and next_check_at<=t
 order by next_check_at limit 200 for update skip locked loop
  select id,coefficient,round_timestamp into h from luckyjet_rounds
   where not estimated and round_timestamp>w.created_at and round_timestamp>=w.starts_at
   and round_timestamp<=w.ends_at and round_timestamp<=t and coefficient>=w.target
   order by round_timestamp,id limit 1;
  if found then
   update lucky_lab_windows set status='hit',result=h.coefficient,round_id=h.id,result_at=h.round_timestamp,
    checked_at=t,verification='cloud-archive',reason='Цель подтверждена по архиву Supabase.' where id=w.id;
  elsif t>w.ends_at then
   -- The existing source explicitly does not certify complete game order. Do not invent a miss.
   update lucky_lab_windows set status='unknown',checked_at=t,next_check_at=t+interval '5 minutes',
    reason='Цель в архиве не найдена; полнота порядка игры не подтверждена. Повторная проверка в облаке.' where id=w.id;
  else
   update lucky_lab_windows set checked_at=t,next_check_at=t+interval '30 seconds',
    reason='Окно проверяется в облаке. Подтверждённого попадания пока нет.' where id=w.id;
  end if;
  n:=n+1;
 end loop;
 return n;
end $$;

create or replace function public.lucky_lab_claim() returns jsonb
language plpgsql security definer set search_path=public as $$
declare s lucky_lab_state; token uuid:=gen_random_uuid(); head bigint; big_id text; warm integer;
begin
 update lucky_lab_state set lease_token=token,lease_until=clock_timestamp()+interval '90 seconds'
 where id and enabled and (lease_until is null or lease_until<clock_timestamp()) returning * into s;
 if not found then return null; end if;
 select feed_order into head from luckyjet_classic_history order by feed_order desc limit 1;
 select id into big_id from luckyjet_classic_history where coefficient>=10 order by feed_order desc limit 1;
 select count(*) into warm from (select id from luckyjet_rounds where not estimated
  and round_timestamp<=clock_timestamp() order by source_seq desc limit 20) x;
 return jsonb_build_object('token',token,'now',floor(extract(epoch from clock_timestamp())*1000),
  'source',luckyjet_cloud_status(),'warmup',warm,'previous',s.prediction,'large',s.large,
  'last_order',s.last_order,'latest_order',coalesce(head,0),'last_big_id',s.last_big_id,'latest_big_id',big_id);
end $$;

create or replace function public.lucky_lab_finish(p_token uuid,p_prediction jsonb,p_large jsonb,
 p_windows jsonb,p_cursor bigint,p_big_id text,p_error text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item jsonb; recorded timestamptz; a timestamptz; b timestamptz; checked integer;
begin
 perform 1 from lucky_lab_state where id and enabled and lease_token=p_token and lease_until>clock_timestamp() for update;
 if not found then raise exception 'WORKER_LEASE_LOST'; end if;
 if coalesce(p_error,'')='' then
  if jsonb_typeof(p_windows)<>'array' or jsonb_array_length(p_windows)>10 then raise exception 'INVALID_WINDOWS'; end if;
  for item in select value from jsonb_array_elements(p_windows) loop
   recorded:=clock_timestamp(); a:=to_timestamp((item->>'start')::float8/1000); b:=to_timestamp((item->>'end')::float8/1000);
   if b>recorded and b>a and length(item->>'id') between 1 and 250 then
    insert into lucky_lab_windows(id,kind,target,created_at,starts_at,ends_at,reason)
     values(item->>'id',item->>'kind',(item->>'target')::float8,recorded,greatest(a,recorded),b,
     'Окно заранее записано в облаке; ожидаем будущие раунды.') on conflict(id) do nothing;
   end if;
  end loop;
 end if;
 checked:=lucky_lab_verify_windows();
 update lucky_lab_state set checked_at=clock_timestamp(),run_count=run_count+1,
  last_success_at=case when coalesce(p_error,'')='' then clock_timestamp() else last_success_at end,
  prediction=case when coalesce(p_error,'')='' then p_prediction else null end,
  large=case when coalesce(p_error,'')='' then p_large else large end,
  last_order=case when coalesce(p_error,'')='' then p_cursor else last_order end,
  last_big_id=case when coalesce(p_error,'')='' then p_big_id else last_big_id end,
  error=left(coalesce(p_error,''),200),lease_token=null,lease_until=null where id;
 return jsonb_build_object('ok',true,'checked_windows',checked);
end $$;

create or replace function public.lucky_lab_report() returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('enabled',s.enabled,'fresh',s.checked_at>now()-interval '90 seconds' and s.error='',
 'started_at',s.started_at,'checked_at',s.checked_at,'last_success_at',s.last_success_at,
 'run_count',s.run_count,'interval_seconds',30,'error',s.error,'model_version',s.model_version,
 'checked_now',now(),'prediction',case when s.checked_at>now()-interval '90 seconds' and s.error='' then s.prediction else null end,
 'large',s.large,'windows',coalesce((select jsonb_agg(jsonb_build_object(
  'id',w.id,'kind',w.kind,'target',w.target,'createdAt',floor(extract(epoch from w.created_at)*1000),
  'start',floor(extract(epoch from w.starts_at)*1000),'end',floor(extract(epoch from w.ends_at)*1000),
  'status',w.status,'result',w.result,'roundId',w.round_id,'resultAt',floor(extract(epoch from w.result_at)*1000),
  'checkedAt',floor(extract(epoch from w.checked_at)*1000),'reason',w.reason,'verification',w.verification,
  'origin','cloud','modelVersion',w.model_version) order by w.created_at desc)
  from (select * from lucky_lab_windows order by created_at desc limit 200) w),'[]'::jsonb))
 from lucky_lab_state s where id;
$$;
revoke all on function public.lucky_lab_verify_windows(),public.lucky_lab_claim(),
 public.lucky_lab_finish(uuid,jsonb,jsonb,jsonb,bigint,text,text),public.lucky_lab_report() from public,anon,authenticated;
grant execute on function public.lucky_lab_verify_windows(),public.lucky_lab_claim(),
 public.lucky_lab_finish(uuid,jsonb,jsonb,jsonb,bigint,text,text),public.lucky_lab_report() to service_role;
grant execute on function public.lucky_lab_report() to anon,authenticated;
commit;
