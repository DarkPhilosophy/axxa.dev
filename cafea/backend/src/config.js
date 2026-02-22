import dotenv from 'dotenv';

dotenv.config();

function namespaceUrl(base, namespace) {
  if (!base) return null;
  const u = new URL(base);
  const ns = String(namespace || '').replace(/\.db$/, '');
  const path = (u.pathname || '').replace(/\/+$/, '');
  if (path.startsWith('/db/')) return u.toString();
  u.pathname = `/db/${ns}`;
  return u.toString();
}

export const config = {
  port: Number(process.env.PORT || 8788),
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  dbNamespace: process.env.DB_NAMESPACE || 'cafea',
  dbUrlBase: process.env.DB_URL || 'https://sql.axxa.dev',
  dbToken: process.env.DB_TOKEN || '',
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

export const resolvedDbUrl = namespaceUrl(config.dbUrlBase, config.dbNamespace);

if (!resolvedDbUrl) {
  throw new Error('DB_URL is required');
}
