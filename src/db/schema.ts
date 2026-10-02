import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const items = pgTable("items", {
  id: serial("id").primaryKey(),
  url: text("url").notNull().unique(),
  store: text("store").notNull(),
  title: text("title"),
  image: text("image"),
  variant: text("variant"),
  currency: text("currency"),
  // Price at the time the item was added; the default alert threshold is relative to this.
  baselinePrice: doublePrecision("baseline_price").notNull(),
  targetPrice: doublePrecision("target_price"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceChecks = pgTable(
  "price_checks",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    ok: boolean("ok").notNull(),
    method: text("method"),
    price: doublePrecision("price"),
    regularPrice: doublePrecision("regular_price"),
    inStock: boolean("in_stock"),
    promoText: jsonb("promo_text").$type<string[]>(),
    failureReason: text("failure_reason"),
    failureDetail: text("failure_detail"),
  },
  (table) => [index("price_checks_item_checked_idx").on(table.itemId, table.checkedAt)],
);

export type Item = typeof items.$inferSelect;
export type PriceCheck = typeof priceChecks.$inferSelect;
