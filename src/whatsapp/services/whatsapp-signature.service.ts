import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

import { AppConfigService } from '../../shared/app-config.service';

@Injectable()
export class WhatsappSignatureService {
  constructor(private readonly appConfig: AppConfigService) {}

  verifySignature(signatureHeader: string | undefined, rawBody?: Buffer): void {
    const appSecret = this.appConfig.whatsapp.appSecret;

    if (!appSecret || appSecret === 'change-me') {
      return;
    }

    if (!signatureHeader || !rawBody) {
      throw new UnauthorizedException('Missing WhatsApp signature headers');
    }

    const [algorithm, providedSignature] = signatureHeader.split('=');
    if (algorithm !== 'sha256' || !providedSignature) {
      throw new UnauthorizedException('Unsupported WhatsApp signature format');
    }

    const expectedSignature = createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    const expected = Buffer.from(expectedSignature, 'utf8');
    const provided = Buffer.from(providedSignature, 'utf8');

    if (expected.length !== provided.length) {
      throw new UnauthorizedException('WhatsApp signature mismatch');
    }

    if (!timingSafeEqual(expected, provided)) {
      throw new UnauthorizedException('WhatsApp signature mismatch');
    }
  }
}
