-- A new read-only endpoint for the isolated Orb page; existing functions stay unchanged.
create or replace function public.lucky_orb_journal(p_before timestamptz default null,p_before_id text default null,p_limit integer default 50)
returns jsonb language sql stable security definer set search_path=public as $$
 with settings as(select greatest(1,least(coalesce(p_limit,50),100)) n),
 candidates as(select w.* from public.lucky_lab_windows w where kind='rules'
  and(p_before is null or(w.created_at,w.id)<(p_before,coalesce(p_before_id,'')))
  order by created_at desc,id desc limit(select n+1 from settings)),
 chosen as(select * from candidates order by created_at desc,id desc limit(select n from settings))
 select jsonb_build_object('checked_now',now(),'counts',(select jsonb_build_object('total',count(*),
  'hit',count(*) filter(where status='hit'),'miss',count(*) filter(where status='miss'),
  'unknown',count(*) filter(where status='unknown'),'pending',count(*) filter(where status='pending'))
  from public.lucky_lab_windows where kind='rules'),
 'has_more',(select count(*) from candidates)>(select n from settings),
 'windows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'target',target,'cursor_at',created_at,
  'createdAt',floor(extract(epoch from created_at)*1000),'start',floor(extract(epoch from starts_at)*1000),
  'end',floor(extract(epoch from ends_at)*1000),'status',status,'result',result,'roundId',round_id,
  'resultAt',floor(extract(epoch from result_at)*1000)) order by created_at desc,id desc) from chosen),'[]'::jsonb));
 $$;
revoke all on function public.lucky_orb_journal(timestamptz,text,integer) from public;
grant execute on function public.lucky_orb_journal(timestamptz,text,integer) to anon,authenticated,service_role;
