export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const blueprintWebhook = process.env.BLUEPRINT_N8N_WEBHOOK_URL;
  if (!blueprintWebhook) {
    return res.status(503).json({ error: 'Blueprint workflow is not configured yet' });
  }

  try {
    const response = await fetch(blueprintWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(req.body || {})
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Blueprint workflow unavailable' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(502).json({ error: 'Blueprint workflow unavailable' });
  }
}
