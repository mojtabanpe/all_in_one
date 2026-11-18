import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '@all-in-one/api/auth';
import {
  onboardingInputSchema,
  onboardingSourceSchema,
  type OnboardingInput,
  type OnboardingSourceInput,
} from '@all-in-one/shared/schemas';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  state(@CurrentUser() user: AuthUser) {
    return this.onboarding.state(user.id);
  }

  @Put()
  choose(
    @CurrentUser() user: AuthUser,
    @Body({ schema: onboardingInputSchema }) input: OnboardingInput,
  ) {
    return this.onboarding.choose(user.id, input);
  }

  @Put('source')
  source(
    @CurrentUser() user: AuthUser,
    @Body({ schema: onboardingSourceSchema })
    input: OnboardingSourceInput,
  ) {
    return this.onboarding.source(user.id, input);
  }
}
