import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { ContactDto } from './dto/contact.dto';
import { LOGO_PNG_BASE64 } from './assets/logo.asset';
import { buildConfirmationEmail, escapeHtml, LOGO_CID } from './templates/confirmation.template';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private transporter: Transporter;

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

      const confirmationSent = await this.sendConfirmationEmail(dto, from);

      return { ok: true, messageId: info.messageId, confirmationSent };
    } catch (err: any) {
      this.logger.error(err?.message || err);
      throw new InternalServerErrorException('Failed to send message');
    }
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
      const { subject, html, text } = buildConfirmationEmail(dto);

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
