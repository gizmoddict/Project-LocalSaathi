# Persistent job posts on Vercel

The Next.js API routes run as Vercel Functions. In-memory arrays are temporary and can disappear between invocations, so job create/list/publish operations use Prisma and PostgreSQL.

## Vercel environment variables

Connect a PostgreSQL provider that supports the PostGIS extension to the Vercel project. Configure these variables for every environment where jobs should work (Production and Preview):

- `DATABASE_URL`: the direct PostgreSQL connection string. Prisma CLI uses this for migrations and seeding.
- `DATABASE_URL_POOLED`: the provider's pooled connection string. Runtime Prisma requests use this in Vercel Functions; `DATABASE_URL` is the fallback.

For Prisma's Vercel Marketplace integration, connect the database to the project and use its direct `DATABASE_URL` plus pooled `DATABASE_URL_POOLED`. Redeploy after connecting the database or changing environment variables so the Functions receive them.

## Initialize the database once

Run these commands from the repository using the direct database URL in your shell environment:

```powershell
npm.cmd exec prisma migrate deploy
npm.cmd exec prisma db seed
```

The seed creates the demo employer account used by the bundled demo login. The schema migrations also require the PostGIS extension. Do not run the seed on every deployment; it adds demo fixture data.

After initialization and redeployment, create a job from `/employer/jobs/new`. Draft jobs appear in the employer's jobs list; published jobs also appear in public/worker job listings. Without a configured database, these API routes return HTTP 503 instead of reporting a false successful save.
