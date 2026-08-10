# GodHealth

GodHealth website, Kingdom Vitality Scan and secure Supabase lead workflows.

## Supabase deployment

Apply the migration in `supabase/migrations`, then deploy the
`complete-scan-report` Edge Function. The browser contains only the Supabase
project URL and publishable key. Database tables remain private behind
security-definer RPC functions.

Configure these server-side Edge Function secrets:

- `SUPABASE_SECRET_KEYS` — backend secret-key map containing `default`
- `PDF_RENDERER_URL` — optional private Gotenberg Chromium HTML-to-PDF endpoint;
  when omitted, the Edge Function uses the built-in premium PDF renderer
- `PDF_RENDERER_TOKEN` — optional renderer bearer token
- `ALLOWED_ORIGIN` — comma-separated production origins
- `REPORT_BUCKET=scan-reports`
- `REPORT_URL_TTL_SECONDS=604800`

Never add backend secret keys, external API bearer tokens or n8n webhook URLs
to frontend files. n8n should consume unprocessed rows in `lead_events`.

## GodHealth 7-Day Transformation Blueprint setup

The homepage, coaching page and tribe page include the free Blueprint lead
magnet popup. The homepage also includes the inline Blueprint section before
the Tribe preview.

Setup steps:

1. Run `supabase/migrations/202608100001_blueprint_leads.sql` in Supabase.
2. Confirm the public Supabase URL and anon/publishable key in
   `godhealth-config.js`.
3. Deploy the `send-blueprint-email` Edge Function or connect a Supabase
   Database Webhook on `blueprint_leads` insert.
4. In the email function/webhook, send the Blueprint PDF link to every lead.
5. Add leads to the marketing list only when `newsletter_consent` is `true`.

The frontend uses only the public anon/publishable key. Keep all email service
keys and webhook secrets server-side.
