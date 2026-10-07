# Joosa Development Plan

> Joosa (جوزة) — Generator Subscription & Payment Management Platform  
> Repository: Thanoon12k/joosa-app  
> Status: Pre-MVP  
> Primary goal: ship a very small usable MVP first, then scale safely toward 10,000 concurrent users.

---

## 1. Product Vision

Joosa is a simple, reliable management system for private generator owners.

The first version is NOT an ERP and should NOT attempt to solve everything.

The first release must solve one core workflow:

1. Add a subscriber.
2. Find the subscriber quickly.
3. See their ampere subscription.
4. Register the monthly payment.
5. Know who paid and who did not.
6. See a very small monthly dashboard.

Everything else is postponed until this workflow is stable and validated with real generator owners.

---

## 2. Product Principles

- Simplicity before features.
- Offline-first for field usage.
- Arabic-first UX.
- Mobile-first.
- Financial records must be traceable.
- Never delete important financial history silently.
- Architecture must allow future cloud sync.
- Architecture must allow future notifications and ads.
- Avoid premature microservices.
- Avoid premature infrastructure.
- Build only what the current milestone requires.
- New features must not break the existing payment workflow.

---

## 3. Target Users

### MVP
- Generator owner.

### Later
- Generator manager.
- Collector.
- Accountant.
- Maintenance technician.
- Multi-generator owner.
- Residential compounds.
- Commercial compounds.
- Subscriber/customer app users.

---

# Phase 0 — Project Foundation

## Goal
Create a clean Flutter project that can grow without rewriting the app.

### Tasks

- [ ] Create Flutter application.
- [ ] Confirm Android build works.
- [ ] Configure app name: Joosa / جوزة.
- [ ] Configure package/application id.
- [ ] Add linting rules.
- [ ] Add formatting rules.
- [ ] Create development branch if needed.
- [ ] Keep main branch releasable.
- [ ] Add .gitignore.
- [ ] Add environment configuration strategy.
- [ ] Never commit secrets.
- [ ] Add basic README instructions.

### Suggested Flutter structure

```text
lib/
├── app/
│   ├── app.dart
│   ├── router.dart
│   └── theme.dart
│
├── core/
│   ├── database/
│   ├── error/
│   ├── utils/
│   ├── services/
│   └── widgets/
│
├── features/
│   ├── dashboard/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   │
│   ├── subscribers/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   │
│   ├── payments/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   │
│   └── settings/
│       └── presentation/
│
└── main.dart
```

### Architecture rule

UI must NOT access SQLite/Drift directly.

Use:

```text
Presentation
    ↓
Repository
    ↓
Data Source
```

This allows future replacement/extension with:

```text
                 Local DB
                ↗
UI → Repository
                ↘
                 REST API
```

---

# Phase 1 — Local Database

## Goal
Create an offline-first local data layer.

Recommended:
- Drift + SQLite.

### Subscriber entity

Initial fields only:

```text
id
name
phone
ampere
amp_price
is_active
created_at
updated_at
```

Requirements:

- [ ] Use UUID IDs.
- [ ] Do not rely only on auto-increment integer IDs.
- [ ] Add created_at.
- [ ] Add updated_at.
- [ ] Add database migrations from day one.
- [ ] Do not wipe the database during schema upgrades.

### Payment entity

```text
id
subscriber_id
amount
month
year
paid_at
created_at
```

Rules:

- [ ] Store actual payment records.
- [ ] Do not model payment using only `is_paid = true`.
- [ ] Prevent accidental duplicate payment records where possible.
- [ ] Payment history must remain available.

---

# Phase 2 — Subscribers MVP

## Goal
Owner can create and find subscribers.

### Subscribers screen

Must include:

- [ ] List subscribers.
- [ ] Search by name.
- [ ] Search by phone.
- [ ] Show ampere count.
- [ ] Show current-month payment status.
- [ ] Add subscriber button.

### Add subscriber screen

Only:

