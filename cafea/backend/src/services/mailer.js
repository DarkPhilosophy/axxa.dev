import nodemailer from 'nodemailer';
import { config } from '../config.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let transport = null;
function getTransport() {
  if (transport) return transport;
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) return null;
  transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: { user: config.smtpUser, pass: config.smtpPass }
  });
  return transport;
}

function isValidEmail(email) {
  return EMAIL_RE.test(String(email || '').trim().toLowerCase());
}

function formatFrom() {
  const name = String(config.mailFromName || 'Cafea Office').replace(/"/g, '');
  return `${name} <${config.mailFrom}>`;
}

function buildCoffeeTemplate({
  actorName,
  actorEmail,
  actorAvatarUrl,
  consumedAt,
  stockInitial,
  stockCurrent,
  stockMin,
  stockExpectedCurrent,
  stockManualDelta,
  actorConsumedCount,
  actorRemaining
}) {
  const when = consumedAt ? new Date(`${consumedAt}Z`).toLocaleString('ro-RO') : new Date().toLocaleString('ro-RO');
  const delta = Number(stockManualDelta || 0);
  const deltaLabel = delta === 0 ? '0 (fara ajustare)' : `${delta > 0 ? '+' : ''}${delta} (${delta > 0 ? 'surplus' : 'deficit'})`;
  const remainingLabel = actorRemaining == null ? 'nelimitat' : String(actorRemaining);
  const text =
    `Cafea Office - consum nou inregistrat\n` +
    `Consumator: ${actorName} (${actorEmail})\n` +
    `Data: ${when}\n` +
    `Stoc curent: ${stockCurrent}\n` +
    `Stoc real (initial - consum total): ${stockExpectedCurrent}\n` +
    `Ajustare manuala stoc: ${deltaLabel}\n` +
    `Stoc initial: ${stockInitial}\n` +
    `Stoc minim: ${stockMin}\n` +
    `Consum total utilizator: ${actorConsumedCount}\n` +
    `Cafele ramase utilizator: ${remainingLabel}\n`;

  const html = `
    <div style="background:#020617;padding:24px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e2e8f0">
      <div style="max-width:640px;margin:0 auto;background:#0f172a;border:1px solid #1e293b;border-radius:14px;overflow:hidden">
        <div style="padding:16px 20px;background:#052e1e;border-bottom:1px solid #134e4a">
          <h1 style="margin:0;font-size:20px;color:#34d399;">Cafea Office</h1>
          <p style="margin:4px 0 0 0;color:#a7f3d0;">Consum nou inregistrat</p>
        </div>
        <div style="padding:20px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <img src="${actorAvatarUrl || 'https://placehold.co/72x72?text=U'}" alt="avatar" width="54" height="54" style="border-radius:999px;object-fit:cover;border:2px solid #334155" />
            <div>
              <p style="margin:0;color:#f8fafc;font-weight:700">${actorName}</p>
              <p style="margin:2px 0 0 0;color:#94a3b8;font-size:13px">${actorEmail}</p>
            </div>
          </div>
          <p style="margin:0 0 12px 0;color:#cbd5e1;"><strong>Data:</strong> ${when}</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Stoc curent</td><td style="padding:8px;border-bottom:1px solid #1e293b;color:#f8fafc;text-align:right">${stockCurrent}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Stoc real</td><td style="padding:8px;border-bottom:1px solid #1e293b;color:#f8fafc;text-align:right">${stockExpectedCurrent}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Ajustare manuala</td><td style="padding:8px;border-bottom:1px solid #1e293b;color:${delta>0?'#22c55e':delta<0?'#ef4444':'#cbd5e1'};text-align:right">${deltaLabel}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Stoc initial / minim</td><td style="padding:8px;border-bottom:1px solid #1e293b;color:#f8fafc;text-align:right">${stockInitial} / ${stockMin}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #1e293b;color:#94a3b8;">Consum total utilizator</td><td style="padding:8px;border-bottom:1px solid #1e293b;color:#f8fafc;text-align:right">${actorConsumedCount}</td></tr>
            <tr><td style="padding:8px;color:#94a3b8;">Cafele ramase utilizator</td><td style="padding:8px;color:#f8fafc;text-align:right">${remainingLabel}</td></tr>
          </table>
        </div>
      </div>
    </div>
  `;
  return { text, html };
}

export async function notifyCoffeeConsumed({
  actorName, actorEmail, actorAvatarUrl, recipients, consumedAt,
  stockInitial, stockCurrent, stockMin, stockExpectedCurrent, stockManualDelta,
  actorConsumedCount, actorRemaining
}) {
  const tx = getTransport();
  if (!tx) return { sent: 0, skipped: recipients?.length || 0, reason: 'smtp_not_configured' };

  const validRecipients = (recipients || [])
    .filter((r) => Number(r.notify_enabled ?? 1) === 1)
    .map((r) => ({ email: String(r.email || '').trim().toLowerCase(), name: String(r.name || '').trim() }))
    .filter((r) => isValidEmail(r.email));
  if (!validRecipients.length) return { sent: 0, skipped: recipients?.length || 0, reason: 'no_valid_recipients' };

  const subject = 'Cafea Office: consum nou inregistrat';
  const { text, html } = buildCoffeeTemplate({
    actorName, actorEmail, actorAvatarUrl, consumedAt,
    stockInitial, stockCurrent, stockMin, stockExpectedCurrent, stockManualDelta,
    actorConsumedCount, actorRemaining
  });

  let sent = 0;
  for (const r of validRecipients) {
    await tx.sendMail({
      from: formatFrom(),
      to: r.email,
      subject,
      text,
      html
    });
    sent += 1;
  }
  return { sent, skipped: (recipients?.length || 0) - sent };
}

export async function sendCoffeeTestEmail({ to, actorName, actorEmail, actorAvatarUrl, consumedAt, stockInitial, stockCurrent, stockMin, stockExpectedCurrent, stockManualDelta, actorConsumedCount, actorRemaining }) {
  const tx = getTransport();
  if (!tx) throw new Error('SMTP not configured');
  if (!isValidEmail(to)) throw new Error('Invalid destination email');

  const { text, html } = buildCoffeeTemplate({
    actorName, actorEmail, actorAvatarUrl, consumedAt,
    stockInitial, stockCurrent, stockMin, stockExpectedCurrent, stockManualDelta,
    actorConsumedCount, actorRemaining
  });
  await tx.sendMail({
    from: formatFrom(),
    to,
    subject: 'Cafea Office: email test notificare',
    text,
    html
  });
  return { ok: true };
}
