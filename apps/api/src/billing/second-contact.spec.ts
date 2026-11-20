import type { ContactEvents } from '@all-in-one/api/auth';
import type { PrismaService } from '@all-in-one/api/db';
import type { BillingService } from './billing.service';
import { SecondContactWeek } from './second-contact';

describe('SecondContactWeek', () => {
  function setup(granted: boolean) {
    let listener: (userId: string) => Promise<boolean> = async () => false;
    const upsert = vi.fn().mockResolvedValue({});
    const week = new SecondContactWeek(
      {
        onConfirmed: (l: typeof listener) => (listener = l),
      } as unknown as ContactEvents,
      {
        grantSecondContact: vi.fn().mockResolvedValue(granted),
      } as unknown as BillingService,
      { inAppNotification: { upsert } } as unknown as PrismaService,
    );
    week.onModuleInit();
    return { confirm: (id: string) => listener(id), upsert };
  }

  it('tells the customer once the week is added', async () => {
    const { confirm, upsert } = setup(true);
    await expect(confirm('u1')).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledOnce();
    expect(upsert.mock.calls[0][0].where).toEqual({
      userId_key: { userId: 'u1', key: 'reward:SECOND_CONTACT' },
    });
  });

  it('says nothing when no week was granted', async () => {
    const { confirm, upsert } = setup(false);
    await expect(confirm('u1')).resolves.toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });
});
