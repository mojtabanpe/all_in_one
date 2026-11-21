import { vpnEntitlement } from './vpn-entitlement';

const gb = 1024 ** 3;
const date = (value: string) => new Date(value + 'T12:00:00Z');
const purchase = (
  id: string,
  paid: string,
  months: number,
  status = 'PAID',
) => ({
  id,
  paidAt: date(paid),
  months,
  status,
});

describe('private VPN entitlement', () => {
  it('grants 50 GB for each month of a purchase', () => {
    const paidUntil = date('2027-02-21');
    expect(
      vpnEntitlement(
        paidUntil,
        [purchase('order', '2026-11-21', 3)],
        [],
        date('2026-11-21'),
      ),
    ).toEqual({
      cycle: 'order',
      quotaBytes: 150 * gb,
      expiresAt: paidUntil.getTime(),
    });
  });

  it('carries forward the quota during continuous renewals and starts a fresh cycle after a lapse', () => {
    const orders = [
      purchase('first', '2026-07-01', 1),
      purchase('early', '2026-07-31', 1),
    ];
    expect(
      vpnEntitlement(date('2026-09-01'), orders, [], date('2026-08-03')),
    ).toMatchObject({ cycle: 'first', quotaBytes: 100 * gb });
    expect(
      vpnEntitlement(
        date('2026-10-03'),
        [...orders, purchase('later', '2026-09-03', 1)],
        [],
        date('2026-09-04'),
      ),
    ).toMatchObject({ cycle: 'later', quotaBytes: 50 * gb });
  });

  it('takes away the volume of fully refunded orders and requires a current paid period', () => {
    const orders = [
      purchase('first', '2026-07-01', 1),
      purchase('refund', '2026-07-31', 1, 'REFUNDED'),
    ];
    expect(
      vpnEntitlement(date('2026-09-01'), orders, [], date('2026-08-03')),
    ).toMatchObject({ cycle: 'first', quotaBytes: 50 * gb });
    expect(
      vpnEntitlement(date('2026-08-01'), orders, [], date('2026-08-03')),
    ).toBeNull();
    expect(
      vpnEntitlement(date('2026-09-01'), [], [], date('2026-08-03')),
    ).toBeNull();
  });

  it('does not carry quota past an early termination', () => {
    const orders = [
      purchase('first', '2026-07-01', 3),
      purchase('later', '2026-07-16', 1),
    ];
    const adjustments = [
      { createdAt: date('2026-07-15'), newUntil: date('2026-07-15') },
    ];
    expect(
      vpnEntitlement(
        date('2026-08-16'),
        orders,
        adjustments,
        date('2026-07-17'),
      ),
    ).toMatchObject({ cycle: 'later', quotaBytes: 50 * gb });
  });
});
