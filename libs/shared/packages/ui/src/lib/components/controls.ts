import { booleanAttribute, Component, input, model } from '@angular/core';
import type {
  FormCheckboxControl,
  FormValueControl,
} from '@angular/forms/signals';
import { HlmCheckbox } from '@spartan-ng/helm/checkbox';
import { HlmNativeSelect } from '@spartan-ng/helm/native-select';
import { HlmSwitch } from '@spartan-ng/helm/switch';
import { NATIVE_SELECT_MATERIAL } from '../material';

/** Wraps spartan `hlm-checkbox`. Works with Signal Forms `[formField]` and `[(checked)]`. */
@Component({
  selector: 'aio-checkbox',
  imports: [HlmCheckbox],
  template: `
    <hlm-checkbox
      [checked]="checked()"
      (checkedChange)="checked.set($event)"
      [disabled]="disabled()"
      [inputId]="inputId()"
      [name]="name() || null"
      [required]="required()"
      [forceInvalid]="invalid()"
      [aria-label]="ariaLabel()"
      [class]="checkboxClass()"
    />
  `,
})
export class AioCheckbox implements FormCheckboxControl {
  /** Extra classes for the box itself, e.g. `rounded-full size-5` for round task checkboxes. */
  readonly checkboxClass = input('');
  readonly checked = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly required = input(false, { transform: booleanAttribute });
  readonly inputId = input<string | null>(null);
  readonly name = input('');
  readonly ariaLabel = input<string | null>(null, { alias: 'aria-label' });
}

/** Wraps spartan `hlm-switch`. Works with Signal Forms `[formField]` and `[(checked)]`. */
@Component({
  selector: 'aio-switch',
  imports: [HlmSwitch],
  template: `
    <hlm-switch
      [checked]="checked()"
      (checkedChange)="checked.set($event)"
      [disabled]="disabled()"
      [inputId]="inputId()"
      [forceInvalid]="invalid()"
      [aria-label]="ariaLabel()"
    />
  `,
})
export class AioSwitch implements FormCheckboxControl {
  readonly checked = model(false);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null, { alias: 'aria-label' });
}

let nextSelectId = 0;

/**
 * Wraps spartan `hlm-native-select` (native picker: best on phones).
 * Project `<option aioNativeSelectOption>` children.
 */
@Component({
  selector: 'aio-native-select',
  imports: [HlmNativeSelect],
  template: `
    <hlm-native-select
      [value]="value()"
      (valueChange)="value.set($event ?? '')"
      [disabled]="disabled()"
      [forceInvalid]="invalid()"
      [selectId]="selectId()"
      [size]="size()"
      [selectClass]="material"
    >
      <ng-content />
    </hlm-native-select>
  `,
})
export class AioNativeSelect implements FormValueControl<string> {
  readonly value = model('');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  readonly selectId = input<string>(`aio-native-select-${nextSelectId++}`);
  readonly size = input<'sm' | 'default'>('default');
  protected readonly material = NATIVE_SELECT_MATERIAL;
}
