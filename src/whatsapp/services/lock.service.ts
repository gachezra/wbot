import { Injectable } from '@nestjs/common';

@Injectable()
export class LockService {
  private readonly activeConversations = new Set<string>();

  acquire(conversationKey: string): boolean {
    if (this.activeConversations.has(conversationKey)) {
      return false;
    }

    this.activeConversations.add(conversationKey);
    return true;
  }

  release(conversationKey: string): void {
    this.activeConversations.delete(conversationKey);
  }
}
