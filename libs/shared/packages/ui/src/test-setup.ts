import '@angular/compiler';
import '@analogjs/vitest-angular/setup-snapshots';
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';
import { loadMessages } from '@all-in-one/localization';

setupTestBed({ zoneless: true });

// AioLocale starts loading the lazy message table; finish it here so no test file ends with the import
// still in flight (Vitest then fails the run with EnvironmentTeardownError).
await loadMessages();
