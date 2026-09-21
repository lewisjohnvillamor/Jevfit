# Jev Resume Fit

Compare a PDF resume with a job posting using the Jev API. Results include an overall match, competency scores, matched requirements, missing or unclear requirements, and supporting resume excerpts.

## Privacy and keys

- Resume text is extracted in the browser.
- The API route is stateless and does not write resumes, job descriptions, results or API keys to a database or filesystem.
- Hosted deployments may set `TYPESAFE_API_KEY` as a server-side secret.
- Users may instead bring their own key (BYOK). The browser keeps it only in React memory for the current tab and sends it in the `x-jev-api-key` request header.
- Never put a real key in source code, Docker build arguments, tracked config files or `NEXT_PUBLIC_*` variables.

Copy `config.example.env` to an ignored local environment file or configure the values in your deployment platform.

## Flood and cleanup controls

The analyzer applies:

- a 120 KB request limit;
- six analyses per client per minute;
- two concurrent analyses per client;
- eight concurrent analyses per application instance;
- 15-second job-page and 60-second Jev API timeouts;
- bounded in-memory rate-limit records with automatic expiry and a 5,000-client cap;
- input truncation before upstream processing;
- `Cache-Control: no-store` on analysis and health responses.

Because the service is stateless, there are no uploaded files, analysis records or background jobs to purge. Container restarts clear the temporary in-memory limit table. For multiple replicas, add a Cloudflare/Coolify edge rate limit or shared Redis limiter in front of `/api/analyze`.

## Local development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vinext. A server key is optional when using BYOK.

## Production build

```bash
pnpm build
PORT=3000 pnpm start
```

Health check: `GET /api/health`.

## Coolify

1. Create an application from this repository and select Dockerfile deployment.
2. Expose container port `3000`.
3. Set `TYPESAFE_API_KEY` as a runtime secret (optional when operating BYOK-only).
4. Set the health-check path to `/api/health`.
5. Do not expose the key as a build argument or a `NEXT_PUBLIC_*` value.