- [ ] Name.
- [ ] Phone.
- [ ] Ampere count.
- [ ] Price per ampere.

Validation:

- [ ] Name required.
- [ ] Ampere > 0.
- [ ] Price >= 0.
- [ ] Normalize phone input.
- [ ] Handle duplicate phones gracefully.

Do NOT add address, notes, collector, meter, debts, etc. unless required after real-user validation.

---

# Phase 3 — Subscriber Details

## Goal
Show exactly what owner needs before collecting money.

Example:

```text
Ahmed Mohammed
0770xxxxxxx

Ampere: 5A
Price / Ampere: 10,000 IQD

Current month:
50,000 IQD

Status:
Not Paid

[ Register Payment ]
```

Calculation:

```text
monthly_amount = ampere × amp_price
```

Tasks:

- [ ] Show subscriber information.
- [ ] Show monthly amount.
- [ ] Show current month.
- [ ] Show Paid / Not Paid.
- [ ] Provide payment action.

---

# Phase 4 — Payment Flow

## Goal
Register payment in the smallest number of taps possible.

Flow:

```text
Subscriber
→ Register Payment
→ Confirm Amount
→ Save Payment
→ Status becomes Paid
```

Tasks:

- [ ] Default amount to calculated monthly amount.
- [ ] Allow correction before confirmation.
- [ ] Save timestamp.
- [ ] Save month/year.
- [ ] Refresh subscriber status immediately.
- [ ] Refresh dashboard immediately.
- [ ] Prevent obvious double taps / duplicate submissions.

Financial rule:

Never silently delete a payment after production financial features are introduced. Future corrections should use reversal/adjustment records.

---

# Phase 5 — MVP Dashboard

## Goal
Provide immediate operational value.

Only show:

- [ ] Total subscribers.
- [ ] Paid this month.
- [ ] Not paid this month.
- [ ] Amount collected this month.

No complex charts in v0.1.

Example:

```text
Subscribers
250

Paid
180

Not Paid
70

Collected this month
9,250,000 IQD
```

---

# Phase 6 — Joosa v0.1 Release

## Definition of Done

v0.1 is done only when this full scenario works:

```text
Open App
→ Add Subscriber
→ Search Subscriber
→ Open Subscriber
→ Register Payment
→ Dashboard Updates
→ Close App
→ Reopen App
→ Data Still Exists
```

Test with:

- [ ] 10 subscribers.
- [ ] 100 subscribers.
- [ ] Repeated searches.
- [ ] Multiple payments.
- [ ] App restart.
- [ ] Device restart.
- [ ] No internet.
- [ ] Arabic text.
- [ ] Small and large Android screens.

Deliverables:

- [ ] Working APK.
- [ ] Source code.
- [ ] README.
- [ ] Basic test data.
- [ ] Version tag v0.1.0.

---

# Phase 7 — Real User Validation

## Goal
Test with real generator owners before adding features.

Start with 3–10 real users.

Observe, do not over-explain.

Ask them to:

1. Add 10 subscribers.
2. Search for a subscriber.
3. Register payments.
4. Check unpaid subscribers.

Track:

- Confusing screens.
- Too many taps.
- Missing information.
- Wrong terminology.
- Data entry friction.
- Common repeated feature requests.

Feature rule:

A feature request becomes high priority when multiple real users independently need it.

---

# Phase 8 — Joosa v0.2

Possible additions after validation:

- [ ] Edit subscriber.
- [ ] Disable subscriber.
- [ ] Previous payment history.
- [ ] Monthly history.
- [ ] Unpaid filter.
- [ ] Paid filter.
- [ ] Previous debt field if validated.
- [ ] Local backup/export.
- [ ] Better Arabic UX.

Still avoid:
- AI.
- IoT.
- Complex accounting.
- Online payments.
- Multi-generator complexity.

---

# Phase 9 — Backend Foundation

## Start only after local MVP is validated.

Recommended stack:

