import { Module } from '@nestjs/common';

import { SharedModule } from '../shared/shared.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AgentOrchestratorService } from './agent-orchestrator.service';
import { AgentRuntimeProviderService } from './agent-runtime.provider';
import { AgentRuntimeService } from './agent-runtime.service';

@Module({
  imports: [SharedModule, WhatsappModule],
  providers: [AgentOrchestratorService, AgentRuntimeProviderService, AgentRuntimeService],
  exports: [AgentOrchestratorService],
})
export class AgentModule {}
