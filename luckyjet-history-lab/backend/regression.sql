-- Transactional regression: real archived coefficient, temporary windows, full rollback.
begin;
do $$
declare h record; w record; before_runs bigint;
begin
 select id,coefficient,round_timestamp into h from public.luckyjet_rounds
 where not estimated and round_timestamp<now()-interval '2 minutes' and coefficient>=2 order by source_seq desc limit 1;
 if not found then raise exception 'TEST_REQUIRES_ARCHIVE'; end if;
 insert into public.lucky_lab_windows(id,kind,target,created_at,starts_at,ends_at,status)
 values
 ('qa:cloud:hit','rules',h.coefficient,h.round_timestamp-interval '2 seconds',h.round_timestamp-interval '1 second',h.round_timestamp+interval '1 second','unknown'),
 ('qa:cloud:past','rules',h.coefficient,h.round_timestamp+interval '1 second',h.round_timestamp,h.round_timestamp+interval '2 seconds','pending'),
 ('qa:cloud:absent','rules',1000000000000,h.round_timestamp-interval '2 seconds',h.round_timestamp-interval '1 second',h.round_timestamp+interval '1 second','pending'),
 ('qa:cloud:future','rules',2,now(),now()+interval '1 hour',now()+interval '2 hours','pending');
 perform public.lucky_lab_verify_windows();
 select * into w from public.lucky_lab_windows where id='qa:cloud:hit';
 if w.status<>'hit' or w.round_id<>h.id or w.result<>h.coefficient or w.result_at<>h.round_timestamp then raise exception 'HIT_EVIDENCE_FAILED'; end if;
 perform public.lucky_lab_verify_windows();
 select * into w from public.lucky_lab_windows where id='qa:cloud:hit';
 if w.status<>'hit' or w.round_id<>h.id then raise exception 'TERMINAL_RESULT_CHANGED'; end if;
 if (select status from public.lucky_lab_windows where id='qa:cloud:past')<>'unknown' then raise exception 'PAST_CREDITED'; end if;
 if (select status from public.lucky_lab_windows where id='qa:cloud:absent')<>'unknown' then raise exception 'UNVERIFIED_MISS_INVENTED'; end if;
 if (select status from public.lucky_lab_windows where id='qa:cloud:future')<>'pending' then raise exception 'FUTURE_FINALIZED'; end if;
 -- Claim is atomic; a second concurrent claim cannot obtain the active lease.
 update public.lucky_lab_state set lease_until=now()+interval '1 minute';
 if public.lucky_lab_claim() is not null then raise exception 'OVERLAPPING_LEASE_ALLOWED'; end if;
end $$;
rollback;