- Django.
- Django REST Framework.
- PostgreSQL.
- JWT authentication later.
- Docker.

Suggested backend structure:

```text
backend/
├── accounts/
├── organizations/
├── generators/
├── subscribers/
├── payments/
└── common/
```

Do NOT start with microservices.

Use a modular monolith.

---

# Phase 10 — Multi-Tenant Design

## Goal
Safely support many generator businesses.

Core hierarchy:

```text
Organization
    ↓
Generator
    ↓
Subscribers
    ↓
Payments
```

Rules:

- [ ] Every business-owned record belongs to an organization/tenant.
- [ ] Tenant isolation must be enforced server-side.
- [ ] Never trust organization_id sent by client without permission checks.
- [ ] Add tenant-aware indexes.
- [ ] Test that Tenant A cannot access Tenant B data.

---

# Phase 11 — Authentication

Add only when backend exists.

Initial version:

- Phone/email.
- Password.
- Access token.
- Refresh token.
- Logout.
- Secure local token storage.

Later:
- OTP.
- MFA if required.
- Device management.

---

# Phase 12 — Offline Cloud Sync

## Goal
Keep offline-first UX while introducing cloud storage.

Target design:

```text
                   Local DB
                  ↗
Flutter → Repository
                  ↘
                   Django API
```

Each syncable record should eventually include:

```text
id
created_at
updated_at
sync_status
```

Possible states:

```text
synced
pending
failed
```

Requirements:

- [ ] App remains usable without internet.
- [ ] Local writes queue for sync.
- [ ] Sync retries safely.
- [ ] Define conflict policy explicitly.
- [ ] No duplicate payments caused by retries.
- [ ] Use idempotency for critical financial writes.

---

# Phase 13 — 10 to 100 Real Users

Add production observability:

- [ ] Crash reporting.
- [ ] Analytics.
- [ ] Error reporting.
- [ ] API logs.
- [ ] Backup policy.
- [ ] Onboarding.
- [ ] Forgot password.
- [ ] Privacy policy.
- [ ] Terms if required.

Track:

- Active users.
- Subscribers per organization.
- Payment operations.
- API errors.
- Sync failures.
- Retention.

---

# Phase 14 — Joosa v1.0

Only after core usage is stable.

Candidate features:

- Expenses.
- Debts.
- Receipts.
- PDF receipt.
- QR verification.
- Collectors.
- Roles & permissions.

Possible roles:

```text
Owner
Manager
Collector
```

---

# Phase 15 — Notification Architecture

The app should depend on:

```text
NotificationService
```

not directly on a specific vendor.

Possible implementation:

- Firebase Cloud Messaging.

Use cases:

- Subscription reminder.
- Payment confirmation.
- System announcement.
- Admin notice.

---

# Phase 16 — Ads Architecture

Do not hard-code ads into business logic.

Use:

```text
AdsService
```

Possible model:

```text
Free Plan → Ads
Paid Plan → No Ads
```

Rules:

- Never interrupt payment confirmation with an ad.
- Never place deceptive ads near financial buttons.
- Ads must be removable by configuration.
- App core must work without ad SDK availability.

---

# Phase 17 — 1,000 Users

Infrastructure candidates:

- Docker.
- HTTPS.
- Reverse proxy / managed load balancer.
- Redis.
- Celery/background workers.
- PostgreSQL backups.
- Object storage.

Background jobs:

- Notifications.
- Reports.
- Bulk monthly actions.
- Imports/exports.

Do not execute heavy jobs inside synchronous API requests.

---

# Phase 18 — Database Performance

Add indexes based on actual query patterns.

Likely indexes:

```text
organization_id
subscriber_id
phone
month
year
created_at
updated_at
```

Requirements:

- Pagination everywhere large lists are possible.
- No endpoint should return tens of thousands of subscribers in one response.
- Inspect slow queries.
- Prevent N+1 query patterns.
- Use database constraints for important invariants.

---

