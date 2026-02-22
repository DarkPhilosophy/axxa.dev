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

export async function notifyCoffeeConsumed({ actorName, actorEmail, recipients, stockCurrent, stockInitial, stockMin, consumedAt }) {
  const tx = getTransport();
  if (!tx) return { sent: 0, skipped: recipients?.length || 0, reason: 'smtp_not_configured' };

  const validRecipients = (recipients || [])
    .filter((r) => Number(r.notify_enabled ?? 1) === 1)
    .map((r) => ({ email: String(r.email || '').trim().toLowerCase(), name: String(r.name || '').trim() }))
    .filter((r) => isValidEmail(r.email));
  if (!validRecipients.length) return { sent: 0, skipped: recipients?.length || 0, reason: 'no_valid_recipients' };

  const subject = 'Cafea Office: consum nou inregistrat';
  const when = consumedAt ? new Date(`${consumedAt}Z`).toLocaleString('ro-RO') : new Date().toLocaleString('ro-RO');
  const text =
    `Consum inregistrat de ${actorName} (${actorEmail}) la ${when}.\n` +
    `Stoc curent: ${stockCurrent}\n` +
    `Stoc initial: ${stockInitial}\n` +
    `Stoc minim: ${stockMin}\n` +
    `Cafele ramase: ${stockCurrent}\n`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a">
      <h2 style="margin:0 0 12px 0">Cafea Office: consum nou inregistrat</h2>
      <p style="margin:0 0 8px 0"><strong>Utilizator:</strong> ${actorName} (${actorEmail})</p>
      <p style="margin:0 0 8px 0"><strong>Data:</strong> ${when}</p>
      <p style="margin:0 0 8px 0"><strong>Stoc curent:</strong> ${stockCurrent}</p>
      <p style="margin:0 0 8px 0"><strong>Stoc initial:</strong> ${stockInitial}</p>
      <p style="margin:0 0 8px 0"><strong>Stoc minim:</strong> ${stockMin}</p>
      <p style="margin:0 0 8px 0"><strong>Cafele ramase:</strong> ${stockCurrent}</p>
    </div>
  `;

  let sent = 0;
  for (const r of validRecipients) {
    await tx.sendMail({
      from: config.mailFrom,
      to: r.email,
      subject,
      text,
      html
    });
    sent += 1;
  }
  return { sent, skipped: (recipients?.length || 0) - sent };
}
