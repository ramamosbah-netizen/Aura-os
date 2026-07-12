# Contacts & Stakeholders 360

**Date:** 2026-07-12 · **Branch:** `feat/contacts-stakeholders-360`
**Why:** the missing layer between Account and Opportunity. Contacts were a flat
people directory; the deal is driven by *who* — decision maker, influencer,
finance, champion vs blocker — and by the account hierarchy. This makes contacts
first-class **stakeholders**: `Account → People → Opportunity → … → Project`.

## 1. Domain — the stakeholder dimensions (migration 0152)
`Contact` gains `stakeholderRole` (decision_maker · influencer · technical ·
commercial · finance · executive_sponsor · user), `relationshipStrength`
(champion · strong · neutral · weak · detractor), and `reportsToId` + snapshot
`reportsToName` for the account hierarchy. All additive/nullable — 0152 adds four
columns with guarded `@DOWN`, no backfill. Postgres store + DTOs + sparse
`ContactService.update` Pick all extended.

## 2. `GET /crm/contacts/:id/summary` — the stakeholder command center
New `Contact360Controller` (registered before `CrmContactsController` so the
literal `:id/summary` route wins). Composes: the contact, its account, the
account's live deal chain (opportunities/tenders/quotations/contracts/projects —
the deals this person is involved in), the personal activity timeline
(`relatedId = contactId`) with a derived **last interaction**, and the account
hierarchy — `reportsTo`, direct `reports`, and `peers` for the stakeholder map.

## 3. Contact 360 page (`/crm/contacts/[id]`)
Header (★ primary, title, account link, "reports to", last interaction) with
inline **role / relationship** selects that PATCH live; snapshot (open opps,
account pipeline, active contracts/projects, interactions, open actions);
composite Overview — **Stakeholder Map** (manager / this person / reports / other
stakeholders with role + strength), Details, Upcoming Actions, Recent
Interactions; Deals tab (the account's chain); Activity tab.

## 4. Contacts list → stakeholder register
Renamed "Contacts & Stakeholders". KPIs now count decision makers, champions,
role-unmapped. Smart-view chips filter by role (+ Champions, Unmapped). Table adds
Stakeholder role + Relationship columns, name links to the 360. Create/edit
drawer captures role, strength, and reports-to. CSV export includes the new
columns.

## 5. Stakeholder map inside Account 360
The Contacts tab is now the account's stakeholder map (Name · Title · Role ·
Relationship · Reports to · Email, primary-first), and Overview "Key Contacts"
links to each person's 360 with their role.

## 6. Verification (live, dev DB, :4310/:3310)
Seeded Layla (CFO, decision_maker, champion, primary) and Omar (commercial,
neutral, reports to Layla) on Acme. Contact 360 endpoint returned role/strength,
`reports:[Omar]`, `reportsTo:Layla`, peers with roles, and the account's 3
contracts / 2 projects. Browser: register KPIs (1 decision maker, 1 champion, 2
unmapped) + role columns; Contact 360 stakeholder map + inline selects; Account
360 Contacts tab renders the full map with Omar → Layla. crm tests 19/19 · crm +
api + web builds green · migration gate green (152, @DOWN) · SDK regenerated
(684 ops).

## 7. Next in the sequence
Opportunity 360 command center (qualification/probability, stakeholders +
competitors, direct-vs-tender progression, win/loss), then the Commercial
Activity System and the Sales Pipeline command center.
