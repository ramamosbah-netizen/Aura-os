# AURA end-user UX acceptance standard

This standard applies to every remediation wave and every role. A capability is not operationally complete when its API works but the intended employee cannot identify, perform, verify and hand off the work from the UI.

## Screen contract

Every working screen must answer these questions without training material:

1. **Where am I?** Show the customer, enquiry/tender/project, system/discipline and current lifecycle state.
2. **Why is this with me?** Name the assignment, owner, due date and source record.
3. **What must I do now?** Present one clear primary action and the prerequisites preventing it.
4. **What information is authoritative?** Identify controlled drawings, specifications, quantities, revisions and approvals in plain business language.
5. **What happens after I act?** Name the resulting state, next owner and notification/handoff.
6. **Can I recover?** Preserve drafts, explain validation failures beside the field and provide a safe return path.

The page must keep the record context while moving between workspaces. A user should not select the same customer/project/system repeatedly or search for the record that the previous role just handed over.

## Interaction rules

| Rule | Acceptance evidence |
| --- | --- |
| One clear primary action | First-time role user identifies and completes the next step without guessing between equal buttons. |
| Progressive disclosure | Summary and required action appear first; technical detail, history and secondary tools expand when needed. |
| Explain calculations | Hover **and keyboard focus** reveal what a score/KPI means, its inputs, weights, formula and latest source. |
| Honest capability labels | Export, Email, AI, Compare, Allocate and Approve remain unavailable or explicitly limited until the resulting file/message/record works. |
| Governed finality | Bid/No-Bid, approval, issue, award and acceptance show consequence before commit; after commit the decision is locked, timestamped and attributed, with a governed supersede/reopen path where policy permits. |
| Useful empty states | State what is missing, who supplies it and the single action that starts the workflow. |
| Inline validation | Use field labels, required indicators, examples and specific correction text. Date and numeric controls must have accessible names. |
| Status in business language | Use Draft, Awaiting technical review, Ready for pricing, Issued to client, etc.; avoid internal module/service terminology. |
| Lists scale safely | Search/filter/sort/pagination cover the complete authorized population and preserve filters on return from a record. |
| Accessible and responsive | Keyboard-only completion, visible focus, screen-reader labels, contrast and the role's actual field-device viewport are part of acceptance. |

## Workspace and launcher rule

The tender or project 360 page is the record dashboard. It summarizes status, ownership, blockers and next decisions. Specialist work opens from that dashboard into the canonical workspace through the AURA launcher and keeps a visible return link and record context. The dashboard must not embed a second competing BOQ, estimation, engineering, procurement or document-control authority.

The same rule applies after award: Project 360 is the context and decision surface; Engineering, Planning, Procurement, Site, Quality/HSE, T&C, Handover and Finance remain the canonical workspaces. Navigation must feel like continuing one job, not entering unrelated modules.

## Role workspace rule

Each role lands on a queue of work requiring that role, ordered by due date/risk. Generic dashboards may support discovery, but they do not replace:

- assigned work and required inputs;
- current blockers and overdue items;
- actions permitted for that role;
- completed/rejected work with reason;
- the next handoff and recipient;
- source-backed management totals with drilldown.

Role preview is design evidence only. Acceptance requires signing in as a representative role with the intended grants and proving allowed and denied actions.

## Live UX findings added in this pass

| Surface | What is clear today | Friction / operational consequence | Classification | Master link |
| --- | --- | --- | --- | --- |
| RFQ comparison | Create RFQ, add quote, lowest aggregate amount and lead time are easy to see | The comparison looks decisive while most technical/commercial decision fields and the approved rationale are absent | PARTIAL | F-04 |
| CRM Accounts export | Excel and PDF/print actions are discoverable; the simple register is readable | Workbook is a raw text extract; print identity is hardcoded and PDF file generation is unverified | PARTIAL / WRONG_BEHAVIOR | F-01, F-03 |
| Communication | Internal-only status and unavailable Microsoft/Gmail accounts are stated honestly; draft/schedule/send/reply flow works | Compose says document attachments are not wired and offers no related customer/enquiry/tender/supplier/project | DISCONNECTED | F-05, F-09 |
| Planning & Schedule | Empty state, Gantt, solver proposal, before/after dates and explicit acceptance are understandable | Date fields have no accessible label; task creation omits WBS, predecessors, calendar, resources, quantities and productivity; resource planning appears only with explicit project context | BACKEND_ONLY / DISCONNECTED | F-07, F-08 |
| CEO perspective | Three cards and the financial table are visually simple | It does not cover the required executive decisions, show freshness/population or let the CEO drill into a project/source record | WRONG_BEHAVIOR | F-06, F-10 |
| Global shell tabs | Tabs preserve visited workspaces | Repeated stale Project 360 tabs create noise and make current context harder to identify | PARTIAL | UX-02 |
| Tender dashboard | Tender 360 can summarize pre-award ownership | The dashboard must keep qualification/scope status and route specialist work outward; scoring criteria need formula help and a committed Bid/No-Bid must lock | PARTIAL | J1-03, J1-06, J1-07, UX-04 |

## Per-screen acceptance proof

For each critical workflow, record:

| Dimension | Required proof |
| --- | --- |
| Learnability | A role user explains the purpose and next action from the screen alone. |
| Completion | The role completes the task, reloads and sees the same persisted result. |
| Error prevention | Wrong project, missing prerequisite, invalid value and wrong permission are refused with useful text. |
| Handoff | The named next role receives an actionable item with the same record context. |
| Traceability | Result links to the canonical source, revision, actor and timestamp. |
| Efficiency | Common task has no repeated project/customer selection or duplicate data entry. |
| Accessibility | Keyboard, focus and labels support the whole action; target mobile view remains usable where field work applies. |

A screen remains PARTIAL when the task is possible but one of these dimensions is unproven. It is DISCONNECTED when an employee must re-enter or manually transport canonical information. It is WRONG_BEHAVIOR when the UI presents a misleading state, calculation or authority. It is UNREACHABLE when no legitimate role path opens the function.
