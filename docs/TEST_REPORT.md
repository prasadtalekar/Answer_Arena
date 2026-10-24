# Verification report — 24 October 2026

## Automated checks passed

`npm run check`: TypeScript check, **46 tests passed / 0 failed / 0 skipped**, and Vite production build passed on Node.js 24.22.1.

Coverage includes:

- Immediate first-opening answer reveal in both host and opposing-player API views; live scores update and points are not counted twice.
- Hidden answer protection, answer alternatives and rejection of duplicate revealed answers.
- Exact 45-second deadline, rejection of late typed/spoken answers, pause during host review, refresh retaining deadline, host override starting a fresh turn, round-end cancellation.
- Timeout moving to next teammate; three misses transferring control; opening timeout moving to the other opener; two opening misses reopening the designated buzzer pair.
- Concurrent polling applying a timeout once, concurrent buzz attempts selecting one winner, stale state/turn rejection, retry idempotency.
- Host-only controls, session authentication, optional host creation password, cross-origin write rejection, room expiry.
- All 15 rounds, player rotation and roster numbering; live scoring, wipeouts and designated double-wipeout rounds; early settlement and score adjustment.
- Actual Node HTTP server: room creation and recovery after database/server restart; server source and unknown API paths unavailable over HTTP.

`npx wrangler deploy --dry-run --outdir .test-build/worker`: Worker bundle and static asset preparation passed. No deployment occurred.

## Browser checks

Local development preview opened in Chrome with one host and two separately joined player tabs. Verified host creation, player join, equal-team start, buzzer entry, visible countdown, answer submission pausing timer, host approval, and immediate reveal/50-point score on the opposing player's screen before that player answered. Also observed the second opener time out automatically, record an opening miss and transfer control to Team A while preserving the revealed answer. Visually inspected the dark player layout: current round, team, player number and name at top; no round 1–15 strip.

## Limits of this verification

This is a defined test suite, not a guarantee that every possible case is covered. No public Cloudflare deployment, live D1 integration, Docker execution, 40-player load test, mobile-device matrix or real-world network latency rehearsal was performed. Run a short host/two-player rehearsal after deployment before the team event. Browser state can lag a server change by a polling interval; the server deadline is authoritative. No claim of zero latency or unlimited free hosting is made.

## Re-run

```sh
npm ci
npm run check
```

GitHub Actions runs the same checks on pushes and pull requests. Tests use isolated temporary/in-memory databases and do not touch production rooms.
