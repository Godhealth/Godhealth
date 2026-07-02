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
