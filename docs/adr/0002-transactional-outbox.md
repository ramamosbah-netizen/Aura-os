---
id: adr_2d216ee4
number: 0002
title: Transactional outbox + polling relay over message brokers
status: Accepted
category: Platform
owner: Architecture
date: 
supersedes: []
related: []
---

# ADR-0002: Transactional outbox + polling relay over message brokers

**Status:** Accepted (formalized 2026-07-03; practiced since kernel v0)

## Context
Cross-module automation requires reliable event delivery. Brokers (Kafka/Rabbit) add
infrastructure, and dual-write (DB + broker) risks losing events.

## Decision
Events are appended to the kernel events table in the same transaction as the business row.
A relay polls unpublished rows with FOR UPDATE SKIP LOCKED (replica-safe) and dispatches to
the in-process EventBus. Failures land in a dead-letter table for replay.

## Consequences
+ Atomicity by construction; zero extra infrastructure; works in in-memory mode too.
- Polling latency (acceptable; LISTEN/NOTIFY upgrade path recorded in master report Vol 2).
