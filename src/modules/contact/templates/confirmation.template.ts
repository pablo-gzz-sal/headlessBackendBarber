import { ContactDto } from '../dto/contact.dto';

/**
 * Content-ID for the inlined wordmark. Referenced from the HTML as
 * <img src="cid:...">, attached by ContactService.
 */
export const LOGO_CID = 'jb-wordmark';

/** Booking link — same destination as the site's "Book Appointment" button. */
const BOOKING_URL = 'https://booking.mangomint.com/307273';

/**
 * Salon details, kept in sync with the copy in the frontend's contact page
 * (barber-frontend: features/contact-page/contact-page.ts). Update both together.
 */
const LOCATIONS = [
  {
    name: 'Manhattan',
    address: '136 East 73rd St., New York, NY 10021',
    phone: '212.628.5639',
  },
  {
    name: 'Joseph Battisti Salon @B.U. SPACE',
    address: '2119 S Clinton Avenue, Rochester, NY 14618',
    phone: '585.667.1477',
  },
  {
    name: "Joseph Battisti @COCO'S'HE",
    address: '500 NE Spanish Blvd, Suite 103, Boca Raton, FL 33431',
    phone: '212.628.5639',
  },
  {
    name: "Battisti's",
    address: '2575 Chili Avenue, Rochester, NY 14624',
    phone: '585.426.3030',
  },
];

const HOURS = [
  { day: 'Sunday', hours: 'Closed' },
  { day: 'Monday', hours: 'Closed' },
  { day: 'Tuesday', hours: '10 AM–4 PM' },
  { day: 'Wednesday', hours: '9 AM–9 PM' },
  { day: 'Thursday', hours: '9 AM–9 PM' },
  { day: 'Friday', hours: '9 AM–7 PM' },
  { day: 'Saturday', hours: '9 AM–5 PM' },
];

const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** First name only — "Thank you, Joseph." reads better than the full name. */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

/**
 * Auto-reply sent to whoever submitted the contact form.
 *
 * Table-based layout with inline styles throughout: Gmail strips <style>
 * blocks in some contexts and Outlook ignores flexbox/grid entirely.
 */
