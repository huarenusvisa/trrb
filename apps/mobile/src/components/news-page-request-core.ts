export type PageRequestToken = {
  generation: number;
  kind: 'refresh' | 'append';
  offset: number;
};

export class PageRequestGate {
  private generation = 0;
  private refreshing = false;
  private appending = false;

  resetFeed() {
    this.generation += 1;
    this.refreshing = false;
    this.appending = false;
    return this.generation;
  }

  startRefresh(): PageRequestToken | null {
    if (this.refreshing) return null;
    const generation = this.resetFeed();
    this.refreshing = true;
    return { generation, kind: 'refresh', offset: 0 };
  }

  startAppend(offset: number): PageRequestToken | null {
    if (this.refreshing || this.appending || !Number.isFinite(offset) || offset < 0) return null;
    this.appending = true;
    return { generation: this.generation, kind: 'append', offset };
  }

  isCurrent(tokenOrGeneration: PageRequestToken | number) {
    const generation = typeof tokenOrGeneration === 'number' ? tokenOrGeneration : tokenOrGeneration.generation;
    return generation === this.generation;
  }

  finish(token: PageRequestToken) {
    if (!this.isCurrent(token)) return false;
    if (token.kind === 'refresh') this.refreshing = false;
    else this.appending = false;
    return true;
  }
}

// Keep the news-facing names stable while allowing other paginated screens to
// share the same synchronous request gate.
export type NewsPageRequestToken = PageRequestToken;
export { PageRequestGate as NewsPageRequestGate };
