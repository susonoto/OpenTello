import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Short-lived relay for end-to-end encrypted messages. The server only ever sees an
// opaque room tag and ciphertext; rows are purged after a few seconds of relay time.
export const relay = pgTable(
  "relay",
  {
    id: serial().primaryKey(),
    room: text().notNull(), // SHA-256 tag derived from the room secret, not the secret itself
    data: text().notNull(), // base64 AES-GCM ciphertext (iv + payload)
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("relay_room_id_idx").on(t.room, t.id), index("relay_created_at_idx").on(t.createdAt)],
);