export function buildConfirmationEmail(dto: ContactDto): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = 'We received your message — Joseph Battisti Salon';

  const locationsHtml = LOCATIONS.map(
    (loc) => `
      <tr>
        <td style="padding: 0 0 18px; font-family: ${SANS};">
          <div style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #111111;">
            ${escapeHtml(loc.name)}
          </div>
          <div style="font-size: 14px; line-height: 22px; color: #6b6b6b; padding-top: 4px;">
            ${escapeHtml(loc.address)}<br />
            <a href="tel:${loc.phone.replace(/\./g, '')}" style="color: #6b6b6b; text-decoration: none;">${loc.phone}</a>
          </div>
        </td>
      </tr>`,
  ).join('');

  const hoursHtml = HOURS.map(
    (h) => `
      <tr>
        <td style="padding: 5px 0; font-family: ${SANS}; font-size: 14px; color: #111111;">${h.day}</td>
        <td align="right" style="padding: 5px 0; font-family: ${SANS}; font-size: 14px; color: #6b6b6b;">${h.hours}</td>
      </tr>`,
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f2f1ef;">
    <!-- Preview text shown in the inbox list, hidden in the body -->
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
      Thank you for reaching out — we will be in touch shortly.
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f2f1ef;">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background-color: #ffffff;">

            <!-- Wordmark -->
            <tr>
              <td align="center" style="padding: 44px 32px 36px;">
                <img src="cid:${LOGO_CID}" alt="Joseph Battisti Salon" width="200"
                     style="display: block; width: 200px; max-width: 60%; height: auto; border: 0;" />
              </td>
            </tr>

            <!-- Headline -->
            <tr>
              <td style="padding: 0 40px;">
                <div style="font-family: ${SANS}; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; color: #6b6b6b; text-align: center;">
                  Message Received
                </div>
                <h1 style="margin: 18px 0 0; font-family: ${SERIF}; font-weight: normal; font-size: 30px; line-height: 38px; color: #111111; text-align: center;">
                  Thank you, ${escapeHtml(firstName(dto.name))}.
                </h1>
                <p style="margin: 18px 0 0; font-family: ${SANS}; font-size: 15px; line-height: 26px; color: #4a4a4a; text-align: center;">
                  Your message has reached the salon and a member of our team will be
                  in touch shortly. Our clients are our top priority — whether you are
                  ready to book, have a question about our services, or need
                  personalized recommendations, we are here to help.
                </p>
              </td>
            </tr>

            <!-- Their message, echoed back -->
            <tr>
              <td style="padding: 34px 40px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #faf9f7; border-left: 2px solid #111111;">
                  <tr>
                    <td style="padding: 22px 24px;">
                      <div style="font-family: ${SANS}; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b;">
                        What you sent us
                      </div>
                      <p style="margin: 14px 0 0; font-family: ${SANS}; font-size: 14px; line-height: 24px; color: #111111; white-space: pre-wrap;">${escapeHtml(dto.message)}</p>
                      <p style="margin: 16px 0 0; font-family: ${SANS}; font-size: 13px; line-height: 22px; color: #6b6b6b;">
                        ${escapeHtml(dto.name)}<br />
                        ${escapeHtml(dto.email)}${dto.phone ? `<br />${escapeHtml(dto.phone)}` : ''}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Booking call to action -->
            <tr>
              <td align="center" style="padding: 36px 40px 0;">
                <p style="margin: 0 0 20px; font-family: ${SANS}; font-size: 15px; line-height: 26px; color: #4a4a4a;">
                  In a hurry? You can book your appointment online at any time.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="#111111" style="border-radius: 4px;">
                      <a href="${BOOKING_URL}"
                         style="display: inline-block; padding: 15px 34px; font-family: ${SANS}; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #ffffff; text-decoration: none;">
                        Book an Appointment
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Hours -->
            <tr>
              <td style="padding: 44px 40px 0;">
                <div style="border-top: 1px solid #e5e3df; padding-top: 28px;">
                  <div style="font-family: ${SANS}; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; color: #6b6b6b; padding-bottom: 12px;">
                    Salon Hours
                  </div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${hoursHtml}
                  </table>
                </div>
              </td>
            </tr>

            <!-- Locations -->
            <tr>
              <td style="padding: 32px 40px 0;">
                <div style="border-top: 1px solid #e5e3df; padding-top: 28px;">
                  <div style="font-family: ${SANS}; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; color: #6b6b6b; padding-bottom: 16px;">
                    Our Locations
                  </div>
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    ${locationsHtml}
                  </table>
                </div>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="padding: 16px 40px 44px;">
                <div style="border-top: 1px solid #e5e3df; padding-top: 24px;">
                  <p style="margin: 0; font-family: ${SANS}; font-size: 12px; line-height: 22px; color: #9a9a9a; text-align: center;">
                    This is an automatic confirmation — you can reply to this email
                    and it will reach the salon directly.
                  </p>
                  <p style="margin: 14px 0 0; font-family: ${SERIF}; font-size: 13px; letter-spacing: 0.14em; color: #111111; text-align: center;">
                    JOSEPH BATTISTI SALON
                  </p>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text =
    `Thank you, ${firstName(dto.name)}.\n\n` +
    `Your message has reached the salon and a member of our team will be in touch shortly.\n\n` +
    `WHAT YOU SENT US\n` +
    `${dto.message}\n\n` +
    `${dto.name}\n${dto.email}${dto.phone ? `\n${dto.phone}` : ''}\n\n` +
    `In a hurry? Book your appointment online: ${BOOKING_URL}\n\n` +
    `SALON HOURS\n` +
    HOURS.map((h) => `${h.day}: ${h.hours}`).join('\n') +
    `\n\nOUR LOCATIONS\n` +
    LOCATIONS.map((l) => `${l.name}\n${l.address}\n${l.phone}`).join('\n\n') +
    `\n\nThis is an automatic confirmation — you can reply to this email and it will reach the salon directly.\n` +
    `Joseph Battisti Salon\n`;

  return { subject, html, text };
}
