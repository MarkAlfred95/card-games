// Room storage for the online games. In production this is Upstash Redis (or
// Vercel KV, which exposes the same REST API) configured via env vars; without
// them it falls back to an in-process Map — fine for `vite dev`, but NOT for
// serverless production, where every invocation may be a fresh process.

export interface RoomStore {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSeconds: number): Promise<void>;
}

const REST_URL =
	process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const REST_TOKEN =
	process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

class UpstashStore implements RoomStore {
	private url: string;
	private token: string;

	constructor(url: string, token: string) {
		this.url = url;
		this.token = token;
	}

	// Single-command REST call: POST the command as a JSON array.
	private async command(cmd: (string | number)[]): Promise<unknown> {
		const res = await fetch(this.url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(cmd),
		});
		if (!res.ok) throw new Error(`Store error ${res.status}`);
		const data = (await res.json()) as { result: unknown };
		return data.result;
	}

	async get(key: string): Promise<string | null> {
		const r = await this.command(["GET", key]);
		return typeof r === "string" ? r : null;
	}

	async set(key: string, value: string, ttlSeconds: number): Promise<void> {
		await this.command(["SET", key, value, "EX", ttlSeconds]);
	}
}

class MemoryStore implements RoomStore {
	private data = new Map<string, { value: string; expires: number }>();

	async get(key: string): Promise<string | null> {
		const e = this.data.get(key);
		if (!e) return null;
		if (Date.now() > e.expires) {
			this.data.delete(key);
			return null;
		}
		return e.value;
	}

	async set(key: string, value: string, ttlSeconds: number): Promise<void> {
		this.data.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
	}
}

// The dev server reloads this module on edit; park the memory store on
// globalThis so rooms survive reloads within one `vite dev` process.
const g = globalThis as typeof globalThis & { __roomStore?: RoomStore };

export function getStore(): RoomStore {
	if (!g.__roomStore) {
		g.__roomStore =
			REST_URL && REST_TOKEN
				? new UpstashStore(REST_URL, REST_TOKEN)
				: new MemoryStore();
	}
	return g.__roomStore;
}
