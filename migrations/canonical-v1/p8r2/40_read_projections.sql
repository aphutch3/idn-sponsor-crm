-- P8R1 / reconstructed proposal, NOT historical source. NOT APPLIED.
-- Run only in an explicitly authorized disposable rehearsal, inside one transaction.
SELECT pg_temp.p8r_guard();
SET LOCAL search_path = public, pg_catalog;

CREATE OR REPLACE VIEW public."campaign_sends" AS
 SELECT id,
    campaign_id,
    contact_id,
    person_id,
    recipient_email,
    provider,
    provider_message_id,
    status,
    sent_at,
    delivered_at,
    opened_at,
    clicked_at,
    bounced_at,
    complained_at,
    last_event_at,
    error,
    raw,
    created_at,
    subject,
    snapshot_id,
    stubbed_html,
    provider_events,
    opens,
    clicks,
    first_opened_at,
    last_opened_at,
    first_clicked_at,
    last_clicked_at,
    last_clicked_url
   FROM campaign_send;

CREATE OR REPLACE VIEW public."segment" AS
 SELECT id,
    name,
    description,
    owner,
    filter,
    member_count,
    raw,
    created_at,
    updated_at,
    entity_types,
    last_refreshed_at
   FROM list
  WHERE (kind = 'segment'::text);

CREATE OR REPLACE VIEW public."segments" AS
 SELECT id,
    name,
    description,
    owner,
    filter,
    member_count,
    raw,
    created_at,
    updated_at,
    entity_types,
    last_refreshed_at
   FROM segment;

CREATE OR REPLACE VIEW public."v_company" AS
 SELECT co.id,
    co.name,
    co.normalized_name,
    co.domain,
    co.website_url,
    co.linkedin_url,
    co.twitter_handle,
    co.country_region,
    co.employee_count_band,
    co.macro_category,
    co.industry,
    co.company_type,
    co.is_customer,
    co.is_startup,
    co.stay_on_top,
    co.owner,
    co.embedding,
    co.embedding_model,
    co.embedding_source,
    co.embedding_updated_at,
    co.embedding_from_people,
    co.raw,
    co.created_at,
    co.updated_at,
    co.logo_url,
    co.logo_media_asset_id,
    co.sponsor_tier,
    co.sponsor_tier_rank,
    co.summit_interest,
    co."group",
    co.subcategory,
    co.rank_history,
    co.rank_last_year,
    co.rank_frequency,
    co.number_of_employees,
    co.keep,
    COALESCE(ct.contact_count, (0)::bigint) AS contact_count,
    ls.latest_signal_at
   FROM ((company co
     LEFT JOIN LATERAL ( SELECT count(*) AS contact_count
           FROM contact
          WHERE (contact.company_id = co.id)) ct ON (true))
     LEFT JOIN LATERAL ( SELECT max(linkedin_signal.created_at) AS latest_signal_at
           FROM linkedin_signal
          WHERE ((linkedin_signal.entity_type = 'company'::text) AND (linkedin_signal.entity_id = co.id))) ls ON (true));

CREATE OR REPLACE VIEW public."v_contact" AS
 SELECT c.id,
    c.first_name,
    c.last_name,
    COALESCE(c.full_name, TRIM(BOTH FROM concat(c.first_name, ' ', c.last_name))) AS full_name,
    c.email,
    c.job_title,
    c.linkedin_url,
    c.phone,
    c.twitter_username,
    c.lead_status,
    c.owner,
    c.key_contact,
    c.unsubscribed_all,
    c.unsubscribed_all_email,
    c.last_email_open_date,
    c.last_email_click_date,
    c.last_email_send_date,
    c.last_activity_date,
    c.emails_delivered,
    c.emails_opened,
    c.emails_clicked,
    c.emails_replied,
    c.company_id,
    co.name AS company_name,
    co.website_url AS company_website,
    co.domain AS company_domain,
    co.sponsor_tier AS company_sponsor_tier,
    co.sponsor_tier_rank AS company_sponsor_tier_rank,
    co."group" AS company_group,
    co.subcategory AS company_subcategory,
    c.created_at,
    c.updated_at
   FROM (contact c
     LEFT JOIN company co ON ((co.id = c.company_id)));

CREATE OR REPLACE VIEW public."v_key_contacts" AS
 SELECT c.id,
    c.first_name,
    c.last_name,
    c.email,
    c.job_title,
    c.key_contact,
    c.lead_status,
    co.name AS company_name,
    c.company_id,
    co.sponsor_tier,
    c.emails_delivered,
    c.emails_opened,
    c.emails_clicked,
    c.emails_replied,
    c.last_email_send_date,
    c.unsubscribed_all_email
   FROM (contact c
     LEFT JOIN company co ON ((co.id = c.company_id)))
  WHERE ((c.key_contact IS NOT NULL) AND (array_length(c.key_contact, 1) > 0));

CREATE OR REPLACE VIEW public."v_taxonomy" AS
 SELECT macro_category,
    "group",
    subcategory,
    (count(*))::integer AS company_count
   FROM company
  WHERE (macro_category IS NOT NULL)
  GROUP BY macro_category, "group", subcategory;
