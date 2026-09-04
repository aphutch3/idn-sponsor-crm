#!/bin/bash
set -u
OUT_DIR=/home/user/workspace/idn-sponsor-crm/out
LOG=/home/user/workspace/idn-sponsor-crm/import_log.txt
: > "$LOG"

run_file() {
    local f="$1"
    local name=$(basename "$f")
    # Build JSON with jq to safely escape SQL
    local payload=$(jq -Rs --arg pid "wpgfanjopuupjcgrdbmb" '{project_id:$pid, query:.}' < "$f")
    local resp
    resp=$(echo "$payload" | pplx connector call supabase execute_sql --input /dev/stdin 2>&1)
    local rc=$?
    if [ $rc -eq 0 ]; then
        # Check for error content in response
        if echo "$resp" | grep -qi '"isError":true\|"error"'; then
            echo "FAIL $name" >> "$LOG"
            echo "---- $name ----" >> "$LOG"
            echo "$resp" | head -c 2000 >> "$LOG"
            echo "" >> "$LOG"
            return 1
        else
            echo "OK   $name" >> "$LOG"
            return 0
        fi
    else
        echo "FAIL $name (rc=$rc)" >> "$LOG"
        echo "$resp" | head -c 2000 >> "$LOG"
        echo "" >> "$LOG"
        return 1
    fi
}

for i in $(seq -w 0 10); do
    f="$OUT_DIR/companies_0${i:1}.sql"
    # seq -w 0 10 gives 00..10, need 000..010
    :
done

# Simpler: enumerate explicitly
for f in "$OUT_DIR"/companies_0*.sql; do
    run_file "$f" || { echo "STOP at $(basename $f)" >> "$LOG"; exit 2; }
done
echo "COMPANIES DONE" >> "$LOG"

for f in "$OUT_DIR"/contacts_0*.sql; do
    run_file "$f" || { echo "STOP at $(basename $f)" >> "$LOG"; exit 3; }
done
echo "CONTACTS DONE" >> "$LOG"

run_file "$OUT_DIR/link_contacts.sql" || { echo "STOP at link_contacts" >> "$LOG"; exit 4; }
echo "LINK DONE" >> "$LOG"
