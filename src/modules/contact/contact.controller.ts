import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ContactDto } from './dto/contact.dto';
import { ContactService } from './contact.service';

@ApiTags('Contact')
@Controller({ path: 'contact', version: '1' })
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(200)
  // Much tighter than the global 100/min: every call sends mail from the salon's
  // domain, and bots were using it to hit random addresses (bounce backscatter).
  @Throttle({ default: { limit: 3, ttl: 10 * 60 * 1000 } })
  @ApiOperation({
    summary:
      'Send contact form message (emails info@JosephBattisti.com, plus a confirmation to the sender)',
  })
  @ApiBody({ type: ContactDto })
  @ApiResponse({
    status: 200,
    description:
      'Message accepted and email sent. `confirmationSent` is false when the auto-reply to the sender failed — the salon still received the message.',
    schema: {
      example: { ok: true, messageId: '<smtp-message-id>', confirmationSent: true },
    },
  })
  @ApiResponse({
    status: 422,
    description: 'Validation error (global ValidationPipe)',
    schema: {
      example: {
        statusCode: 422,
        message: ['email must be an email', 'message must be longer than or equal to 5 characters'],
        error: 'Unprocessable Entity',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Too many submissions from this IP (3 per 10 minutes)',
  })
  @ApiResponse({
    status: 500,
    description: 'Email sending failed',
    schema: { example: { statusCode: 500, message: 'Failed to send message' } },
  })
  async send(@Body() dto: ContactDto) {
    return this.contactService.sendContactEmail(dto);
  }
}
