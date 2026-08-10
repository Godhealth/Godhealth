import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type BlueprintLead = {
  id: string;
  first_name: string;
  email: string;
  newsletter_consent: boolean;
  consent_timestamp: string | null;
  source: "popup" | "section";
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json();
    const lead = (payload.record || payload.new || payload) as BlueprintLead;

    /*
     * TODO: Connect this function to the blueprint_leads insert event.
     * TODO: Send the GodHealth 7-Day Transformation Blueprint PDF link to lead.email.
     * TODO: Add the lead to the marketing list ONLY when lead.newsletter_consent === true.
     *
     * Consent rule:
     * - newsletter_consent false: send only the Blueprint delivery email.
     * - newsletter_consent true: send the Blueprint delivery email and add to GodHealth Insider.
     *
     * Keep email API keys as Supabase Edge Function secrets.
     * Never expose email service keys in frontend code.
     */

    console.log("Blueprint lead received", {
      id: lead.id,
      email: lead.email,
      source: lead.source,
      newsletter_consent: lead.newsletter_consent,
      consent_timestamp: lead.consent_timestamp
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Blueprint email stub failed", error);
    return Response.json({ ok: false }, { status: 400 });
  }
});
