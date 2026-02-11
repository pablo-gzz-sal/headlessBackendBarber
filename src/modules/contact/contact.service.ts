import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { ContactDto } from './dto/contact.dto';

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);
  private transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') ?? 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

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

  async sendContactEmail(dto: ContactDto) {
    const to = this.config.get<string>('CONTACT_TO_EMAIL') ?? 'info@JosephBattisti.com';
    const from = this.config.get<string>('CONTACT_FROM_EMAIL') ?? this.config.get<string>('SMTP_USER') ?? to;

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

      return { ok: true, messageId: info.messageId };
    } catch (err: any) {
      this.logger.error(err?.message || err);
      throw new InternalServerErrorException('Failed to send message');
    }
  }
}

function escapeHtml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
