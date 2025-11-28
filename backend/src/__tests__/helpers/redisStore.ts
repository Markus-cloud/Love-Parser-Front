type RedisEntry = {
  value: string;
  expiresAt: number;
};

export interface InMemoryRedisClient {
  get(key: string): Promise<string | null>;
  setEx(key: string, ttlSeconds: number, value: string): Promise<string>;
  del(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  clear(): void;
}

export function createInMemoryRedisClient(): { client: InMemoryRedisClient; dump(): Record<string, string>; } {
  const store = new Map<string, RedisEntry>();

  const touchEntry = (key: string) => {
    const entry = store.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt > 0 && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }

    return entry;
  };

  const client: InMemoryRedisClient = {
    async get(key) {
      return touchEntry(key)?.value ?? null;
    },
    async setEx(key, ttlSeconds, value) {
      const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0;
      store.set(key, { value, expiresAt });
      return "OK";
    },
    async del(key) {
      const existed = store.delete(key);
      return existed ? 1 : 0;
    },
    async ttl(key) {
      const entry = touchEntry(key);
      if (!entry) {
        return -2;
      }

      if (entry.expiresAt === 0) {
        return -1;
      }

      return Math.max(Math.ceil((entry.expiresAt - Date.now()) / 1000), 0);
    },
    clear() {
      store.clear();
    },
  };

  const dump = () => {
    const snapshot: Record<string, string> = {};
    for (const [key, entry] of store.entries()) {
      snapshot[key] = entry.value;
    }
    return snapshot;
  };

  return { client, dump };
}
