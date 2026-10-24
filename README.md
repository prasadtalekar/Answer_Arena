# Answer Arena — standalone edition

Two-team multiplayer quiz game. React + Tailwind interface; TypeScript game engine; Node.js 24 + SQLite backend. Optional Cloudflare Workers + D1 deployment. No ChatGPT account, OpenAI API, paid API key or proprietary game service is required to play this edition.

## Changes in this package

- The first correct opening answer is revealed to every player as soon as the host approves it. Its points appear immediately beside the team name. The second opener must give a different, unrevealed answer.
- Each answering turn lasts 45 seconds, including the opening faceoff. The server enforces the deadline. An answer submitted on time pauses the clock while the host judges it.
- During normal play, timeout counts as a miss and moves control to the next teammate. The third miss transfers control to the other team.
- During the opening faceoff, timeout counts as that opener's miss and passes the answering opportunity to the other opener. If both miss, the same designated pair buzz again.
- Existing dark design, 15 rounds, 20-question bank, aliases, live scores, round-robin buzzer eligibility, host override and double-wipeout rounds are retained.

The existing ChatGPT-hosted game is not changed by this ZIP. Existing rooms/sessions are not migrated.

## Start on your computer

Install **Node.js 24.x** from https://nodejs.org/. Other major versions have not been validated. On Windows without administrator rights, the official Windows ZIP distribution can be extracted into your user folder and added to your user PATH if your company permits it.

Extract this ZIP. Open a terminal inside `Answer-Arena` (the folder containing `package.json`):

```sh
npm ci
npm run check
npm start
```

If PowerShell blocks `npm.ps1`, use `npm.cmd` instead of `npm` in each command.

- Host: http://localhost:3000/host
- Players on this computer: http://localhost:3000/
- Players on the same network: use your computer's LAN IP, e.g. `http://192.168.1.10:3000/`. Open the host page using that address before copying the player invite, so the invite does not contain `localhost`. Network/firewall policy must allow the connection. Keep the server running.
- For internet play, follow [Cloudflare deployment](docs/DEPLOYMENT.md).

## Play

1. Host opens `/host` and creates a game. Keep the private recovery key displayed by the host UI.
2. Share only the **player invite**. Players enter their names; teams and player numbers are assigned.
3. Set the questions/team names in the lobby and start. The designated player in each team sees the buzzer. For four players per team, player 1 returns in round 5.
4. The first buzzer wins the opening answering opportunity. Submit an answer within 45 seconds (or the host records a spoken answer in time). The host approves a matching board answer or counts a miss.
5. After both opening opportunities are resolved, the better answer establishes control. Team turns then rotate; the host can override the selected player.
6. The clock pauses for host judgment, not for typing. Refreshing does not reset it. Unsubmitted spoken answers are not automatically recognized.

Host and player sessions are separate. The player page has no host link or host controls. Knowing `/host` alone does not grant control of an existing game: the secret recovery key is required. To restrict who may create new games, configure `HOST_CREATE_KEY` as described below.

## Configuration and development

```sh
npm run dev
```

This starts the API on port 3000 and Vite on port 5173. Use port 5173 for development. Production uses `npm run build` followed by `npm start` on port 3000.

Optional variables are documented in `.env.example`. To use a local `.env`, copy that example and run:

```sh
node --env-file=.env server/node.ts
```

`npm start` does not automatically read `.env`. `HOST_CREATE_KEY` restricts room creation; it is separate from each room's recovery key. Behind an HTTPS reverse proxy set `PUBLIC_ORIGIN` to the exact public origin. SQLite data lives in `data/arena.sqlite`; preserve the data directory when restarting/upgrading. Rooms expire after 24 hours. This is a single Node instance design, not a multi-instance shared-file deployment.

## GitHub upload

Create an empty GitHub repository. Upload the **contents** of `Answer-Arena`, preserving folders, including `.github`, `.gitignore`, `.nvmrc` and `.env.example`. Do not upload the ZIP as the only repository file. Alternatively, from the extracted folder:

```sh
git init
git add .
git commit -m "Add standalone Answer Arena with timed turns"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/Answer-Arena.git
git push -u origin main
```

Dependencies, local databases, secrets and build output are excluded from this ZIP and `.gitignore`. GitHub Actions runs type checking, tests and a production build. GitHub Pages alone cannot run the multiplayer backend.

## Verification and limits

See [test report](docs/TEST_REPORT.md), [deployment instructions](docs/DEPLOYMENT.md), and [dependency notices](docs/DEPENDENCIES.md). Automated tests cover game rules, timers, API access and concurrency, and persistence. Public deployment and a real multi-device/load rehearsal remain to be performed on your hosting account.
