export type NotificationActionToken = {
  generation: number;
  itemId: string;
};

export class NotificationActionGate {
  private generation = 0;
  private activeItemId = '';

  reset() {
    this.generation += 1;
    this.activeItemId = '';
  }

  start(itemId: string): NotificationActionToken | null {
    const normalizedItemId = itemId.trim();
    if (!normalizedItemId || this.activeItemId) return null;
    this.activeItemId = normalizedItemId;
    return { generation: this.generation, itemId: normalizedItemId };
  }

  isCurrent(token: NotificationActionToken) {
    return token.generation === this.generation && token.itemId === this.activeItemId;
  }

  finish(token: NotificationActionToken) {
    if (!this.isCurrent(token)) return false;
    this.activeItemId = '';
    return true;
  }
}
