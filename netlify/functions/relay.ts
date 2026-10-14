import type { Config } from "@netlify/functions";
import { and, asc, eq, gt, lt, max, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { relay } from "../../db/schema.js";

// Ciphertext is only kept long enough for online members to pick it up.
const TTL_SECONDS = 60;
const MAX_DATA = 8000;
const ROOM_RE = /^[a-f0-9]{64}$/;

const noStore = { "Cache-Control": "no-store" };

function purge() {
  return db.delete(relay).where(lt(relay.createdAt, sql`now() - make_interval(secs => ${TTL_SECONDS})`));
}

export default async (req: Request) => {
  if (req.method === "GET") {
    const params = new URL(req.url).searchParams;
    const room = params.get("room") ?? "";
    if (!ROOM_RE.test(room)) return new Response("Invalid room", { status: 400 });

    const after = Number(params.get("after"));
    if (!Number.isInteger(after) || after < 0) {
      // First poll: return only a cursor so newcomers never receive earlier messages.
      const [row] = await db.select({ cursor: max(relay.id) }).from(relay);
      return Response.json({ cursor: row?.cursor ?? 0, items: [] }, { headers: noStore });
    }

    const items = await db
      .select({ id: relay.id, data: relay.data })
      .from(relay)
      .where(and(eq(relay.room, room), gt(relay.id, after)))
      .orderBy(asc(relay.id))
      .limit(200);
    const cursor = items.length ? items[items.length - 1].id : after;
    return Response.json({ cursor, items }, { headers: noStore });
  }

  if (req.method === "POST") {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }
    const room = typeof body?.room === "string" ? body.room : "";
    const data = typeof body?.data === "string" ? body.data : "";
    if (!ROOM_RE.test(room)) return new Response("Invalid room", { status: 400 });
    if (!data || data.length > MAX_DATA || !/^[A-Za-z0-9+/=]+$/.test(data)) {
      return new Response("Invalid payload", { status: 400 });
    }

    const [row] = await db.insert(relay).values({ room, data }).returning({ id: relay.id });
    await purge();
    return Response.json({ id: row.id }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/relay",
};
