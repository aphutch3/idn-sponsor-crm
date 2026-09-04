"""Convert HubSpot CSVs into batched INSERT SQL for Supabase.

Writes:
  out/companies_00.sql, companies_01.sql, ...
  out/contacts_00.sql, contacts_01.sql, ...
  out/link_contacts.sql   (updates contacts.company_id via hubspot join)
"""
from __future__ import annotations
import csv, json, os, re, sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)

def sql_str(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, dict) or isinstance(v, list):
        s = json.dumps(v, ensure_ascii=False, default=str)
        return "'" + s.replace("'", "''") + "'::jsonb"
    s = str(v).replace("'", "''")
    return "'" + s + "'"

def sql_text_array(items):
    if not items: return "NULL"
    escaped = ["\"" + str(x).replace("\\","\\\\").replace("\"","\\\"") + "\"" for x in items]
    inner = ",".join(escaped)
    return "'{" + inner.replace("'", "''") + "}'::text[]"

def parse_multi(v):
    if not v: return None
    parts = [p.strip() for p in re.split(r"[;\n]", v) if p.strip()]
    return parts or None

def parse_bool(v):
    if v is None or v == "": return None
    s = str(v).strip().lower()
    if s in ("true","yes","1","y","t"): return True
    if s in ("false","no","0","n","f"): return False
    return None

def parse_num(v):
    if v is None or v == "": return None
    try:
        n = float(v)
        if n.is_integer(): return int(n)
        return n
    except Exception:
        return None

def parse_int(v):
    n = parse_num(v)
    if n is None: return None
    try: return int(n)
    except Exception: return None

def parse_ts(v):
    if not v: return None
    v = v.strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            dt = datetime.strptime(v, fmt)
            return dt.isoformat()
        except ValueError:
            continue
    # HubSpot often exports 2025-06-11 14:22:33 GMT-04:00 style — just accept the leading date
    m = re.match(r"(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})", v)
    if m:
        try: return datetime.fromisoformat(m.group(1).replace(" ","T")).isoformat()
        except Exception: pass
    m = re.match(r"(\d{4}-\d{2}-\d{2})", v)
    if m: return m.group(1)
    return None

def tier_rank(v):
    if not v: return None
    m = re.match(r"^(\d+)_", v)
    return int(m.group(1)) if m else None

def clean_domain(d):
    if not d: return None
    d = d.strip().lower()
    d = re.sub(r"^https?://", "", d)
    d = re.sub(r"^www\.", "", d)
    d = d.split("/")[0].strip()
    return d or None

