type Handler<E> = (event: E) => void;

export class EventBus<E extends { t: string }> {
  private handlers = new Map<E['t'], Set<Handler<E>>>();
  private any = new Set<Handler<E>>();
  private queue: E[] = [];

  on<K extends E['t']>(type: K, fn: Handler<Extract<E, { t: K }>>) {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<E>);
    return () => this.off(type, fn);
  }

  off<K extends E['t']>(type: K, fn: Handler<Extract<E, { t: K }>>) {
    this.handlers.get(type)?.delete(fn as Handler<E>);
  }

  onAny(fn: Handler<E>) {
    this.any.add(fn);
    return () => { this.any.delete(fn); };
  }

  emit(event: E) {
    this.queue.push(event);
  }

  get pending() {
    return this.queue.length;
  }

  flush() {
    const batch = this.queue;
    this.queue = [];
    for (const e of batch) {
      const set = this.handlers.get(e.t as E['t']);
      if (set) for (const fn of set) fn(e);
      for (const fn of this.any) fn(e);
    }
    return batch;
  }
}
