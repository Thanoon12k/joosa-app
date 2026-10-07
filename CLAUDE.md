# CLAUDE.md — Joosa Development Instructions

This file contains mandatory development rules for any AI coding agent working on Joosa.

Project: Joosa (جوزة)  
Repository: Thanoon12k/joosa-app

Read `plan.md` before making architectural or feature decisions.

---

# 1. Mission

Build Joosa incrementally.

The current priority is NOT to build every future feature.

The first product must provide a reliable offline workflow for:

1. Subscriber management.
2. Search.
3. Monthly payment registration.
4. Current-month paid/unpaid state.
5. Minimal dashboard.

Do not add unrelated features unless explicitly requested.

---

# 2. Critical Rule: Do Not Overbuild

Never introduce infrastructure just because it may be useful later.

Do NOT add these during the local MVP unless explicitly requested:

- Django.
- PostgreSQL.
- Redis.
- Celery.
- Kubernetes.
- Microservices.
- Firebase.
- Ads SDK.
- Push notifications.
- AI.
- IoT.
- Smart meters.
- Online payment.
- Complex accounting.
- Multi-generator management.

Design extension points where reasonable, but do not implement unused complexity.

---

# 3. Flutter Architecture

Use feature-first modular architecture.

Preferred structure:

```text
lib/
├── app/
├── core/
└── features/
    ├── dashboard/
    ├── subscribers/
    ├── payments/
    └── settings/
```

Within larger features, use:

```text
data/
domain/
presentation/
```

Do not create pointless layers for tiny code. Keep architecture practical.

---

# 4. Dependency Direction

Presentation must not directly access Drift/SQLite.

Use:

```text
Presentation
    ↓
Repository
    ↓
Local Data Source
```

Later the repository may coordinate:

```text
Local Data Source
Remote Data Source
```

UI code should not care whether data comes from SQLite or API.

---

# 5. Local-First Rule

The MVP must work without internet.

Core operations must remain functional offline:

- View subscribers.
- Add subscriber.
- Search.
- Open subscriber.
- Register payment.
- View dashboard.

Do not require network connectivity for these actions in MVP.

---

# 6. IDs

Use UUIDs for business entities.

Examples:

- subscriber_id.
- payment_id.

Do not assume local auto-increment IDs will be globally unique.

This is necessary for future synchronization.

---

# 7. Time Handling

Store timestamps in a consistent machine-safe format.

Recommended:
- UTC internally.
- Convert to local time for display.

Month/year used for billing must be explicit.

Do not infer historical billing periods only from current device time.

---

# 8. Money Handling

Never use floating-point math for IQD amounts.

Use integer values representing Iraqi dinars.

Good:

```dart
final int amount = 50000;
```

Avoid:

```dart
double amount = 50000.0;
```

Financial calculations must be deterministic.

---

# 9. Payment Rules

A payment is a record, not just a boolean state.

Do NOT model payment only as:

```text
isPaid = true
```

Payment must preserve:

- ID.
- Subscriber.
- Amount.
- Month.
- Year.
- Paid timestamp.

Prevent duplicate submission where practical.

Future cloud payment APIs must support idempotency.

Once financial history becomes production data, never silently delete transactions. Use reversal/adjustment records.

---

# 10. Subscriber MVP Model

Keep the first model small.

Suggested fields:

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

Do not add dozens of speculative fields.

New fields should come from:
- explicit requirement, or
- validated user need.

---

# 11. Database Migrations

Database schema changes must use migrations.

Never solve a schema change by deleting the user's database.

User data preservation is mandatory.

Test migrations when schema changes.

---

# 12. Search

Search must feel immediate.

Support:

- Name.
- Phone.

Normalize values where useful.

Avoid loading extremely large lists into memory once cloud scale begins.

For local MVP with small datasets, keep implementation simple.

---

# 13. Arabic UX

Arabic is a primary UI language.

Requirements:

- RTL support.
- Clear Iraqi terminology.
- Proper number formatting.
- Avoid developer terminology in user-facing UI.
- Buttons should describe actions clearly.