# ---------------- companies ----------------
def build_companies():
    with open(ROOT / "data/companies.csv", newline='', encoding='utf-8') as f:
        rdr = csv.DictReader(f)
        rows = list(rdr)
    print(f"Companies: {len(rows)} rows")

    cols = [
      "hubspot_record_id","name","domain","website_url","linkedin_url","twitter_handle",
      "summit_interest","sponsor_tier","sponsor_tier_rank","rank_history","activity",
      "conferences","conference_speaking","company_type","keep",
      "macro_category","\"group\"","subcategory","industry","technology","startup",
      "marketing_budget","total_revenue","number_of_employees","country_region",
      "pageviews_count","blockers_count","company_owner","last_activity_date","hs_create_date",
      "raw"
    ]

    BATCH = 200
    files = []
    for chunk_i in range(0, len(rows), BATCH):
        batch = rows[chunk_i:chunk_i+BATCH]
        parts = []
        for r in batch:
            name = (r.get("Company name") or "").strip() or (r.get("Company Domain Name") or "").strip() or "Unknown"
            vals = [
              sql_str(r.get("Record ID") or None),
              sql_str(name),
              sql_str(clean_domain(r.get("Company Domain Name"))),
              sql_str(r.get("Website URL") or None),
              sql_str(r.get("LinkedIn Company Page") or None),
              sql_str(r.get("Twitter Handle") or None),
              sql_text_array(parse_multi(r.get("Summit Interest"))),
              sql_str(r.get("Sponsor Tier") or None),
              sql_str(tier_rank(r.get("Sponsor Tier"))),
              sql_str(r.get("RANK_History") or None),
              sql_text_array(parse_multi(r.get("Activity"))),
              sql_text_array(parse_multi(r.get("Conferences"))),
              sql_str(r.get("Conference Speaking") or None),
              sql_str(r.get("Company Type") or None),
              sql_str(r.get("Keep") or None),
              sql_str(r.get("Macro Category") or None),
              sql_str(r.get("Group") or None),
              sql_str(r.get("Subcategory") or None),
              sql_str(r.get("Industry") or None),
              sql_str(r.get("Technology") or None),
              sql_str(parse_bool(r.get("Startup") == "Yes" or (r.get("Startup") if r.get("Startup") in ("true","false") else None))),
              sql_str(parse_num(r.get("Marketing Budget"))),
              sql_str(parse_num(r.get("Total Revenue"))),
              sql_str(r.get("Number of Employees") or None),
              sql_str(r.get("Country/Region") or None),
              sql_str(parse_int(r.get("Number of Pageviews"))),
              sql_str(parse_int(r.get("Number of blockers"))),
              sql_str(r.get("Company owner") or None),
              sql_str(parse_ts(r.get("Last Activity Date"))),
              sql_str(parse_ts(r.get("Create Date"))),
              sql_str({k: v for k, v in r.items() if v not in (None, "")}),
            ]
            parts.append("(" + ",".join(vals) + ")")
        sql = (
          "INSERT INTO companies (" + ",".join(cols) + ") VALUES\n" +
          ",\n".join(parts) +
          "\nON CONFLICT (hubspot_record_id) DO UPDATE SET\n"
          "  name = EXCLUDED.name,\n"
          "  domain = EXCLUDED.domain,\n"
          "  website_url = EXCLUDED.website_url,\n"
          "  linkedin_url = EXCLUDED.linkedin_url,\n"
          "  twitter_handle = EXCLUDED.twitter_handle,\n"
          "  summit_interest = EXCLUDED.summit_interest,\n"
          "  sponsor_tier = EXCLUDED.sponsor_tier,\n"
          "  sponsor_tier_rank = EXCLUDED.sponsor_tier_rank,\n"
          "  rank_history = EXCLUDED.rank_history,\n"
          "  activity = EXCLUDED.activity,\n"
          "  conferences = EXCLUDED.conferences,\n"
          "  conference_speaking = EXCLUDED.conference_speaking,\n"
          "  company_type = EXCLUDED.company_type,\n"
          "  keep = EXCLUDED.keep,\n"
          "  macro_category = EXCLUDED.macro_category,\n"
          "  \"group\" = EXCLUDED.\"group\",\n"
          "  subcategory = EXCLUDED.subcategory,\n"
          "  industry = EXCLUDED.industry,\n"
          "  technology = EXCLUDED.technology,\n"
          "  startup = EXCLUDED.startup,\n"
          "  marketing_budget = EXCLUDED.marketing_budget,\n"
          "  total_revenue = EXCLUDED.total_revenue,\n"
          "  number_of_employees = EXCLUDED.number_of_employees,\n"
          "  country_region = EXCLUDED.country_region,\n"
          "  pageviews_count = EXCLUDED.pageviews_count,\n"
          "  blockers_count = EXCLUDED.blockers_count,\n"
          "  company_owner = EXCLUDED.company_owner,\n"
          "  last_activity_date = EXCLUDED.last_activity_date,\n"
          "  hs_create_date = EXCLUDED.hs_create_date,\n"
          "  raw = EXCLUDED.raw,\n"
          "  updated_at = now();\n"
        )
        p = OUT / f"companies_{chunk_i//BATCH:03d}.sql"
        p.write_text(sql, encoding='utf-8')
        files.append(str(p))
    print(f"wrote {len(files)} company batches")
    return files

