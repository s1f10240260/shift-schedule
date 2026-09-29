import nodemailer from 'nodemailer';

export interface SmtpConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  from_name: string;
  from_email: string;
}

export function isSmtpConfigured(config: Partial<SmtpConfig> | null | undefined): boolean {
  if (!config) return false;
  return Boolean(config.smtp_host && config.smtp_user && config.smtp_pass);
}

export function createTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port || 587,
    secure: config.smtp_port === 465,
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass
    }
  });
}

export function formatFrom(config: SmtpConfig): string {
  const email = config.from_email || config.smtp_user;
  const name = config.from_name || '';
  return name ? name + ' <' + email + '>' : email;
}

export interface MailPayload {
  to: string;
  subject: string;
  text: string;
  html?: string;
  bcc?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toHtml(text: string): string {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family: sans-serif; white-space: pre-wrap; line-height: 1.7;">' +
    escapeHtml(text) +
    '</body></html>'
  );
}

export async function sendMail(config: SmtpConfig, payload: MailPayload): Promise<void> {
  const transport = createTransport(config);
  await transport.sendMail({
    from: formatFrom(config),
    to: payload.to,
    bcc: payload.bcc,
    subject: payload.subject,
    text: {
      content: payload.text,
      contentType: 'text/plain; charset=utf-8',
      encoding: 'utf-8'
    },
    html: payload.html || toHtml(payload.text)
  });
}
