import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface AppConfigShape {
  port: number;
  whatsapp: {
    provider: string;
    verifyToken: string;
    appSecret: string;
    phoneNumberId: string;
    webhookPath: string;
    dedupeWindowSeconds: number;
    maxPayloadBytes: number;
  };
  sessions: {
    idleTimeoutSeconds: number;
    maxConcurrentPerConversation: number;
    resumeWarmSessions: boolean;
    warmHealthTtlSeconds: number;
  };
  retrieval: {
    recentContextHours: number;
    includePersistentSummary: boolean;
    includeUnresolvedThreads: boolean;
    deepSearchEnabled: boolean;
    deepSearchLookbackDays: number;
    maxRecentItems: number;
    maxDeepResults: number;
  };
  actioning: {
    allowAutonomousRead: boolean;
    allowAutonomousReply: boolean;
    allowTemplateSends: boolean;
    allowThirdPartyWrites: boolean;
    requireApprovalAboveRisk: RiskLevel;
  };
}

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  get port(): number {
    return this.getNumber('PORT', 3000);
  }

  get whatsapp(): AppConfigShape['whatsapp'] {
    return {
      provider: this.getString('WHATSAPP_PROVIDER', 'meta-cloud-api'),
      verifyToken: this.getString('WHATSAPP_VERIFY_TOKEN', 'change-me'),
      appSecret: this.getString('WHATSAPP_APP_SECRET', 'change-me'),
      phoneNumberId: this.getString('WHATSAPP_PHONE_NUMBER_ID', ''),
      webhookPath: this.normalizeWebhookPath(
        this.getString('WHATSAPP_WEBHOOK_PATH', '/webhooks/whatsapp'),
      ),
      dedupeWindowSeconds: this.getNumber(
        'WHATSAPP_DEDUPE_WINDOW_SECONDS',
        30,
      ),
      maxPayloadBytes: this.getNumber('WHATSAPP_MAX_PAYLOAD_BYTES', 262_144),
    };
  }

  get sessions(): AppConfigShape['sessions'] {
    return {
      idleTimeoutSeconds: this.getNumber('SESSION_IDLE_TIMEOUT_SECONDS', 3600),
      maxConcurrentPerConversation: this.getNumber(
        'SESSION_MAX_CONCURRENT_PER_CONVERSATION',
        1,
      ),
      resumeWarmSessions: this.getBoolean(
        'SESSION_RESUME_WARM_SESSIONS',
        true,
      ),
      warmHealthTtlSeconds: this.getNumber(
        'SESSION_WARM_HEALTH_TTL_SECONDS',
        90,
      ),
    };
  }

  get retrieval(): AppConfigShape['retrieval'] {
    return {
      recentContextHours: this.getNumber('RECENT_CONTEXT_HOURS', 24),
      includePersistentSummary: this.getBoolean(
        'RETRIEVAL_INCLUDE_PERSISTENT_SUMMARY',
        true,
      ),
      includeUnresolvedThreads: this.getBoolean(
        'RETRIEVAL_INCLUDE_UNRESOLVED_THREADS',
        true,
      ),
      deepSearchEnabled: this.getBoolean('DEEP_SEARCH_ENABLED', true),
      deepSearchLookbackDays: this.getNumber('DEEP_SEARCH_LOOKBACK_DAYS', 365),
      maxRecentItems: this.getNumber('RETRIEVAL_MAX_RECENT_ITEMS', 20),
      maxDeepResults: this.getNumber('RETRIEVAL_MAX_DEEP_RESULTS', 12),
    };
  }

  get actioning(): AppConfigShape['actioning'] {
    return {
      allowAutonomousRead: this.getBoolean(
        'ACTIONING_ALLOW_AUTONOMOUS_READ',
        true,
      ),
      allowAutonomousReply: this.getBoolean(
        'ACTIONING_ALLOW_AUTONOMOUS_REPLY',
        false,
      ),
      allowTemplateSends: this.getBoolean(
        'ACTIONING_ALLOW_TEMPLATE_SENDS',
        false,
      ),
      allowThirdPartyWrites: this.getBoolean(
        'ACTIONING_ALLOW_THIRD_PARTY_WRITES',
        false,
      ),
      requireApprovalAboveRisk: this.getRiskLevel(
        'ACTIONING_REQUIRE_APPROVAL_ABOVE_RISK',
        'medium',
      ),
    };
  }

  private getString(key: string, fallback: string): string {
    return this.configService.get<string>(key) ?? fallback;
  }

  private getNumber(key: string, fallback: number): number {
    const rawValue = this.configService.get<string>(key);

    if (rawValue === undefined) {
      return fallback;
    }

    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : fallback;
  }

  private getBoolean(key: string, fallback: boolean): boolean {
    const rawValue = this.configService.get<string>(key);

    if (rawValue === undefined) {
      return fallback;
    }

    return rawValue.toLowerCase() === 'true';
  }

  private getRiskLevel(key: string, fallback: RiskLevel): RiskLevel {
    const rawValue = this.configService.get<string>(key) as RiskLevel | undefined;
    if (
      rawValue === 'low' ||
      rawValue === 'medium' ||
      rawValue === 'high' ||
      rawValue === 'critical'
    ) {
      return rawValue;
    }

    return fallback;
  }

  private normalizeWebhookPath(path: string): string {
    if (!path.startsWith('/')) {
      return `/${path}`;
    }

    return path;
  }
}
