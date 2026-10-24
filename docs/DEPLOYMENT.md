# Deployment

## Option A: Cloudflare Workers + D1

This repository includes a Worker backend, D1 database schema and static frontend assets. Use Cloudflare's Free plan if you want to avoid a paid plan. Free quotas are finite and may change; no provider's permanent unlimited free hosting is guaranteed. Check current limits before your event:

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/

At preparation, Workers Free documents 100,000 requests/day; D1 Free documents 5 million rows read/day, 100,000 rows written/day and 5 GB total storage. Polling consumes requests. Forty players plus host at a two-second interval would generate about 73,800 requests/hour before actions and other traffic. Actual polling intervals vary by phase. This package allows up to 40 players; it is not a claim of tested 40-player capacity. For long/larger events use your own Node server or evaluate quotas beforehand.

1. Create/sign into a Cloudflare account. Install Node.js 24, extract the source, open a terminal in `Answer-Arena`.
2. Install and validate:

```sh
npm ci
npm run check
npx wrangler login
npx wrangler d1 create answer-arena-db
```

3. Copy the returned database UUID into `wrangler.jsonc`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`. Keep binding `DB` and database name `answer-arena-db`.
4. Initialize and publish:

```sh
npm run cf:migrate:remote
npm run cf:deploy
```

Wrangler prints your `https://answer-arena.<account-subdomain>.workers.dev` URL. Players use `/`; host uses `/host`. A custom domain is optional and may cost money.

5. To restrict creation of new rooms, set a secret:

```sh
npx wrangler secret put HOST_CREATE_KEY
```

Enter your chosen private creation password when prompted. Do not put it in GitHub. Enter it in the host creation form. Existing rooms still use their own generated recovery key.

6. Test with a host and at least two separate player browsers before inviting the team. Deploy updates with `npm run cf:deploy`; preserve the D1 database. There is no GitHub auto-deploy configured; Actions only validates source.

Local Worker development after setting the database ID:

```sh
npm run cf:migrate:local
npm run cf:dev
```

The Worker applies expired turns on the next authenticated poll/action. With connected players this is normally within the polling interval. If everyone disconnects, the timeout is applied when someone returns and the next player receives a fresh 45 seconds; unattended turns do not cascade. The Node backend instead sweeps deadlines every 500 ms. Both reject late answers based on server time. Hourly cleanup removes rooms after 24 hours.

## Option B: your own Node server

Run `npm ci`, `npm run check`, then `npm start`. Keep Node running and store `data/` on persistent disk. For internet hosting use an HTTPS reverse proxy, set `PUBLIC_ORIGIN` to your public origin, and apply normal server maintenance. Open-source modules cost nothing; a rented server/domain may cost money.

A Dockerfile is included as an alternative (not executed in this verification):

```sh
docker build -t answer-arena .
docker volume create arena-data
docker run --rm -p 3000:3000 -v arena-data:/data -e HOST_CREATE_KEY=YOUR-PRIVATE-PASSWORD answer-arena
```

Do not paste a real password into a shared command log. Use a private environment file in practice. Inspect the Dockerfile and adapt UID/volume ownership if your platform requires it.

## Troubleshooting

- Blank/unavailable production page: run `npm run build` before `npm start`.
- `node:sqlite`/TypeScript startup failure: verify `node --version` is 24.x. Node may print an experimental SQLite warning; it is not a test failure.
- Player invite points to localhost: open the host through the public or LAN address before copying its invite.
- Cloudflare database errors: check the UUID, `DB` binding and remote migration command.
- Cross-origin request error behind proxy: set the correct `PUBLIC_ORIGIN`, including HTTPS and any port.
- Lost host session: use the room code and private recovery key. Player links cannot restore host privileges.
- Free quota exhausted: wait for reset or use another deployment; do not upgrade if you intend to remain free.
