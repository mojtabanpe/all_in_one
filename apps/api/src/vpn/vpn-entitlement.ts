import { addMonths } from '../billing/billing.service';

const BYTES_PER_MONTH = 50 * 1024 ** 3;

interface Order {
  id: string;
  paidAt: Date | null;
  months: number;
  status: string;
}

interface Adjustment {
  createdAt: Date;
  newUntil: Date;
}

export function vpnEntitlement(
  paidUntil: Date | undefined,
  orders: Order[],
  adjustments: Adjustment[],
  now: Date,
) {
  if (!paidUntil || paidUntil <= now) return null;

  const events = [
    ...orders.flatMap((order) =>
      order.paidAt ? [{ at: order.paidAt, order }] : [],
    ),
    ...adjustments.map(({ createdAt, newUntil }) => ({
      at: createdAt,
      newUntil,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  let cycle = '';
  let months = 0;
  let until = new Date(0);
  for (const event of events) {
    if (event.at >= until) {
      cycle = '';
      months = 0;
    }
    if ('order' in event) {
      const { order } = event;
      cycle ||= order.id;
      until = addMonths(event.at > until ? event.at : until, order.months);
      if (order.status === 'PAID') months += order.months;
    } else {
      until = event.newUntil;
    }
  }
  if (!cycle || months <= 0 || until <= now) return null;
  return {
    cycle,
    quotaBytes: months * BYTES_PER_MONTH,
    expiresAt: paidUntil.getTime(),
  };
}
