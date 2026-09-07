// Whitelisted fields per entity type.
// The compiler refuses any field not listed here — this is the SQL injection defense.
// Add fields deliberately; unknown fields are a validation error, not a silent pass-through.

import type { EntityType, FilterTarget } from "./types";

export const COMPANY_TARGET: FilterTarget = {
  entity_type: "company",
  table: "companies",
  id_column: "id",
  allowed_fields: {
    id: { column: "id", kind: "text" },
    name: { column: "name", kind: "text" },
    domain: { column: "domain", kind: "text" },
    linkedin_url: { column: "linkedin_url", kind: "text" },
    macro_category: { column: "macro_category", kind: "text" },
    group: { column: '"group"', kind: "text" }, // reserved word
    subcategory: { column: "subcategory", kind: "text" },
    industry: { column: "industry", kind: "text" },
    technology: { column: "technology", kind: "text" },
    company_type: { column: "company_type", kind: "text" },
    country_region: { column: "country_region", kind: "text" },
    sponsor_tier: { column: "sponsor_tier", kind: "text" },
    sponsor_tier_rank: { column: "sponsor_tier_rank", kind: "int" },
    rank_last_year: { column: "rank_last_year", kind: "int" },
    rank_stage: { column: "rank_stage", kind: "text" },
    rank_frequency: { column: "rank_frequency", kind: "text" },
    is_customer: { column: "is_customer", kind: "bool" },
    stay_on_top: { column: "stay_on_top", kind: "bool" },
    startup: { column: "startup", kind: "bool" },
    marketing_budget: { column: "marketing_budget", kind: "numeric" },
    total_revenue: { column: "total_revenue", kind: "numeric" },
    number_of_employees: { column: "number_of_employees", kind: "text" },
    pageviews_count: { column: "pageviews_count", kind: "int" },
    blockers_count: { column: "blockers_count", kind: "int" },
    company_owner: { column: "company_owner", kind: "text" },
    last_activity_date: { column: "last_activity_date", kind: "timestamp" },
    hs_create_date: { column: "hs_create_date", kind: "timestamp" },
    summit_interest: { column: "summit_interest", kind: "text_array" },
    conferences: { column: "conferences", kind: "text_array" },
    activity: { column: "activity", kind: "text_array" },
  },
};

export const CONTACT_TARGET: FilterTarget = {
  entity_type: "contact",
  table: "contacts",
  id_column: "id",
  allowed_fields: {
    id: { column: "id", kind: "text" },
    company_id: { column: "company_id", kind: "text" },
    first_name: { column: "first_name", kind: "text" },
    last_name: { column: "last_name", kind: "text" },
    full_name: { column: "full_name", kind: "text" },
    email: { column: "email", kind: "text" },
    email_domain: { column: "email_domain", kind: "text" },
    job_title: { column: "job_title", kind: "text" },
    linkedin_url: { column: "linkedin_url", kind: "text" },
    twitter_username: { column: "twitter_username", kind: "text" },
    country_region: { column: "country_region", kind: "text" },
    focus: { column: "focus", kind: "text" },
    deal_type: { column: "deal_type", kind: "text" },
    lead_status: { column: "lead_status", kind: "text" },
    contact_owner: { column: "contact_owner", kind: "text" },
    marketing_contact_status: { column: "marketing_contact_status", kind: "text" },
    unsubscribed_all_email: { column: "unsubscribed_all_email", kind: "bool" },
    opted_out_marketing_info: { column: "opted_out_marketing_info", kind: "bool" },
    emails_delivered: { column: "emails_delivered", kind: "int" },
    emails_opened: { column: "emails_opened", kind: "int" },
    emails_clicked: { column: "emails_clicked", kind: "int" },
    emails_replied: { column: "emails_replied", kind: "int" },
    emails_bounced: { column: "emails_bounced", kind: "int" },
    times_contacted: { column: "times_contacted", kind: "int" },
    last_email_send_date: { column: "last_email_send_date", kind: "timestamp" },
    last_email_open_date: { column: "last_email_open_date", kind: "timestamp" },
    last_email_click_date: { column: "last_email_click_date", kind: "timestamp" },
    last_email_reply_date: { column: "last_email_reply_date", kind: "timestamp" },
    last_activity_date: { column: "last_activity_date", kind: "timestamp" },
    hs_create_date: { column: "hs_create_date", kind: "timestamp" },
    key_contact: { column: "key_contact", kind: "text_array" },
    list_type: { column: "list_type", kind: "text_array" },
  },
};

export function targetForEntity(t: EntityType): FilterTarget {
  return t === "company" ? COMPANY_TARGET : CONTACT_TARGET;
}
