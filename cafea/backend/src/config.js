import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 8788),
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  postgresUrl: process.env.POSTGRES_URL || '',
  corsOrigin: process.env.CORS_ORIGIN || 'https://cafea.axxa.dev',
  appUrl: process.env.APP_URL || process.env.CORS_ORIGIN || 'https://cafea.axxa.dev',
  bootstrapAdminEmail: process.env.ADMIN_EMAIL || 'alexa@axxa.dev',
  bootstrapAdminPassword: process.env.ADMIN_PASSWORD || '',
  bootstrapAdminName: process.env.ADMIN_NAME || 'Alex',
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
  smtpServername: process.env.SMTP_SERVERNAME || '',
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  mailFrom: process.env.MAIL_FROM || process.env.SMTP_USER || 'alexa@axxa.dev',
  mailFromName: process.env.MAIL_FROM_NAME || 'Cafea Office',
  resendApiKey: process.env.RESEND_API_KEY || ''
};

if (!config.postgresUrl) {
  throw new Error('POSTGRES_URL is required');
}


export function getCorsAllowedOrigins() {
  const raw = String(config.corsOrigin || '').trim();
  const defaults = ['https://cafea.axxa.dev', 'https://zeul.go.ro', 'https://localhost', 'capacitor://localhost'];
  const parsed = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  const merged = parsed.length ? [...parsed, ...defaults] : defaults;
  return [...new Set(merged)];
}