Prefer simple terms generator owners understand.

---

# 14. UI Philosophy

The user may not be technical.

Optimize for:

- Few taps.
- Large clear actions.
- Clear status.
- Minimal forms.
- Easy search.
- Fast payment registration.

Do not build dense enterprise screens for MVP.

---

# 15. Dashboard

MVP dashboard contains only:

- Total subscribers.
- Paid this month.
- Not paid this month.
- Amount collected this month.

No chart libraries unless explicitly requested.

---

# 16. Future Service Boundaries

These abstractions may exist when useful:

```text
NotificationService
AdsService
AnalyticsService
StorageService
SyncService
```

However:

- Do not add real SDK integrations until required.
- Do not initialize heavy SDKs that are unused.
- Do not make the app depend on ads or notification providers.

---

# 17. Ads Rules

When ads are eventually added:

- Ads must be isolated behind AdsService.
- No ads inside payment confirmation.
- No ads near destructive/financial buttons.
- Core workflow must continue if ad provider fails.
- Paid plans should be able to disable ads centrally.

---

# 18. Notification Rules

When notifications are eventually added:

- Use NotificationService abstraction.
- Do not scatter Firebase calls through UI code.
- Notification payloads must not expose sensitive financial data unnecessarily.
- Navigation from notifications must be validated.

---

# 19. Backend Rules — Future Phase

When backend work is explicitly started:

Preferred stack:

- Django.
- Django REST Framework.
- PostgreSQL.
- Redis only when needed.
- Celery/background workers only when needed.

Use a modular monolith first.

Do NOT begin with microservices.

---

# 20. Backend Domain Boundaries

Suggested modules:

```text
accounts
organizations
generators
subscribers
payments
common
```

Add new modules only when real requirements exist.

---

# 21. Multi-Tenancy

Future cloud backend must be multi-tenant.

Every relevant business record must belong to an organization/tenant.

Tenant isolation must be enforced server-side.

Never trust a client-provided organization ID by itself.

Every sensitive query must be scoped to the authenticated user's allowed organization(s).

---

# 22. API Design

Future API rules:

- Version APIs.
- Validate all input.
- Use pagination.
- Avoid huge responses.
- Use consistent error format.
- Use idempotency for critical financial writes.
- Do not expose internal database implementation details.
- Authorize every tenant-scoped resource.

---

# 23. Cloud Sync

Future sync must preserve offline capability.

Possible sync states:

```text
synced
pending
failed
```

Sync operations must be retry-safe.

Never create duplicate financial records because the client retried after a timeout.

Conflict resolution policy must be explicit.

---

# 24. Performance

Do not prematurely optimize.

Measure first.

When cloud scale exists, monitor:

- p50 latency.
- p95 latency.
- p99 latency.
- error rate.
- DB query time.
- DB connections.
- requests/sec.
- CPU.
- RAM.

Use indexes based on real query patterns.

---

# 25. 10,000 Concurrent User Goal

"Supports 10,000 concurrent users" is a measured requirement, not a marketing assumption.

Before claiming this:

1. Build realistic k6 scenarios.
2. Test 100.
3. Test 500.
4. Test 1,000.
5. Test 2,500.
6. Test 5,000.
7. Test 7,500.
8. Test 10,000.
9. Fix bottlenecks between stages.
10. Save results.

Initial target for common operations:

```text
p95 < 500ms
error rate < 1%
```

Do not artificially cache incorrect/stale financial responses merely to pass a benchmark.

Correctness comes before benchmark numbers.

---

# 26. Security

Never:

- Commit secrets.
- Store plaintext passwords.
- Trust client permissions.
- Disable validation to "make it work".
- Log passwords/tokens.
- Put production credentials in Flutter source.
- Expose another tenant's data.

Use environment variables for server secrets.

Production traffic must use HTTPS.

---

# 27. Logging

Logs should help debugging without leaking secrets.

Never log:

- Passwords.
- Access tokens.
- Refresh tokens.
- Secret API keys.

Be careful with subscriber personal information.

---

# 28. Error Handling

