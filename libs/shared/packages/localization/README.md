# Application localization

`@all-in-one/localization` contains the shared Persian/English message catalog and
pure formatting/translation helpers. It has no Angular or server dependencies.
Translations ship with the application; there is no runtime translation API.

The Angular `AioLocale` service and `aioTranslate` pipe are exported by
`@all-in-one/ui`. The language picker persists the explicit choice in a same-site
cookie and local storage, across public, customer and admin paths. SSR reads the
request cookie. Routes must never change the preference.

Use the shared pipe for interface copy and built-in catalogs. Keep input values,
IDs, URLs and user-authored content outside translation. Message placeholders are
positional (`{0}`, `{1}`); pass values separately. Keep `Poshtetgarm` unchanged.
Use `AioLocale.number` and `.date` for display; API dates remain ISO. Both locales
retain the Solar Hijri calendar, with their own month labels and digit shaping.

Spartan wrappers, portalled dialogs, calendar labels, validation feedback and
Sonner notifications use the same preference. The HTTP interceptor includes the
language for AI requests and device push registration. The API keeps AI language
in request-local async context and stores each push subscription's language.
Migration `20261102080000_bilingual_push_language` is applied by the existing
CI/deployment migration step; existing subscriptions default to Persian.
