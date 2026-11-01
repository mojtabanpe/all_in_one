# Shared template compositions

Owner directive 67: similar template code used in more than two places belongs in
`libs/shared/packages`, with differences expressed as inputs. Import these components
from `@all-in-one/ui`. They compose the existing Spartan wrappers and retain the
current theme, language direction and loading geometry.

| Pattern                                  | Component                | Inputs / extension points                                                              |
| ---------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| Feature navigation cards (customer home) | `a[aioNavigationCard]`   | title, icon, description, action, loading; native RouterLink/href and accent class     |
| Card title and description               | `[aioCardHeading]`       | title, description, heading level/id, typography classes; projected additions          |
| Page/section title and actions           | `[aioSectionHeading]`    | title, description, loading, heading level/id, text classes; projected actions         |
| Labeled form field                       | `aio-form-field`         | label, controlId; projected native controls, Signal Forms bindings and help text       |
| Validation messages                      | `aio-form-errors`        | errors from a Signal Forms field                                                       |
| Native selection field                   | `aio-select-field`       | label, controlId, options, value, object keys or enum labels, empty label; valueChange |
| Numeric Signal Forms field               | `aio-number-field`       | label, controlId, field, step, inputMode, showErrors                                   |
| Input-group add/submit action            | `aio-input-group-submit` | label, icon; native submit button                                                      |
| Empty state                              | `[aioEmptyState]`        | title, description, icon, heading level; projected actions                             |
| Button with pending state                | `button[aioAsyncButton]` | label, busy, busyLabel, icon, variant, size; native disabled/type/click/form           |
| Text skeleton                            | `[aioSkeletonLines]`     | array of line classes                                                                  |
| Repeated skeleton rows                   | `[aioSkeletonRows]`      | count, itemClass; host controls grid/flex spacing                                      |
| Statistic / definition                   | `[aioMetric]`            | label, value, loading, icon, order, definition mode, typography                        |
| Read-only catalog                        | `[aioCatalogCard]`       | title, description, typed item list with optional descriptions/badges                  |

Keep data fetching, applet-specific operations and translation in the consuming
page. Register dynamic icons with `provideIcons` in that page, as with `aio-icon`.
Pass localized text into the components: English routes remain English-only/LTR.

The native-host components intentionally use attribute selectors so links keep
RouterLink and buttons retain submit, disabled and keyboard behavior without an
extra DOM wrapper. Form controls projected into `aio-form-field` retain their
original Signal Forms binding; `aio-number-field` accepts that same field object.

When adding a third occurrence, update or reuse the corresponding composition
instead of copying its inner template. Preserve heading levels, label/control IDs,
loading dimensions and action handlers during extraction. The shared composition
tests cover these behaviors, including numeric values and native selection.
