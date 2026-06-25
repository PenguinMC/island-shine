// Vercel serverless function: emails a quote request via Resend.
// Sends TWO emails: admin notification (full details) + customer confirmation.
// Env: islandshine / RESEND_API_KEY (required), TO_EMAILS (optional), FROM_EMAIL (optional)
const ADMINS_DEFAULT = 'stwparker55@gmail.com,alec.gunnels@gmail.com';

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const key = process.env.RESEND_API_KEY || process.env.ISLANDSHINE || process.env.islandshine || process.env.ISLAND_SHINE;
  if (!key) { res.status(500).json({ error: 'Email not configured (missing API key env var)' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  const esc = (v) => String(v == null ? '' : v).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const name = esc(body.name), phone = esc(body.phone), email = esc(body.email),
        address = esc(body.address), message = esc(body.message);
  const services = Array.isArray(body.services) ? body.services.map(esc).join(', ') : esc(body.services);

  if (!name && !phone && !email) { res.status(400).json({ error: 'Missing required fields' }); return; }

  const admins = (process.env.TO_EMAILS || ADMINS_DEFAULT).split(',').map((s) => s.trim()).filter(Boolean);
  const from = process.env.FROM_EMAIL || 'Island Shine <quotes@islandshines.com>';

  // include BOTH html and text (plain-text part greatly improves inbox placement)
  const send = (to, subject, html, text, replyTo) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, reply_to: replyTo || undefined, subject, html, text })
  });

  const shell = (badge, inner) => `
  <div style="max-width:560px;margin:0 auto;font-family:-apple-system,Segoe UI,Roboto,sans-serif;border:1px solid #d3e2ee;border-radius:14px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0d8bef,#0a63ad);color:#fff;padding:22px 24px">
      <div style="font:800 22px/1 'Arial Narrow',sans-serif;letter-spacing:.02em">ISLAND SHINE</div>
      <div style="font:600 12px/1.4 monospace;letter-spacing:.12em;opacity:.85;margin-top:4px">${badge}</div>
    </div>
    ${inner}
    <div style="background:#eef6fc;padding:12px 24px;font:12px/1.4 monospace;color:#46627a">islandshines.com &nbsp;&middot;&nbsp; (843) 730-3717</div>
  </div>`;

  // ---- Admin notification ----
  const row = (label, val) => `<tr><td style="padding:8px 14px;font:600 12px/1.4 monospace;color:#46627a;text-transform:uppercase;letter-spacing:.08em;white-space:nowrap;vertical-align:top">${label}</td><td style="padding:8px 14px;font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0d1b2a">${val || '<span style="color:#9db8cf">&mdash;</span>'}</td></tr>`;
  const adminHtml = shell('NEW QUOTE REQUEST', `
    <table style="width:100%;border-collapse:collapse;background:#fff">
      ${row('Name', name)}
      ${row('Phone', phone ? `<a href="tel:${phone.replace(/[^0-9]/g, '')}" style="color:#0d8bef;text-decoration:none">${phone}</a>` : '')}
      ${row('Email', email ? `<a href="mailto:${email}" style="color:#0d8bef;text-decoration:none">${email}</a>` : '')}
      ${row('Address', address)}
      ${row('Services', services)}
      ${row('Details', message)}
    </table>`);
  const adminText =
`NEW QUOTE REQUEST - Island Shine

Name: ${body.name || '-'}
Phone: ${body.phone || '-'}
Email: ${body.email || '-'}
Address: ${body.address || '-'}
Services: ${Array.isArray(body.services) ? body.services.join(', ') : (body.services || '-')}
Details: ${body.message || '-'}

islandshines.com`;

  // ---- Customer confirmation ----
  const customerHtml = shell('QUOTE RECEIVED', `
    <div style="background:#fff;padding:26px 24px;color:#0d1b2a">
      <p style="font:600 20px/1.3 'Arial Narrow',sans-serif;margin:0 0 12px">Hi ${name || 'there'}, we got your quote.</p>
      <p style="font:16px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;margin:0 0 16px;color:#46627a">Thanks for reaching out to Island Shine. <strong style="color:#0d1b2a">We'll be in touch within the hour</strong> with the next steps.</p>
      ${services ? `<p style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;margin:0 0 6px;color:#46627a">What you asked about: <strong style="color:#0d1b2a">${services}</strong></p>` : ''}
      ${address ? `<p style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;margin:0 0 16px;color:#46627a">Property: <strong style="color:#0d1b2a">${address}</strong></p>` : ''}
      <p style="font:15px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;margin:16px 0 0;color:#46627a">Need us sooner? Call or text <a href="tel:8437303717" style="color:#0d8bef;text-decoration:none;font-weight:700">(843) 730-3717</a>.</p>
    </div>`);
  const customerText =
`Hi ${body.name || 'there'}, we got your quote.

Thanks for reaching out to Island Shine. We'll be in touch within the hour with the next steps.
${services ? '\nWhat you asked about: ' + (Array.isArray(body.services) ? body.services.join(', ') : body.services) : ''}${body.address ? '\nProperty: ' + body.address : ''}

Need us sooner? Call or text (843) 730-3717.

Island Shine
islandshines.com`;

  try {
    const adminRes = await send(admins, `New quote request${name ? ' from ' + name : ''}`, adminHtml, adminText, email || undefined);
    if (!adminRes.ok) { res.status(502).json({ error: 'Admin send failed', detail: await adminRes.text() }); return; }

    if (email) {
      try { await send(email, 'We got your quote, Island Shine will be in touch', customerHtml, customerText, 'hello@islandshines.com'); } catch (e) {}
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error', detail: String(err) });
  }
};
