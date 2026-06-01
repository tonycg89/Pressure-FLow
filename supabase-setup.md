# Supabase Setup

Use this after creating the Supabase project.

## 1. Create the tables

In Supabase:

1. Open your project.
2. Go to SQL Editor.
3. Open `supabase-schema.sql` from this project.
4. Paste it into SQL Editor.
5. Run it.

This creates:

- `jobs`
- `app_settings`
- `integration_tokens`
- `webhook_events`

## 2. Get the database URL

In Supabase:

1. Go to Project Settings.
2. Open Database.
3. Find Connection string.
4. Use the URI connection string.
5. Replace `[YOUR-PASSWORD]` with the database password you created.

It will look similar to:

```text
postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres
```

In Render, save this as:

```text
DATABASE_URL
```

## 3. How PressureFlow chooses storage

Local desktop mode:

```text
DATABASE_URL is blank -> uses data/jobs.json
```

Production mode:

```text
DATABASE_URL is set -> uses Supabase Postgres
```

## 4. Important secret behavior

In production, Square and Google secrets should come from Render environment variables, not the database.

Use Render environment variables for:

- `SQUARE_ACCESS_TOKEN`
- `SQUARE_WEBHOOK_SIGNATURE_KEY`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `SESSION_SECRET`
- `ADMIN_PASSWORD`