Do not hide errors silently.

UI should provide understandable messages.

Internal errors should have enough technical context for debugging.

Avoid showing stack traces to end users.

---

# 29. Testing Expectations

For every important feature:

- Unit test business calculations where practical.
- Test repository behavior.
- Test database migrations.
- Test payment creation.
- Test dashboard calculations.
- Test search.
- Add integration tests for critical flows as project grows.

Critical flow:

```text
Add Subscriber
→ Find Subscriber
→ Register Payment
→ Dashboard Updates
```

must remain functional after every major change.

---

# 30. Code Quality

Before finishing a coding task:

1. Format code.
2. Run analyzer/linter.
3. Run relevant tests.
4. Fix introduced warnings.
5. Remove dead debug code.
6. Confirm no secrets were added.
7. Summarize changed files.

Do not leave the project knowingly broken.

---

# 31. Package Policy

Before adding a package:

Ask:

- Is it really needed?
- Is Flutter/Dart standard functionality enough?
- Is it maintained?
- Does it add significant binary size?
- Does it create vendor lock-in?
- Can it conflict with future offline architecture?

Avoid package bloat.

---

# 32. Refactoring Rule

Refactor when it improves current maintainability.

Do not rewrite working modules purely for stylistic preference.

Do not perform massive unrelated refactors during feature work.

Keep commits/tasks focused.

---

# 33. Git Rules

- Keep commits meaningful.
- Do not commit generated build artifacts.
- Do not commit secrets.
- Do not rewrite project history without explicit instruction.
- Do not delete user work without explicit instruction.
- Prefer small reviewable changes.

---

# 34. Scope Control

Before implementing a feature, classify it:

### Current MVP
Implement.

### Needed for architecture but no behavior yet
Create minimal interface/extension point only if useful.

### Future feature
Document it in plan.md. Do not implement.

Examples of future features:

- Expenses.
- Profit reports.
- Collector management.
- Maintenance.
- Fuel.
- Inventory.
- WhatsApp.
- SMS.
- Ads.
- Push notifications.
- Customer app.
- Online payment.
- AI.
- IoT.

---

# 35. Current Development Order

Unless the user explicitly changes priority, work in this order:

1. Flutter foundation.
2. App routing/theme.
3. Drift/SQLite.
4. Subscriber entity.
5. Payment entity.
6. Subscriber repository.
7. Subscribers list.
8. Add subscriber.
9. Search.
10. Subscriber details.
11. Register payment.
12. Dashboard.
13. Persistence tests.
14. Offline test.
15. APK build.
16. Real-user feedback.
17. v0.2 improvements.
18. Backend only after MVP validation.

---

# 36. Definition of Done for v0.1

Do not call v0.1 complete until:

- App installs.
- App opens without network.
- Subscriber can be created.
- Subscriber persists after restart.
- Search works.
- Monthly amount calculates correctly.
- Payment can be registered.
- Paid state is accurate.
- Dashboard updates correctly.
- Arabic UI is usable.
- No known data-loss bug exists.
- Android release build succeeds.

---

# 37. When Asked to Add a New Feature

Before coding:

1. Check whether it belongs to current milestone.
2. Inspect existing architecture.
3. Reuse current abstractions.
4. Avoid coupling unrelated features.
5. Add migrations if data model changes.
6. Preserve backward compatibility where possible.
7. Test the core payment flow afterward.

---

# 38. When Requirements Are Ambiguous

Prefer the smallest implementation consistent with the product goal.

Do not invent a large subsystem.

Document assumptions in code comments only when they are useful; avoid excessive comments.

---

# 39. Product North Star

The first success metric is:

> A generator owner can find a subscriber and register their monthly payment faster and more reliably than using a paper notebook.

The long-term scale metric is:

> Measured load tests demonstrate safe operation under the target concurrency without losing financial correctness.

---

# 40. Final Agent Rule

Never optimize Joosa for impressiveness.

Optimize it for:

- simplicity,
- reliability,
- financial correctness,
- offline usability,
- clean growth,
- and measured scalability.
