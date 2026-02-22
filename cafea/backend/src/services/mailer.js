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

export async function notifyCoffeeConsumed({ actorName, actorEmail, recipients, stockCurrent, consumedAt }) {
  const tx = getTransport();
  if (!tx) return { sent: 0, skipped: recipients?.length || 0, reason: 'smtp_not_configured' };

  const validRecipients = (recipients || [])
    .map((r) => ({ email: String(r.email || '').trim().toLowerCase(), name: String(r.name || '').trim() }))
    .filter((r) => isValidEmail(r.email));
  if (!validRecipients.length) return { sent: 0, skipped: recipients?.length || 0, reason: 'no_valid_recipients' };

  const subject = 'Cafea Office: consum nou înregistrat';
  const when = consumedAt ? new Date(`${consumedAt}Z`).toLocaleString('ro-RO') : new Date().toLocaleString('ro-RO');
  const text = `Consum înregistrat de ${actorName} (${actorEmail}) la ${when}. Stoc curent: ${stockCurrent}.`;

  let sent = 0;
  for (const r of validRecipients) {
    await tx.sendMail({
      from: config.mailFrom,
      to: r.email,
      subject,
      text
    });
    sent += 1;
  }
  return { sent, skipped: (recipients?.length || 0) - sent };
}

