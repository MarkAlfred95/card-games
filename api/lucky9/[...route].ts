// Vercel serverless catch-all for the online Lucky 9 API. All real logic
// lives in server/lucky9.ts (shared with the vite dev middleware); this file
// only adapts Vercel's Node request/response to `dispatch`.

import { dispatch } from "../../server/lucky9.js";

// Typed loosely to avoid a @vercel/node dependency; the fields used are stable.
interface VercelReq {
	method?: string;
	url?: string;
	body?: unknown;
}
interface VercelRes {
	statusCode: number;
	setHeader(name: string, value: string): void;
	end(chunk: string): void;
}

export default async function handler(req: VercelReq, res: VercelRes) {
	const url = new URL(req.url ?? "/", "http://localhost");
	const path = url.pathname.replace(/^\/api\/lucky9\/?/, "");
	const out = await dispatch(
		req.method ?? "GET",
		path,
		Object.fromEntries(url.searchParams),
		// Vercel parses JSON bodies automatically.
		(req.body as Parameters<typeof dispatch>[3]) ?? null,
	);
	res.statusCode = out.status;
	res.setHeader("content-type", "application/json");
	res.end(JSON.stringify(out.body));
}
