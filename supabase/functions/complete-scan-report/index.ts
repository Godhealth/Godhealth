import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import {
  buildReportHtml,
  buildReportModel,
  type ReportLead,
  type ReportModel,
  type ScanAnswers,
} from "./report-template.ts";
import { buildFallbackPdf } from "./fallback-pdf.ts";

const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function env(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

function secretKey(): string {
  const current = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (current) {
    const keys = JSON.parse(current) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  throw new Error("Missing required server configuration: SUPABASE_SECRET_KEYS");
}

function publicKeys(): string[] {
  const keys: string[] = [];
  const current = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (current) {
    const parsed = JSON.parse(current) as Record<string, string>;
    keys.push(...Object.values(parsed));
  }
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) keys.push(legacy);
  return keys;
}

function corsHeaders(request: Request): HeadersInit {
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGIN") || "")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  const requestOrigin = request.headers.get("origin") || "";
  const allowedOrigin = allowedOrigins.includes(requestOrigin)
    ? requestOrigin
    : allowedOrigins[0] || requestOrigin || "*";
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function validateOrigin(request: Request): void {
  const allowedOrigins = (Deno.env.get("ALLOWED_ORIGIN") || "")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  if (!allowedOrigins.length) return;
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.includes(origin)) throw new Error("ORIGIN_NOT_ALLOWED");
}

function validatePublishableKey(request: Request): void {
  const accepted = publicKeys();
  if (!accepted.length) return;
  const key = request.headers.get("apikey") || "";
  if (!accepted.includes(key)) throw new Error("INVALID_PUBLIC_KEY");
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

function validatePayload(payload: unknown): { lead: ReportLead; answers: ScanAnswers } {
  if (!payload || typeof payload !== "object") throw new Error("INVALID_PAYLOAD");
  const source = payload as Record<string, unknown>;
  const leadInput = source.lead as Record<string, unknown> | undefined;
  const answers = source.answers as ScanAnswers | undefined;
  if (!leadInput || !answers || typeof answers !== "object") throw new Error("INVALID_PAYLOAD");

  const firstName = cleanText(leadInput.first_name, 80);
  const email = cleanText(leadInput.email, 254).toLowerCase();
  const consent = leadInput.scan_privacy_consent === true;
  if (!firstName || !EMAIL_PATTERN.test(email) || !consent) throw new Error("INVALID_LEAD");

  const requestedId = cleanText(leadInput.id, 40);
  if (!UUID_PATTERN.test(requestedId)) throw new Error("INVALID_LEAD");
  return {
    lead: {
      id: requestedId,
      first_name: firstName,
      email,
    },
    answers,
  };
}

async function renderPdf(html: string, traceId: string, model: ReportModel): Promise<Uint8Array> {
  const rendererUrl = Deno.env.get("PDF_RENDERER_URL")?.trim();
  if (!rendererUrl) return await buildFallbackPdf(model);
  const rendererToken = Deno.env.get("PDF_RENDERER_TOKEN")?.trim();
  const form = new FormData();
  form.append("files", new File([html], "index.html", { type: "text/html; charset=utf-8" }));
  form.append("printBackground", "true");
  form.append("preferCssPageSize", "true");
  form.append("generateTaggedPdf", "true");
  form.append("generateDocumentOutline", "true");
  form.append("metadata", JSON.stringify({
    Title: "Kingdom Vitality Report",
    Author: "GodHealth",
    Creator: "GodHealth Kingdom Vitality Scan",
    Subject: "Personal Body, Soul and Spirit Alignment Report",
  }));

  const headers = new Headers({
    "Gotenberg-Output-Filename": "kingdom-vitality-report",
    "Gotenberg-Trace": traceId,
  });
  if (rendererToken) headers.set("Authorization", `Bearer ${rendererToken}`);

  const response = await fetch(rendererUrl, {
    method: "POST",
    headers,
    body: form,
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) {
    const message = (await response.text()).slice(0, 500);
    throw new Error(`PDF renderer rejected the report (${response.status}): ${message}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 5 || bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error("PDF renderer returned an invalid file size.");
  }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new Error("PDF renderer did not return a PDF.");
  }
  return bytes;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(request) });
  }
  if (request.method !== "POST") return json(request, { error: "Method not allowed." }, 405);

  const requestId = crypto.randomUUID();
  try {
    validateOrigin(request);
    validatePublishableKey(request);

    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > MAX_REQUEST_BYTES) return json(request, { error: "Request too large." }, 413);

    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return json(request, { error: "Request too large." }, 413);
    }
    const payload = JSON.parse(raw);
    const { lead, answers } = validatePayload(payload);
    const model = buildReportModel(lead, answers);
    const reportHtml = buildReportHtml(model);
    const pdf = await renderPdf(reportHtml, requestId, model);

    const supabaseUrl = env("SUPABASE_URL");
    const supabase = createClient(supabaseUrl, secretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const bucket = Deno.env.get("REPORT_BUCKET")?.trim() || "scan-reports";
    const reportPath = `${lead.id}/kingdom-vitality-report.pdf`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(reportPath, pdf, {
        contentType: "application/pdf",
        cacheControl: "0",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const ttl = Math.max(
      900,
      Math.min(Number(Deno.env.get("REPORT_URL_TTL_SECONDS") || "604800"), 2_592_000),
    );
    const { data: signed, error: signedError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(reportPath, ttl, { download: "kingdom-vitality-report.pdf" });
    if (signedError || !signed?.signedUrl) {
      await supabase.storage.from(bucket).remove([reportPath]);
      throw signedError || new Error("Could not create the private report URL.");
    }

    const roadmap = model.plan.slice(0, 3).map((day) => {
      const primaryAction = day.actions[model.primaryKey];
      return `Day ${day.day}: ${primaryAction}`;
    });
    const { error: recordError } = await supabase.rpc("gh_complete_scan", {
      p_lead_id: lead.id,
      p_email: lead.email,
      p_body_score: model.scores.physical,
      p_soul_score: model.scores.mental,
      p_spirit_score: model.scores.spiritual,
      p_total_score: model.overall,
      p_alignment_gap: model.primaryName,
      p_roadmap_step_1: roadmap[0],
      p_roadmap_step_2: roadmap[1],
      p_roadmap_step_3: roadmap[2],
      p_report_pdf_url: signed.signedUrl,
      p_report_pdf_path: reportPath,
      p_scan_answers: answers,
    });
    if (recordError) {
      await supabase.storage.from(bucket).remove([reportPath]);
      throw recordError;
    }

    return json(request, { ok: true, lead_id: lead.id }, 200);
  } catch (error) {
    const internal = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ request_id: requestId, error: internal }));
    if (internal === "ORIGIN_NOT_ALLOWED") return json(request, { error: "Origin not allowed." }, 403);
    if (internal === "INVALID_PUBLIC_KEY") return json(request, { error: "Invalid public key." }, 401);
    if (internal.startsWith("INVALID_") || internal.startsWith("Missing required answer")) {
      return json(request, { error: "The scan submission is incomplete or invalid." }, 400);
    }
    return json(request, { error: "The report could not be generated." }, 500);
  }
});