# Phase 19 — Security Baseline

- [ ] HTTPS only in production.
- [ ] Secure password hashing.
- [ ] Rate limiting.
- [ ] Input validation.
- [ ] Server-side authorization.
- [ ] Tenant isolation.
- [ ] Audit important financial actions.
- [ ] Environment variables for secrets.
- [ ] No secrets in Git.
- [ ] Dependency security updates.
- [ ] Database backups.
- [ ] Restore testing.

---

# Phase 20 — 5,000 Users

Scale horizontally only when metrics require it.

Possible architecture:

```text
                 Load Balancer
                 /     |      \
                /      |       \
          Django 1  Django 2  Django 3
                \      |       /
                 \     |      /
                     Redis
                       |
                  PostgreSQL
```

Backend should be stateless where practical.

Monitor:

- CPU.
- RAM.
- DB connections.
- Query latency.
- API p95.
- API p99.
- Error rate.
- Requests/sec.
- Cache hit rate.

---

# Phase 21 — Load Testing

Use k6 or equivalent.

Do not claim "supports 10,000 concurrent users" before testing.

Test gradually:

- [ ] 100 concurrent users.
- [ ] 500.
- [ ] 1,000.
- [ ] 2,500.
- [ ] 5,000.
- [ ] 7,500.
- [ ] 10,000.

After every stage:

1. Identify bottleneck.
2. Fix bottleneck.
3. Repeat test.
4. Record results.

Initial target for common operations:

```text
p95 < 500 ms
error rate < 1%
```

Targets may be revised using real production requirements.

---

# Phase 22 — 10,000 Concurrent Users

Only introduce advanced infrastructure if load tests prove the need.

Possible tools:

- PostgreSQL connection pooling.
- Additional API instances.
- Redis scaling.
- Read replicas.
- CDN.
- Autoscaling.
- Dedicated worker queues.
- More aggressive caching.
- Query optimization.
- Database tuning.

Avoid infrastructure complexity without evidence.

---

# Future Feature Backlog

Not MVP:

- WhatsApp integration.
- SMS.
- Bluetooth thermal printing.
- Expenses.
- Profit analytics.
- Debt aging.
- Receipt QR verification.
- Collectors.
- Advanced permissions.
- Multi-generator dashboard.
- Maintenance.
- Fuel tracking.
- Inventory.
- Customer app.
- Online payments.
- Payment score.
- Cash reconciliation.
- Advanced analytics.
- AI assistant.
- Smart meters.
- IoT.
- Predictive maintenance.

---

# Milestones Summary

## M0 — Foundation
Flutter structure + local DB.

## M1 — Joosa v0.1
Subscribers + payments + dashboard.

## M2 — Validation
3–10 real generator owners.

## M3 — Joosa v0.2
History + editing + basic backup.

## M4 — Cloud
Django + PostgreSQL + authentication + sync.

## M5 — Early Production
10–100 users.

## M6 — Joosa v1.0
Debts + receipts + collectors + permissions.

## M7 — Growth
1,000 users + Redis + workers + monitoring.

## M8 — Scale
5,000 users + horizontal scaling.

## M9 — Proven Scale
Load test and validate 10,000 concurrent users.

---

# Current Priority

STOP reading the long-term roadmap and execute only this list first:

1. Create Flutter project.
2. Create clean feature-based architecture.
3. Add Drift/SQLite.
4. Create Subscriber model.
5. Create Payment model.
6. Build Subscribers screen.
7. Build Add Subscriber.
8. Build Search.
9. Build Subscriber Details.
10. Build Register Payment.
11. Build Dashboard.
12. Generate APK.
13. Test offline.
14. Test with real generator owner.
15. Fix UX issues.

Only after these steps are stable should the project move to backend/cloud work.

---

# Success Definition

Joosa succeeds first when a real generator owner can use it faster than their notebook.

Joosa succeeds at scale only when measured load tests prove the backend can handle the required concurrency safely and consistently.
