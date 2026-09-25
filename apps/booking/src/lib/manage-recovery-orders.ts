import { z } from "zod";

export const recoveryOrdersSchema = z.object({
  next: z.string().url().nullable(),
  results: z.array(z.object({
    code: z.string(),
    event: z.string(),
    status: z.string(),
    email: z.string(),
    url: z.string().url(),
    positions: z.array(z.object({ item: z.number().int(), canceled: z.boolean().optional() })),
  })),
});

export type RecoveryOrder = z.infer<typeof recoveryOrdersSchema>["results"][number];

export function recoveryLinks(orders: RecoveryOrder[], email: string, event: string, itemId: number, shopBase: URL) {
  return orders.filter((order) =>
    order.event === event && order.status === "p" && order.email.trim().toLowerCase() === email &&
    order.positions.length > 0 && order.positions.every((position) => position.item === itemId && !position.canceled),
  ).map((order) => {
    const url = new URL(order.url);
    if (url.origin !== shopBase.origin || !url.pathname.startsWith(shopBase.pathname.replace(/\/$/, "") + "/")) {
      throw new Error("Unexpected pretix order URL");
    }
    return { code: order.code, url: url.toString() };
  });
}
