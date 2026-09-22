import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { ContactDto } from './dto/contact.dto';
import { LOGO_PNG_BASE64 } from './assets/logo.asset';
import { buildConfirmationEmail, escapeHtml, LOGO_CID } from './templates/confirmation.template';

/**
 * Anything that looks like a link. Real salon enquiries almost never contain
 * one; spam nearly always does. Only gates the auto-reply — the salon still
 * receives the message.
 */
const LINK_PATTERN =
  /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|info|biz|io|co|me|ru|cn|xyz|top|link|click|shop|store|online|site|app)\b/i;

/** Fallback when CONTACT_AUTOREPLY_DAILY_LIMIT is not set. */
const DEFAULT_AUTOREPLY_DAILY_LIMIT = 25;

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private transporter: Transporter;

  // In-memory, so it resets on restart/redeploy (and when a free Render
  // instance spins down). Good enough as a circuit breaker for a burst.
  private autoReplyDay = '';
  private autoRepliesToday = 0;

  constructor(private readonly config: ConfigService) {
    const host = this.cfg('SMTP_HOST');
    const port = Number(this.cfg('SMTP_PORT') ?? 587);
    const user = this.cfg('SMTP_USER');
    const pass = this.cfg('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn('Missing SMTP env vars: SMTP_HOST/SMTP_USER/SMTP_PASS');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true only for 465
      auth: { user, pass },
    });
  }

  /** Reads a config value and treats empty/whitespace-only strings as missing. */
  private cfg(key: string): string | undefined {
    const value = this.config.get<string>(key);
    const trimmed = typeof value === 'string' ? value.trim() : value;
    return trimmed ? trimmed : undefined;
  }

  async sendContactEmail(dto: ContactDto) {
    // Honeypot filled in = bot. Pretend it worked so it has no reason to adapt,
    // but send nothing.
    if (dto.website?.trim()) {
      this.logger.warn(`Honeypot triggered, submission dropped: ${dto.email}`);
      return { ok: true, confirmationSent: true };
    }

    // NOTE: `?? fallback` only fires on null/undefined, so a blank env var
    // (CONTACT_TO_EMAIL=) would leave `to` empty and nodemailer would reject
    // with "No recipients defined". `cfg()` treats blank values as missing.
    const to =
      this.cfg('CONTACT_TO_EMAIL') ?? this.cfg('SMTP_USER') ?? 'info@JosephBattisti.com';
    const from = this.cfg('CONTACT_FROM_EMAIL') ?? this.cfg('SMTP_USER') ?? to;

    if (!to) {
      this.logger.error(
        'No recipient configured. Set CONTACT_TO_EMAIL (or SMTP_USER) in the environment.',
      );
      throw new InternalServerErrorException('Failed to send message');
    }

    try {
      const subject = `New Contact Form Message — ${dto.name}`;
      const text =
        `Name: ${dto.name}\n` +
        `Email: ${dto.email}\n` +
        `Phone: ${dto.phone ?? '-'}\n\n` +
        `Message:\n${dto.message}\n`;

      const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2 style="margin: 0 0 12px;">New Contact Form Message</h2>
          <p><strong>Name:</strong> ${escapeHtml(dto.name)}</p>
          <p><strong>Email:</strong> ${escapeHtml(dto.email)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(dto.phone ?? '-')}</p>
          <hr style="margin: 16px 0;" />
          <p style="white-space: pre-wrap;">${escapeHtml(dto.message)}</p>
        </div>
      `;

      const info = await this.transporter.sendMail({
        to,
        from,
        subject,
        text,
        html,
        replyTo: dto.email, // so you can "Reply" directly to the sender
      });

      const confirmationSent = this.shouldSendConfirmation(dto)
        ? await this.sendConfirmationEmail(dto, from)
        : false;

      return { ok: true, messageId: info.messageId, confirmationSent };
    } catch (err: any) {
      this.logger.error(err?.message || err);
      throw new InternalServerErrorException('Failed to send message');
    }
  }

  /**
   * Gate for the auto-reply. The recipient is whatever address was typed into
   * the form, so every confirmation is mail from the salon's domain to a
   * stranger. Skipping it never affects the salon's copy of the message.
   */
  private shouldSendConfirmation(dto: ContactDto): boolean {
    if (LINK_PATTERN.test(`${dto.name} ${dto.message}`)) {
      this.logger.warn(`Auto-reply skipped (message contains a link): ${dto.email}`);
      return false;
    }

    const today = new Date().toISOString().slice(0, 10); // UTC day
    if (today !== this.autoReplyDay) {
      this.autoReplyDay = today;
      this.autoRepliesToday = 0;
    }

    const limit =
      Number(this.cfg('CONTACT_AUTOREPLY_DAILY_LIMIT')) || DEFAULT_AUTOREPLY_DAILY_LIMIT;
    if (this.autoRepliesToday >= limit) {
      this.logger.warn(`Auto-reply skipped (daily limit of ${limit} reached): ${dto.email}`);
      return false;
    }

    this.autoRepliesToday++;
    return true;
  }

  /**
   * Auto-reply to the person who filled in the form.
   *
   * Deliberately never throws: the salon already has the message at this point,
   * so a bounced confirmation must not turn a successful submission into a 500
   * and prompt the visitor to send everything again.
   */
  private async sendConfirmationEmail(dto: ContactDto, from: string): Promise<boolean> {
    try {
      const { subject, html, text } = buildConfirmationEmail();

      await this.transporter.sendMail({
        to: dto.email,
        from,
        subject,
        text,
        html,
        replyTo: from,
        attachments: [
          {
            filename: 'joseph-battisti.png',
            content: Buffer.from(LOGO_PNG_BASE64, 'base64'),
            cid: LOGO_CID, // referenced as <img src="cid:..."> in the template
            contentDisposition: 'inline',
          },
        ],
      });

      return true;
    } catch (err: any) {
      this.logger.error(`Confirmation email to ${dto.email} failed: ${err?.message || err}`);
      return false;
    }
  }
}
