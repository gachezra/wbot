Build the missing parts in this order inside Documents/webook.

1. Add the core modules

Create these services:

• session-resolver.service.ts
• session-store.service.ts
• dedupe.service.ts
• lock.service.ts
• context-builder.service.ts
• agent-orchestrator.service.ts
• memory.service.ts
• message-sender.service.ts

That is the real missing system.

───

2. Session resolver

Purpose: derive a stable conversation key from the inbound WhatsApp event.

Example:

@Injectable()
export class SessionResolverService {
  resolve(event: WhatsAppNormalizedEvent): string {
    if (!event.from || event.from === 'unknown') {
      throw new Error('Cannot resolve conversation key');
    }

    return `whatsapp:dm:${event.from}`;
  }
}

───

3. Session store

Start simple. Use in-memory plus JSON file persistence.

Store:

type SessionRecord = {
  conversationKey: string;
  sessionId: string;
  status: 'warm' | 'busy' | 'expired' | 'failed';
  lastActivityAt: string;
  lastSummary?: string;
};

Methods:

• get(conversationKey)
• upsert(record)
• markBusy(conversationKey)
• markExpired(conversationKey)

───

4. Dedupe service

Meta retries happen. Ignore duplicates by messageId.

Shape:

@Injectable()
export class DedupeService {
  private seen = new Map<string, number>();

  isDuplicate(messageId: string): boolean {
    const now = Date.now();
    if (this.seen.has(messageId)) return true;
    this.seen.set(messageId, now);
    return false;
  }
}

Later, add TTL cleanup.

───

5. Lock service

One active run per conversation.

Simple version:

@Injectable()
export class LockService {
  private locks = new Set<string>();

  acquire(key: string): boolean {
    if (this.locks.has(key)) return false;
    this.locks.add(key);
    return true;
  }

  release(key: string) {
    this.locks.delete(key);
  }
}

Without this, one user can trigger overlapping agent runs.

───

6. Context builder

Pull:

• recent messages from your message log
• previous summary
• unresolved items

Start with:

type ContextPacket = {
  conversationKey: string;
  recentMessages: Array<{ role: 'user' | 'assistant'; text: string; timestamp: string }>;
  summary?: string;
  unresolved?: string[];
};

This is where “welcome back” comes from.

───

7. Agent orchestrator

This is the brain bridge.

Input:

{
  conversationKey,
  event,
  context
}

Output:

{
  shouldReply: boolean;
  replyText: string;
  confidence: number;
  action: 'reply' | 'ignore' | 'escalate';
  memoryNotes?: string[];
}

First version:

• no real sub-agent spawning yet
• just one orchestrator service that prepares prompt + calls your model/runtime

Later:

• resume warm session
• spawn if cold

───

8. Message sender

Replace fixed welcome message with general text sending.

async sendTextMessage(to: string, body: string) {
  // POST to Meta Graph API
}

Then controller flow becomes dynamic.

───

9. Memory service

Persist:

• inbound message
• outbound reply
• updated summary
• facts worth remembering

Start with files:

• data/messages/<conversationKey>.json
• data/summaries/<conversationKey>.json

Do not overengineer database first.

───

10. Replace the webhook handling flow

Your new flow should be:

@Post()
async handleWebhook(@Req() req: RawBodyRequest) {
  this.signatureService.verifySignature(
    req.headers['x-hub-signature-256'],
    req.rawBody,
  );

  const event = this.normalizer.normalize(req.body);
  this.botService.logStructuredEvent(event);

  if (event.eventType !== 'message' || event.from === 'unknown') {    return { ok: true, ignored: true };
  }

  if (this.dedupeService.isDuplicate(event.messageId)) {
    return { ok: true, duplicate: true };
  }

  const conversationKey = this.sessionResolver.resolve(event);

  if (!this.lockService.acquire(conversationKey)) {
    return { ok: true, busy: true };
  }

  try {
    const context = await this.contextBuilder.build(conversationKey, event);const result = await this.agentOrchestrator.handle({
      conversationKey,
      event,
      context,
    });

    if (result.shouldReply) {
      await this.messageSender.sendTextMessage(event.from, result.replyText);
    }

    await this.memoryService.writeback(conversationKey, event, result);

    return { ok: true };
  } finally {
    this.lockService.release(conversationKey);
  }
}

That is the backbone.

───

11. Folder shape in Documents/webook

Use this:

Documents/webook/
  src/
    bot/
    whatsapp/
    session/
    context/
    memory/
    agent/
    sender/
    common/
  data/
    messages/
    summaries/
    sessions/

Keep runtime data out of source.

───

12. What to build first

Build in this exact order:

1. session resolver
2. dedupe
3. lock service
4. memory file store
5. context builder
6. message sender
7. orchestrator
8. controller integration

That order keeps the thing from becoming spaghetti.

Your current system already catches the webhook.
Now you need to turn it from receiver into conversation engine.