# ---------------- contacts ----------------
def build_contacts():
    with open(ROOT / "data/contacts.csv", newline='', encoding='utf-8') as f:
        rdr = csv.DictReader(f)
        rows = list(rdr)
    print(f"Contacts: {len(rows)} rows")

    cols = [
      "hubspot_record_id","hubspot_company_id","associated_company_ids",
      "first_name","last_name","email","email_domain","job_title",
      "linkedin_url","twitter_username","country_region","phone",
      "key_contact","focus","deal_type","list_type","lead_status","contact_owner",
      "marketing_contact_status","unsubscribed_all_email","opted_out_marketing_info",
      "emails_delivered","emails_opened","emails_clicked","emails_replied","emails_bounced",
      "hard_bounce_reason","last_email_send_date","last_email_open_date","last_email_click_date","last_email_reply_date",
      "recent_sales_email_open_date","recent_sales_email_click_date","times_contacted",
      "hs_create_date","last_activity_date","raw"
    ]

    BATCH = 200
    files = []
    for chunk_i in range(0, len(rows), BATCH):
        batch = rows[chunk_i:chunk_i+BATCH]
        parts = []
        for r in batch:
            assoc_ids_raw = r.get("Associated Company IDs") or ""
            assoc_ids = [x.strip() for x in re.split(r"[;,]", assoc_ids_raw) if x.strip()]
            vals = [
              sql_str(r.get("Record ID") or None),
              sql_str(assoc_ids[0] if assoc_ids else None),
              sql_text_array(assoc_ids or None),
              sql_str(r.get("First Name") or None),
              sql_str(r.get("Last Name") or None),
              sql_str((r.get("Email") or "").lower() or None),
              sql_str(r.get("Email Domain") or None),
              sql_str(r.get("Job Title") or None),
              sql_str(r.get("Linkedin URL") or None),
              sql_str(r.get("Twitter Username") or None),
              sql_str(r.get("Country/Region") or None),
              sql_str(r.get("ZoomInfo Phone") or None),
              sql_text_array(parse_multi(r.get("Key Contact"))),
              sql_str(r.get("Focus") or None),
              sql_str(r.get("Deal Type") or None),
              sql_text_array(parse_multi(r.get("List Type"))),
              sql_str(r.get("Lead Status") or None),
              sql_str(r.get("Contact owner") or None),
              sql_str(r.get("Marketing contact status") or None),
              sql_str(parse_bool(r.get("Unsubscribed from all email")) or False),
              sql_str(parse_bool(r.get("Opted out of email: Marketing Information")) or False),
              sql_str(parse_int(r.get("Marketing emails delivered")) or 0),
              sql_str(parse_int(r.get("Marketing emails opened")) or 0),
              sql_str(parse_int(r.get("Marketing emails clicked")) or 0),
              sql_str(parse_int(r.get("Marketing emails replied")) or 0),
              sql_str(parse_int(r.get("Marketing emails bounced")) or 0),
              sql_str(r.get("Email hard bounce reason") or None),
              sql_str(parse_ts(r.get("Last marketing email send date"))),
              sql_str(parse_ts(r.get("Last marketing email open date"))),
              sql_str(parse_ts(r.get("Last marketing email click date"))),
              sql_str(parse_ts(r.get("Last marketing email reply date"))),
              sql_str(parse_ts(r.get("Recent Sales Email Opened Date"))),
              sql_str(parse_ts(r.get("Recent Sales Email Clicked Date"))),
              sql_str(parse_int(r.get("Number of times contacted")) or 0),
              sql_str(parse_ts(r.get("Create Date"))),
              sql_str(parse_ts(r.get("Last Activity Date"))),
              sql_str({k: v for k, v in r.items() if v not in (None, "")}),
            ]
            parts.append("(" + ",".join(vals) + ")")
        sql = (
          "INSERT INTO contacts (" + ",".join(cols) + ") VALUES\n" +
          ",\n".join(parts) +
          "\nON CONFLICT (hubspot_record_id) DO UPDATE SET\n"
          "  hubspot_company_id = EXCLUDED.hubspot_company_id,\n"
          "  associated_company_ids = EXCLUDED.associated_company_ids,\n"
          "  first_name = EXCLUDED.first_name,\n"
          "  last_name = EXCLUDED.last_name,\n"
          "  email = EXCLUDED.email,\n"
          "  email_domain = EXCLUDED.email_domain,\n"
          "  job_title = EXCLUDED.job_title,\n"
          "  linkedin_url = EXCLUDED.linkedin_url,\n"
          "  twitter_username = EXCLUDED.twitter_username,\n"
          "  country_region = EXCLUDED.country_region,\n"
          "  phone = EXCLUDED.phone,\n"
          "  key_contact = EXCLUDED.key_contact,\n"
          "  focus = EXCLUDED.focus,\n"
          "  deal_type = EXCLUDED.deal_type,\n"
          "  list_type = EXCLUDED.list_type,\n"
          "  lead_status = EXCLUDED.lead_status,\n"
          "  contact_owner = EXCLUDED.contact_owner,\n"
          "  marketing_contact_status = EXCLUDED.marketing_contact_status,\n"
          "  unsubscribed_all_email = EXCLUDED.unsubscribed_all_email,\n"
          "  opted_out_marketing_info = EXCLUDED.opted_out_marketing_info,\n"
          "  emails_delivered = EXCLUDED.emails_delivered,\n"
          "  emails_opened = EXCLUDED.emails_opened,\n"
          "  emails_clicked = EXCLUDED.emails_clicked,\n"
          "  emails_replied = EXCLUDED.emails_replied,\n"
          "  emails_bounced = EXCLUDED.emails_bounced,\n"
          "  hard_bounce_reason = EXCLUDED.hard_bounce_reason,\n"
          "  last_email_send_date = EXCLUDED.last_email_send_date,\n"
          "  last_email_open_date = EXCLUDED.last_email_open_date,\n"
          "  last_email_click_date = EXCLUDED.last_email_click_date,\n"
          "  last_email_reply_date = EXCLUDED.last_email_reply_date,\n"
          "  recent_sales_email_open_date = EXCLUDED.recent_sales_email_open_date,\n"
          "  recent_sales_email_click_date = EXCLUDED.recent_sales_email_click_date,\n"
          "  times_contacted = EXCLUDED.times_contacted,\n"
          "  hs_create_date = EXCLUDED.hs_create_date,\n"
          "  last_activity_date = EXCLUDED.last_activity_date,\n"
          "  raw = EXCLUDED.raw,\n"
          "  updated_at = now();\n"
        )
        p = OUT / f"contacts_{chunk_i//BATCH:03d}.sql"
        p.write_text(sql, encoding='utf-8')
        files.append(str(p))
    print(f"wrote {len(files)} contact batches")
    return files

def build_link():
    sql = (
      "UPDATE contacts c\n"
      "SET company_id = co.id\n"
      "FROM companies co\n"
      "WHERE c.company_id IS NULL\n"
      "  AND c.hubspot_company_id IS NOT NULL\n"
      "  AND co.hubspot_record_id = c.hubspot_company_id;\n"
    )
    p = OUT / "link_contacts.sql"
    p.write_text(sql, encoding='utf-8')
    print("wrote link_contacts.sql")
    return [str(p)]

if __name__ == "__main__":
    build_companies()
    build_contacts()
    build_link()
