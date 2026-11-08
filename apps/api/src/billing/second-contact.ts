import { Injectable, OnModuleInit } from '@nestjs/common';
import { ContactEvents } from '@all-in-one/api/auth';
import { BillingService } from './billing.service';

/** Grants the second-contact week when an account confirms its phone or email (directive 121). */
@Injectable()
export class SecondContactWeek implements OnModuleInit {
  constructor(
    private readonly events: ContactEvents,
    private readonly billing: BillingService,
  ) {}

  onModuleInit(): void {
    this.events.onConfirmed((userId) =>
      this.billing.grantSecondContact(userId),
    );
  }
}
