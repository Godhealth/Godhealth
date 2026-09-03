import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type AdminClient = ReturnType<typeof createClient>;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: CORS_HEADERS,
  });
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function findUserByEmail(admin: AdminClient, email: string) {
  const perPage = 200;

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = (data.users || []).find((user) => {
      return String(user.email || "").toLowerCase() === email;
    });

    if (found) return found;
    if (!data.users || data.users.length < perPage) return null;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return json({ ok: false, message: "Method not allowed." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json(
      {
        ok: false,
        message:
          "Supabase function is missing required environment variables. Check SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.",
      }
    );
  }

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ ok: false, message: "Coach login is required. Sign out, sign in again, then invite the client." });
  }

  const coachClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await coachClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ ok: false, message: "Coach login could not be verified. Sign out, sign in again, then invite the client." });
  }

  const coachUser = userData.user;
  const { data: coach, error: coachError } = await admin
    .from("kca_coaches")
    .select("user_id, role")
    .eq("user_id", coachUser.id)
    .maybeSingle();

  if (coachError) {
    return json({ ok: false, message: coachError.message });
  }

  if (!coach) {
    return json({ ok: false, message: "This account is not enabled as a GodHealth coach." });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch (_error) {
    return json({ ok: false, message: "Invalid request body." });
  }

  const email = normalizeEmail(payload.email);
  const assessmentVersion = String(payload.assessment_version || "3.0.0").trim() || "3.0.0";
  const redirectTo =
    String(payload.redirect_to || "").trim() ||
    "https://www.godhealth.org/kingdom-capacity-assessment/";

  if (!isValidEmail(email)) {
    return json({ ok: false, message: "Enter a valid client email address." });
  }

  try {
    let clientUser = await findUserByEmail(admin, email);

    if (!clientUser) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          source: "godhealth_kca_coach_invite",
          assessment_version: assessmentVersion,
        },
      });

      if (createError) throw createError;
      clientUser = created.user;
    }

    if (!clientUser) {
      return json({ ok: false, message: "Client account could not be created." });
    }

    const { error: entitlementError } = await admin
      .from("kca_client_entitlements")
      .upsert(
        {
          user_id: clientUser.id,
          assessment_version: assessmentVersion,
          status: "active",
          starts_at: new Date().toISOString(),
          expires_at: null,
          revoked_at: null,
          created_by: coachUser.id,
        },
        { onConflict: "user_id,assessment_version" },
      );

    if (entitlementError) throw entitlementError;

    const { error: assignmentError } = await admin
      .from("kca_coach_assignments")
      .upsert(
        {
          coach_user_id: coachUser.id,
          client_user_id: clientUser.id,
        },
        { onConflict: "coach_user_id,client_user_id" },
      );

    if (assignmentError) throw assignmentError;

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (linkError) throw linkError;

    await admin.from("kca_audit_events").insert({
      user_id: coachUser.id,
      event_type: "coach_invited_client_access",
      metadata: {
        client_user_id: clientUser.id,
        client_email: email,
        assessment_version: assessmentVersion,
        redirect_to: redirectTo,
        generated_secure_link: Boolean(linkData.properties?.action_link),
      },
    });

    return json({
      ok: true,
      client_email: email,
      client_user_id: clientUser.id,
      assessment_version: assessmentVersion,
      action_link: linkData.properties?.action_link || "",
      message: "Client access is active.",
    });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Client access could not be created.",
      }
    );
  }
});
