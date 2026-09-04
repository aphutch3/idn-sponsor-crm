#!/usr/bin/env python3
"""Split each SQL batch file into smaller chunks and execute via pplx connector."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

OUT_DIR = Path("/home/user/workspace/idn-sponsor-crm/out")
LOG = Path("/home/user/workspace/idn-sponsor-crm/import_log.txt")
PAYLOAD = Path("/tmp/payload.json")
PROJECT_ID = "wpgfanjopuupjcgrdbmb"
MAX_CHUNK_BYTES = 100_000  # target chunk size for query body

def parse_file(path: Path):
    """Return (header, rows, on_conflict_clause). Rows list without trailing comma."""
    text = path.read_text()
    # header: everything up to and including "VALUES\n"
    m = re.search(r"^(.*?VALUES\s*)\n", text, re.DOTALL)
    if not m:
        raise RuntimeError(f"No VALUES header in {path}")
    header = m.group(1)
    rest = text[m.end():]
    # find ON CONFLICT
    idx = rest.find("ON CONFLICT")
    if idx < 0:
        # no on conflict — treat as tail after last );
        body = rest.rstrip().rstrip(";")
        on_conflict = ";"
    else:
        body = rest[:idx].rstrip()
        on_conflict = "\n" + rest[idx:]
    # body is rows separated by ",\n" — last row does not end with comma
    # Split rows by finding "),\n(" at top level. Simpler: rows separated by ",\n" but only at end of row.
    # Since each row is a paren-balanced tuple, use a simple state machine.
    rows = []
    depth = 0
    in_str = False
    start = 0
    i = 0
    while i < len(body):
        c = body[i]
        if in_str:
            if c == "'":
                # check for escaped ''
                if i + 1 < len(body) and body[i+1] == "'":
                    i += 2
                    continue
                in_str = False
        else:
            if c == "'":
                in_str = True
            elif c == "(":
                if depth == 0:
                    start = i
                depth += 1
            elif c == ")":
                depth -= 1
                if depth == 0:
                    rows.append(body[start:i+1])
        i += 1
    return header, rows, on_conflict

import time

def run_sql(query: str, label: str, max_retries: int = 6) -> tuple[bool, str]:
    payload = {"project_id": PROJECT_ID, "query": query}
    PAYLOAD.write_text(json.dumps(payload))
    # Read payload as string and pass via env would also be limited; use xargs? No.
    # Use --input with the JSON — but arg too long. Instead invoke via a wrapper that reads file.
    # We'll rely on the payload fitting in argv when chunked small enough.
    with open(PAYLOAD) as f:
        payload_str = f.read()
    delay = 3.0
    for attempt in range(max_retries):
        try:
            result = subprocess.run(
                ["pplx", "connector", "call", "supabase", "execute_sql", "--input", payload_str],
                capture_output=True, text=True, timeout=180
            )
        except subprocess.TimeoutExpired:
            return False, f"timeout on {label}"
        out = result.stdout + result.stderr
        if 'CONNECTOR_RATE_LIMITED' in out or 'rate limit' in out.lower():
            time.sleep(delay)
            delay = min(delay * 2, 60)
            continue
        break
    if result.returncode != 0:
        return False, f"rc={result.returncode}: {out[:1500]}"
    # Parse JSON response — pplx may emit multiple JSON objects concatenated
    # Extract the first JSON object using a decoder
    data = None
    try:
        decoder = json.JSONDecoder()
        s = out.lstrip()
        data, _ = decoder.raw_decode(s)
    except (json.JSONDecodeError, ValueError):
        # fallback: look for explicit error markers
        low = out.lower()
        if '"is_error": true' in low or '"iserror": true' in low:
            return False, out[:1500]
        return True, "ok"
    # Check for error field in the response
    if isinstance(data, dict):
        if data.get("error") is not None:
            return False, json.dumps(data["error"])[:1500]
        if data.get("is_error") is True or data.get("isError") is True:
            return False, json.dumps(data)[:1500]
    return True, "ok"

def process_file(path: Path) -> bool:
    header, rows, on_conflict = parse_file(path)
    total = len(rows)
    # Chunk rows
    chunks = []
    current = []
    current_size = 0
    for r in rows:
        rlen = len(r) + 2  # comma+newline
        if current and current_size + rlen > MAX_CHUNK_BYTES:
            chunks.append(current)
            current = [r]
            current_size = rlen
        else:
            current.append(r)
            current_size += rlen
    if current:
        chunks.append(current)
    with LOG.open("a") as log:
        log.write(f"[{path.name}] {total} rows -> {len(chunks)} chunks\n")
        for idx, chunk in enumerate(chunks):
            body = ",\n".join(chunk)
            query = header + "\n" + body + on_conflict
            ok, msg = run_sql(query, f"{path.name}#{idx}")
            if not ok:
                log.write(f"  FAIL chunk {idx}: {msg}\n")
                log.flush()
                return False
            log.write(f"  OK chunk {idx} ({len(chunk)} rows, {len(query)} bytes)\n")
            log.flush()
            time.sleep(1.0)
        log.write(f"[{path.name}] DONE\n")
    return True

def main():
    files_arg = sys.argv[1:]
    if not files_arg:
        print("usage: split_and_run.py <file1.sql> [file2.sql...]")
        sys.exit(1)
    for fname in files_arg:
        p = OUT_DIR / fname if not fname.startswith("/") else Path(fname)
        if not p.exists():
            print(f"missing: {p}")
            sys.exit(2)
        print(f"processing {p.name}...", flush=True)
        ok = process_file(p)
        if not ok:
            print(f"FAILED at {p.name} — see log")
            sys.exit(3)
        print(f"done {p.name}")

if __name__ == "__main__":
    main()
