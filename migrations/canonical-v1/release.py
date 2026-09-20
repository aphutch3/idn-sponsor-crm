"""Atomic guarded migration runner. Requires psycopg and an explicit private DSN.

Default mode is read-only preflight. --apply requires a tested Git commit,
expected database name, exact legacy contact count, and recovery snapshot ID.
"""
import argparse,hashlib,json,os,pathlib,re
import psycopg

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--apply",action="store_true")
    p.add_argument("--database",required=True)
    p.add_argument("--git-commit",required=True)
    p.add_argument("--snapshot-id",required=True)
    p.add_argument("--expected-contacts",type=int,required=True)
    a=p.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}",a.git_commit):raise SystemExit("Exact Git SHA required")
    if not a.snapshot_id.startswith("snap-"):raise SystemExit("Recovery snapshot receipt required")
    files=sorted((pathlib.Path(__file__).parent/"normalized").glob("*.sql"))
    with psycopg.connect(os.environ["CANONICAL_MIGRATION_DSN"]) as conn:
      with conn.cursor() as c:
        c.execute("SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s'")
        c.execute("SELECT pg_advisory_xact_lock(7092026,999)")
        assert c.execute("SELECT current_database()").fetchone()[0]==a.database,"Wrong database"
        assert c.execute("SELECT to_regnamespace('meta')").fetchone()[0] is None,"Schema has changed or release already applied"
        assert c.execute("SELECT count(*) FROM public.contact").fetchone()[0]==a.expected_contacts,"Contact baseline drift"
        assert c.execute("SELECT count(*) FROM public.campaign_send_event").fetchone()[0]==0,"Event history requires explicit reconciliation"
        c.execute("LOCK TABLE public.person,public.contact,public.company,public.external_ref,public.campaign_send,public.campaign_send_event IN SHARE ROW EXCLUSIVE MODE")
        print("Preflight passed",json.dumps({"database":a.database,"migrations":len(files),"apply":a.apply}))
        if not a.apply:return
        receipts=[]
        for file in files:
            content=file.read_text()
            # Files have only top-level BEGIN/COMMIT on their own lines.
            body=re.sub(r"(?im)^\s*(?:begin|commit);\s*$","",content)
            c.execute(body)
            receipts.append((file.name,hashlib.sha256(content.encode()).hexdigest()))
            print(file.name,"applied in pending transaction")
        assert c.execute("SELECT count(*) FROM public.contact WHERE person_id IS NULL").fetchone()[0]==0
        c.executemany("INSERT INTO meta.migration_execution(migration_name,sha256,git_commit) VALUES(%s,%s,%s)",
                      [(name,digest,a.git_commit) for name,digest in receipts])
        c.execute("""INSERT INTO meta.schema_release(version,state,approved_at,deployed_at,git_repository,git_commit,neon_branch_id,notes)
          VALUES('canonical-v1-20260920','deployed',now(),now(),'aphutch3/idn-sponsor-crm',%s,%s,%s)""",
          (a.git_commit,os.environ.get("CANONICAL_BRANCH_ID","isolated-rehearsal"),
           "Additive release. Snapshot "+a.snapshot_id+". Legacy contacts and five identity conflicts retained; no Supabase deletion."))
    print("Atomic release committed")
if __name__=="__main__":main()
