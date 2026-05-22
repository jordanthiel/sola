import { APP_NAME } from '@/lib/app'

/** Brand colors aligned with app theme (oklch primary ≈ teal) */
const BRAND = {
  primary: '#2f907f',
  primaryDark: '#247a6b',
  primaryLight: '#e8f5f2',
  background: '#f6f5f2',
  card: '#ffffff',
  text: '#1a2332',
  muted: '#64748b',
  border: '#e8e6e3',
} as const

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function textToHtmlParagraphs(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${BRAND.text};">${escapeHtml(block).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

export type EmailLayoutOptions = {
  preheader: string
  eyebrow?: string
  title: string
  bodyHtml: string
  cta?: { label: string; href: string }
  footerNote?: string
}

export function buildEmailLayout(options: EmailLayoutOptions): string {
  const preheader = escapeHtml(options.preheader)
  const eyebrow = options.eyebrow ? escapeHtml(options.eyebrow) : ''
  const title = escapeHtml(options.title)
  const footerNote = options.footerNote
    ? escapeHtml(options.footerNote)
    : `You received this email because notifications are enabled in ${APP_NAME}.`

  const ctaBlock = options.cta
    ? `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
            <tr>
              <td align="center" style="border-radius:10px;background:${BRAND.primary};">
                <a href="${escapeHtml(options.cta.href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;mso-padding-alt:0;">
                  <!--[if mso]><i style="letter-spacing:28px;mso-font-width:-100%;">&nbsp;</i><![endif]-->
                  <span style="mso-text-raise:12pt;">${escapeHtml(options.cta.label)}</span>
                  <!--[if mso]><i style="letter-spacing:28px;mso-font-width:-100%;">&nbsp;</i><![endif]-->
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${BRAND.muted};text-align:center;word-break:break-all;">
            Or copy this link:<br />
            <a href="${escapeHtml(options.cta.href)}" style="color:${BRAND.primary};text-decoration:underline;">${escapeHtml(options.cta.href)}</a>
          </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${title}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-card { padding: 28px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${BRAND.background};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.background};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" class="email-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="width:44px;height:44px;border-radius:12px;background:${BRAND.primary};text-align:center;vertical-align:middle;font-size:20px;font-weight:700;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
                    S
                  </td>
                  <td style="padding-left:12px;vertical-align:middle;text-align:left;">
                    <div style="font-size:22px;font-weight:700;color:${BRAND.text};letter-spacing:-0.02em;">${escapeHtml(APP_NAME)}</div>
                    <div style="font-size:13px;color:${BRAND.muted};margin-top:2px;">Household care, simplified</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-card" style="background:${BRAND.card};border:1px solid ${BRAND.border};border-radius:16px;padding:40px 36px;box-shadow:0 4px 24px rgba(26,35,50,0.06);">
              ${eyebrow ? `<p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.primary};">${eyebrow}</p>` : ''}
              <h1 style="margin:0 0 20px;font-size:26px;font-weight:700;line-height:1.25;color:${BRAND.text};letter-spacing:-0.02em;">${title}</h1>
              ${options.bodyHtml}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:28px 12px 0;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${BRAND.muted};">${footerNote}</p>
              <p style="margin:0;font-size:12px;color:${BRAND.muted};">&copy; ${new Date().getFullYear()} ${escapeHtml(APP_NAME)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export function buildEmailPlainText(
  options: EmailLayoutOptions & { plainBody?: string },
): string {
  const lines: string[] = []
  if (options.eyebrow) lines.push(options.eyebrow.toUpperCase(), '')
  lines.push(options.title, '')
  if (options.plainBody?.trim()) {
    lines.push(options.plainBody.trim(), '')
  } else if (options.preheader) {
    lines.push(options.preheader, '')
  }
  if (options.cta) {
    lines.push(`${options.cta.label}: ${options.cta.href}`, '')
  }
  lines.push('---', options.footerNote ?? `Manage notification preferences in ${APP_NAME} settings.`)
  return lines.join('\n')
}

export function buildInviteEmailHtml(params: {
  householdName: string
  inviteType: 'parent' | 'nanny'
  inviteUrl: string
}): { html: string; text: string } {
  const roleLabel = params.inviteType === 'nanny' ? 'the nanny' : 'a parent or guardian'
  const household = escapeHtml(params.householdName)
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${BRAND.text};">
      You&rsquo;ve been invited to join <strong style="color:${BRAND.text};">${household}</strong> on ${escapeHtml(APP_NAME)} as ${roleLabel}.
    </p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${BRAND.text};">
      Accept the invitation to see schedules, time off, payroll, and everything else your household shares in one place.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;">
      <tr>
        <td style="padding:16px 18px;background:${BRAND.primaryLight};border-radius:10px;border-left:4px solid ${BRAND.primary};">
          <p style="margin:0;font-size:14px;line-height:1.5;color:${BRAND.muted};">
            This link expires in <strong style="color:${BRAND.text};">30 days</strong>. Sign in with the email address the invite was sent to.
          </p>
        </td>
      </tr>
    </table>`

  const layout: EmailLayoutOptions = {
    preheader: `Join ${params.householdName} on ${APP_NAME}`,
    eyebrow: 'Invitation',
    title: `Join ${params.householdName}`,
    bodyHtml,
    cta: { label: 'Accept invitation', href: params.inviteUrl },
    footerNote: `If you weren\u2019t expecting this invite, you can ignore this email.`,
  }

  return {
    html: buildEmailLayout(layout),
    text: buildEmailPlainText({
      ...layout,
      plainBody: `You've been invited to join ${params.householdName} on ${APP_NAME} as ${roleLabel}. This link expires in 30 days.`,
    }),
  }
}

export function buildNotificationEmailHtml(params: {
  subject: string
  body: string
  appUrl: string
  link?: string
}): { html: string; text: string } {
  const bodyHtml = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 4px;">
      <tr>
        <td style="padding:20px 22px;background:${BRAND.background};border-radius:12px;border:1px solid ${BRAND.border};">
          ${textToHtmlParagraphs(params.body) || `<p style="margin:0;font-size:16px;line-height:1.6;color:${BRAND.muted};">No additional details.</p>`}
        </td>
      </tr>
    </table>`

  const viewHref = params.link ? `${params.appUrl.replace(/\/$/, '')}${params.link}` : params.appUrl

  const layout: EmailLayoutOptions = {
    preheader: params.body.slice(0, 120) || params.subject,
    eyebrow: 'Notification',
    title: params.subject,
    bodyHtml,
    cta: params.link
      ? { label: `Open in ${APP_NAME}`, href: viewHref }
      : { label: `Go to ${APP_NAME}`, href: params.appUrl },
    footerNote: `Turn off email alerts anytime in Settings \u2192 Notifications.`,
  }

  return {
    html: buildEmailLayout(layout),
    text: buildEmailPlainText({ ...layout, plainBody: params.body }),
  }
}
