import { Injectable, Logger } from '@nestjs/common';

import { SessionRegistryService } from '../whatsapp/services/session-registry.service';
import { AgentRunInput, AgentRunOutput } from '../whatsapp/types';
import { AgentRuntimeProviderService } from './agent-runtime.provider';

@Injectable()
export class AgentRuntimeService {
  private readonly logger = new Logger(AgentRuntimeService.name);

  constructor(
    private readonly sessionRegistry: SessionRegistryService,
    private readonly agentRuntimeProvider: AgentRuntimeProviderService,
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunOutput> {
    let session = this.sessionRegistry.getWarmSession(input.conversationKey);

    if (!session || !this.sessionRegistry.isHealthy(session)) {
      session = this.sessionRegistry.spawnSession(input.conversationKey, input.event);
    }

    this.sessionRegistry.markSessionBusy(input.conversationKey);

    try {
      const envelope = await this.agentRuntimeProvider.run(input, session);
      this.sessionRegistry.markSessionActive(session.sessionId, envelope.agentSessionId);

      this.logger.log(
        `[${input.conversationKey}] Runtime action=${envelope.result.action} confidence=${envelope.result.confidence}`,
      );

      return envelope.result;
    } catch (err) {
      this.sessionRegistry.markSessionFailed(session.sessionId);
      throw err;
    }
  }
}
