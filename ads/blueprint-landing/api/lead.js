export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch('https://godhealth.app.n8n.cloud/webhook/2a3fa0cd-62f8-4467-9948-817589483072', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(req.body || {})
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Lead workflow unavailable' });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(502).json({ error: 'Lead workflow unavailable' });
  }
}
