import { Injectable, Logger } from '@nestjs/common';

/** Returns true when it granted something the person should hear about (e.g. a free week). */
export type ContactConfirmedListener = (userId: string) => Promise<boolean>;

/**
 * Tells other parts of the api that an account confirmed a phone (SMS code) or an email (link), without the auth
 * library depending on them. Billing listens to grant the second-contact week (directive 121).
 */
@Injectable()
export class ContactEvents {
  private readonly logger = new Logger(ContactEvents.name);
  private readonly listeners: ContactConfirmedListener[] = [];

  onConfirmed(listener: ContactConfirmedListener): void {
    this.listeners.push(listener);
  }

  /** A failing listener never undoes the confirmation that triggered it. */
  async confirmed(userId: string): Promise<boolean> {
    let granted = false;
    for (const listener of this.listeners) {
      try {
        if (await listener(userId)) granted = true;
      } catch (error) {
        this.logger.warn(
          'Contact confirmation listener failed: ' + (error as Error).message,
        );
      }
    }
    return granted;
  }
}
