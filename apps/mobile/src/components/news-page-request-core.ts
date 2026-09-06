export type NewsPageRequestToken = {
  generation: number;
  kind: 'refresh' | 'append';
  offset: number;
};

export class NewsPageRequestGate {
  private generation = 0;
  private refreshing = false;
  private appending = false;

  resetFeed() {
    this.generation += 1;
    this.refreshing = false;
    this.appending = false;
    return this.generation;
  }

  startRefresh(): NewsPageRequestToken | null {
    if (this.refreshing) return null;
    const generation = this.resetFeed();
    this.refreshing = true;
    return { generation, kind: 'refresh', offset: 0 };
  }

  startAppend(offset: number): NewsPageRequestToken | null {
    if (this.refreshing || this.appending || offset < 0) return null;
    this.appending = true;
    return { generation: this.generation, kind: 'append', offset };
  }

  isCurrent(tokenOrGeneration: NewsPageRequestToken | number) {
    const generation = typeof tokenOrGeneration === 'number' ? tokenOrGeneration : tokenOrGeneration.generation;
    return generation === this.generation;
  }

  finish(token: NewsPageRequestToken) {
    if (!this.isCurrent(token)) return false;
    if (token.kind === 'refresh') this.refreshing = false;
    else this.appending = false;
    return true;
  }
}
