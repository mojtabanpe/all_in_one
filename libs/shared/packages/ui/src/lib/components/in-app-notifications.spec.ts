import { TestBed } from '@angular/core/testing';
import { AioInAppNotifications } from './in-app-notifications';

describe('in-app notification queue', () => {
  it('deduplicates pending messages and advances after dismissal', () => {
    TestBed.configureTestingModule({ providers: [AioInAppNotifications] });
    const queue = TestBed.inject(AioInAppNotifications);
    const onDismiss = vi.fn();
    const first = {
      id: 'trial',
      title: 'Trial',
      message: 'Ending',
      actions: [],
      onDismiss,
    };
    queue.enqueue(first);
    queue.enqueue(first);
    queue.enqueue({ ...first, id: 'second', onDismiss: undefined });
    expect(queue.current()?.id).toBe('trial');
    queue.dismiss();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(queue.current()?.id).toBe('second');
    queue.dismiss();
    expect(queue.current()).toBeNull();
  });
});
