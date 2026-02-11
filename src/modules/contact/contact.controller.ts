import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContactDto } from './dto/contact.dto';
import { ContactService } from './contact.service';

@ApiTags('Contact')
@Controller({ path: 'contact', version: '1' })
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Send contact form message (emails info@JosephBattisti.com)' })
  @ApiBody({ type: ContactDto })
  @ApiResponse({
    status: 200,
    description: 'Message accepted and email sent',
    schema: {
      example: { ok: true, messageId: '<smtp-message-id>' },
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
    status: 500,
    description: 'Email sending failed',
    schema: { example: { statusCode: 500, message: 'Failed to send message' } },
  })
  async send(@Body() dto: ContactDto) {
    return this.contactService.sendContactEmail(dto);
  }
}
