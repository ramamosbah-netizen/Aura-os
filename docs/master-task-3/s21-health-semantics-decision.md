# DG-21.5 — Do risks and issues enter §24 Project Health?

**Status:** `AWAITING APPROVAL — no signal is implemented`
**Date:** 2026-09-08 · Deferred from the §21 Design Gate until the §21 domain was fixed. It now is
(DG-21.1 … DG-21.4 implemented, 249/249 projects tests, workspace build 27/27).

The gate refused both defaults on purpose — neither "every risk feeds health" nor "risks are
excluded because they are forecasts". This settles it with an argument for each register
separately, because they are not the same kind of fact.

---

## Why this decision is Projects' alone to make

The signal registry states the rule that produced every UNKNOWN in §24:

> **PROJECTS DOES NOT DECIDE WHAT ANOTHER DOMAIN'S VOCABULARY MEANS.**

That is why `engineering-approval-readiness` and `procurement-delivery-exposure` report
`SEMANTICS_UNDECLARED` rather than a guess. It does not apply here. Risks and issues are Projects'
own records, in the same class as `schedule-performance`, `delay-entitlement`, `cost-performance`
and `commercial-exposure` — the four signals Projects already computes inline because it owns the
facts. So both proposals below would carry `semanticsDeclared: true` and need no port and no
cross-module negotiation.

Health stays **explanatory**. Nothing here becomes a gate, and §2 and §27 are untouched.

---

## Decision 1 — Issues: **YES**, one signal

An issue is a condition that exists now. §24's admission criterion is a fact proving that a state
threatens delivery, and the issue severity scale was *defined* in exactly those terms:

```
critical — delivery is stopped, or will stop, and this needs a decision now
major    — delivery is being damaged; work continues but the plan will not hold
minor    — must be resolved, but nothing about delivery changes if it waits
```

That is not a re-interpretation. `critical` already means what `CRITICAL` means, because someone
stated it about this project. It is the same class of evidence as a `major` NCR or a `fatal` HSE
incident — a person's declared grade on a record that exists — both of which §24 already accepts.

**Proposed `project-issue-exposure` (domain: `issue`):**

| Fact | State |
|---|---|
| An open issue graded `critical` | `CRITICAL` |
| An open issue past the resolve-by date the project set | `AT_RISK` |
| An open issue graded `major` | `WATCH` |
| Open `minor` issues only, or none recorded | `CLEAR` |

Worst wins, as everywhere in §24. `reason` names the count and the worst grade; `href` points at
the §21 workspace, which is where the work is done.

---

## Decision 2 — Risks: **YES, but only through a present-tense fact**

This is the one the gate flagged as genuinely arguable, and both extremes are wrong.

### Why "an open CRITICAL risk raises severity" must be rejected

It would make health **punish the behaviour it exists to encourage.**

A project manager who keeps a diligent register — twenty risks identified, owned, mitigated —
would read worse than one who keeps none. The second project is not healthier; it is
unexamined. Health would be measuring how much thinking had been written down, and the rational
response would be to stop writing it down.

That is decisive, and it is not a small effect: it points a reporting surface directly against
§21's purpose.

### Why "risks are excluded entirely" is also wrong

There is a fact in the risk register that is **not** a forecast:

> **An open risk whose own target date has passed.**

The project stated a date by which the mitigation would be in place, and it is not. That is a
present-tense governance failure about today, not a prediction about tomorrow — and §24 already
admits exactly this shape of evidence twice: `engineering-delivery-impact` counts drawing reviews
past their agreed date, and `procurement-sourcing-readiness` counts RFQs past the deadline
Procurement itself set. Both were accepted on the same reasoning.

So the rule is: **a risk enters health through what has failed to happen, never through what might
happen.** `summariseProjectRisks` already computes `overdueMitigations` for precisely this.

**Proposed `project-risk-mitigation` (domain: `risk`):**

| Fact | State |
|---|---|
| An open `CRITICAL` or `HIGH` risk whose target date has passed | `AT_RISK` |
| An open risk of any severity whose target date has passed | `WATCH` |
| No open risk is past its target date | `CLEAR` |

Note what is absent: the count of open risks, and their severities on their own, appear **nowhere**.
A register full of well-managed CRITICAL risks with future target dates reports `CLEAR`, which is
the correct answer — the risks are being managed.

### A forecast may never reach CRITICAL

The signal is capped at `AT_RISK` by design. `CRITICAL` on this scale means delivery is stopped or
will stop; a risk has not happened, so it cannot have stopped anything. Letting a forecast reach
the top of the scale would make `CRITICAL` mean two different things, and the aggregate takes the
worst — so one uncapped forecast would outrank every real condition on the project.

The name is `project-risk-mitigation`, not `project-risk-exposure`, because what it reports is the
state of the mitigations, not the size of the exposure.

---

## Decision 3 — An empty register is `CLEAR`, and the limit is written down

Not `NOT_APPLICABLE`: every project can have risks and issues. Commissioning may legitimately have
nothing to commission; there is no such thing as a project to which issues cannot apply.

Not `UNKNOWN`: that would make **every** project permanently `PARTIAL`, and a coverage axis that is
always partial says nothing. `CLEAR` is defined in `project-health.ts` as "nothing was found in the
facts we were able to assess" and carries no completeness claim, which is exactly the right
strength.

**The honest residual, stated rather than buried:** §24 cannot distinguish *"this project has no
open issues"* from *"nobody on this project uses the issue register."* Both report `CLEAR`. No fact
available today separates them, and inventing one — a usage heuristic, a staleness threshold —
would be Projects deciding that not writing something down is itself a finding. That is a real
limit on what these two signals prove, and it belongs in the Master Gap register rather than being
papered over with a guess.

---

## What approval would change

```
shared/domain/project-health.ts   HealthDomain += 'risk' | 'issue'
domain/health-signals.ts          HealthSignalId += 'project-risk-mitigation'
                                                 += 'project-issue-exposure'
                                  both semanticsDeclared: true — Projects owns these facts
project-health.service.ts         computed inline from the two registers, as schedule / delay /
                                  cost / commercial already are. No new port, no GatesModule wiring.
```

Two existing browser assertions would need revisiting, since the panel gains two signals that
answer rather than report UNKNOWN.

**Not proposed:** any effect on `applicable`, on `reassuring`, on the lifecycle gate, or on closeout
readiness. §24 explains; §2 and §27 decide.

---

## Awaiting

Approval of Decision 1, Decision 2 and Decision 3 — or a different reading of any of them. Nothing
is implemented, and the §21 API/BFF/UI remains gated behind the fresh-PostgreSQL proof regardless
of what is decided here.
