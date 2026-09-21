-- 130_masked_email_not_identity.sql
--
-- The speaker CRM stores some emails redacted: "a******@openai.com". 127 of 315
-- speaker emails are masked like this. The person resolver treated email as a
-- strong identity signal, which it is -- but a masked email is not an email. It
-- is a first initial and a domain, so every pair of people at the same company
-- whose first names share a letter collides.
--
-- Five people were merged into another person as a result. Alexander Embiricos
-- (Head of Enterprise Product, x.com/embirico) and Abhishek Bhardwaj (Member of
-- Technical Staff, x.com/abshkbh) became one person holding both their topics,
-- because both are a******@openai.com. Also Dan Feng, Ishan Anand (3 rows),
-- Anant Srivastava and Mike Phipps (4 rows).
--
-- The mask is still evidence -- it tells you the domain, so it can corroborate
-- an employer -- so it is kept in raw rather than thrown away. What it must not
-- do is sit in the email column, where every consumer will reasonably treat it
-- as an address: match on it, deduplicate on it, or try to send to it.

begin;

update public.person
   set raw = coalesce(raw, '{}'::jsonb)
             || jsonb_build_object('masked_email', email,
                                   'masked_email_note',
                                   'redacted at source; a first initial and a domain, not an address'),
       email = null
 where email like '%*%';

alter table public.person add constraint person_email_not_masked_ck
  check (email is null or email not like '%*%');

comment on constraint person_email_not_masked_ck on public.person is
  'A redacted email such as a******@openai.com identifies a company and a first initial, not a person. Matching on one merged five distinct speakers into another. The masked string is kept in raw.';

commit;
