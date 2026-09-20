-- PREPARED ONLY. Optional full-clone proposal-generation test, no target backfill.
-- May hit the guarded statement timeout on a large/slow clone; do not auto-relax it.
SELECT pg_temp.p8r_guard();
SAVEPOINT proposal_fixture;
DO $fixture$
DECLARE expected bigint; generated integer;
BEGIN
  IF EXISTS(SELECT 1 FROM migration_review.phase8_candidate) THEN
    RAISE EXCEPTION 'Fixture requires empty review table'; END IF;
  SELECT 19*(SELECT count(*) FROM public.company)
       +4*(SELECT count(*) FROM public.contact)
       +(SELECT count(*) FROM public.list) INTO expected;
  generated:=migration_review.p8r_propose();
  IF generated<>expected OR generated<>(SELECT count(*) FROM migration_review.phase8_candidate)
     OR EXISTS(SELECT 1 FROM migration_review.phase8_candidate
         WHERE status NOT IN ('pending','blocked') OR reviewed_by IS NOT NULL OR reviewed_at IS NOT NULL
               OR applied_at IS NOT NULL)
     OR EXISTS(SELECT 1 FROM migration_review.phase8_candidate WHERE
        (status='blocked' AND conversion_error IS NULL)
        OR (status='pending' AND conversion_error IS NOT NULL)) THEN
    RAISE EXCEPTION 'Proposal coverage or no-auto-approval invariant failed'; END IF;
  BEGIN
    PERFORM migration_review.p8r_propose();
    RAISE EXCEPTION 'Proposal regeneration accepted' USING ERRCODE='22023';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Existing proposal batch%' THEN RAISE; END IF;
  END;
END $fixture$;
ROLLBACK TO SAVEPOINT proposal_fixture;
RELEASE SAVEPOINT proposal_fixture;
