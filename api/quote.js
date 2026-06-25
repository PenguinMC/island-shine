// Vercel serverless function: receives a quote request and emails it via Resend.
// Required env var:  RESEND_API_KEY
// Optional env vars: TO_EMAILS   (comma-separated admin recipients; default hello@islandshines.com)
//                    FROM_EMAIL  (verified Resend sender; default onboarding@resend.dev)
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'Email not configured (missing RESEND_API_KEY)' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const esc = (v) => String(v == null ? '' : v).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const name = esc(body.name), phone = esc(body.phone), email = esc(body.email),
        address = esc(body.address), message = esc(body.message);
  const services = Array.isArray(body.services) ? body.services.map(esc).join(', ') : esc(body.services);

  if (!name && !phone && !email) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const to = (process.env.TO_EMAILS || 'hello@islandshines.com').split(',').map((s) => s.trim()).filter(Boolean);
  const from = process.env.FROM_EMAIL || 'Island Shine <onboarding@resend.dev>';

  const row = (label, val) => `<tr><td style="padding:8px 14px;font:600 12px/1.4 monospace;color:#46627a;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:8px 14px;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0d1b2a">${val || '<span style="color:#9db8cf">—</span>'}</td></tr>`;

  const html = `
  <div style="max-width:560px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,sans-serif;border:1px solid #d3e2ee;border-radius:14px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0d8bef,#0a63ad);color:#fff;padding:22px 24px">
      <div style="font:800 22px/1 'Arial Narrow',sans-serif;letter-spacing:.02em">ISLAND SHINE</div>
      <div style="font:600 12px/1.4 monospace;letter-spacing:.12em;opacity:.85;margin-top:4px">NEW QUOTE REQUEST</div>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#fff">
      ${row('Name', name)}
      ${row('Phone', phone ? `<a href="tel:${phone.replace(/[^0-9]/g,'')}" style="color:#0d8bef;text-decoration:none">${phone}</a>` : '')}
      ${row('Email', email ? `<a href="mailto:${email}" style="color:#0d8bef;text-decoration:none">${email}</a>` : '')}
      ${row('Address', address)}
      ${row('Services', services)}
      ${row('Details', message)}
    </table>
    <div style="background:#eef6fc;padding:12px 24px;font:12px/1.4 monospace;color:#46627a">Sent from islandshines.com</div>
  </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        reply_to: email || undefined,
        subject: `New quote request${name ? ' from ' + name : ''}`,
        html
      })
    });
    if (!r.ok) {
      const detail = await r.text();
      res.status(502).json({ error: 'Send failed', detail });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: String(err) });
  }
};
