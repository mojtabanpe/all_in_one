export const PRIVACY_MESSAGES: readonly (readonly [string, string])[] = [
  ['حریم خصوصی و داده‌ها', 'Privacy and data'],
  ['آخرین به‌روزرسانی', 'Last updated'],
  [
    'این صفحه توضیح می‌دهد نسخهٔ فعلی Poshtetgarm چه داده‌هایی را برای حساب، امکانات برنامه و آمار استفاده پردازش می‌کند.',
    'This page explains what data the current version of Poshtetgarm processes for accounts, app features and usage analytics.',
  ],
  ['حساب و محتوای شخصی', 'Account and personal content'],
  [
    'برای حساب، ایمیل، نام اختیاری و نسخهٔ هش‌شدهٔ رمز نگهداری می‌شود. کارها و عادت‌ها، کارت‌ها و سابقهٔ مرور، متن‌ها و داده‌های سلامت مانند وعده‌ها، وزن و تمرین‌هایی که وارد می‌کنی در سرور ذخیره می‌شوند. رمز عبور به‌صورت متن خوانا ذخیره نمی‌شود.',
    'Your account stores your email, optional name and a password hash. Tasks, habits, cards, review history, reading texts and health information you enter, such as meals, weight and workouts, are stored on the server. Passwords are not stored as readable text.',
  ],
  ['دسترسی و اشتراک‌گذاری', 'Access and sharing'],
  [
    'بخش‌های شخصی به نشست حساب نیاز دارند. وقتی از فهرست مشترک برنامه‌ریز استفاده می‌کنی، اعضای همان فهرست طبق سطح دسترسی آن به اطلاعاتش دسترسی دارند. اتصال ChatGPT و دستیار می‌توانند در محدودهٔ دسترسی حساب، داده‌ها را بخوانند یا تغییر دهند.',
    'Personal areas require an account session. Members of a shared planner list can access its information according to their permissions. The ChatGPT connection and assistant can read or change data within your account permissions.',
  ],
  ['اطلاعات روی دستگاه', 'Information on your device'],
  [
    'کوکی ورود برای نگه‌داشتن نشست استفاده می‌شود. انتخاب زبان و شناسهٔ تصادفی آمار هم در مرورگر نگهداری می‌شوند. نسخهٔ نصب‌شدنی، فایل‌های برنامه و آخرین اطلاعات حساب را برای استفادهٔ آفلاین روی دستگاه نگه می‌دارد. روی دستگاه مشترک، پس از استفاده از حساب خارج شو.',
    'A sign-in cookie maintains your session. Your language choice and a random analytics ID are also kept in the browser. The installable app stores application files and the last account profile on your device for offline use. Sign out after using a shared device.',
  ],
  ['آمارگیری خودکار', 'Automatic analytics'],
  [
    'بازدید صفحهٔ معرفی، شروع ثبت‌نام، ساخت حساب و اولین ساخت کار یا مرور موفق کارت با شناسهٔ تصادفی مرورگر، زبان و منبع کمپین ثبت می‌شوند. رویدادهای آمار شامل ایمیل، رمز، متن کارها یا جزئیات سلامت نیستند. رکوردهای آماری قدیمی‌تر از ۹۰ روز در پاک‌سازی خودکار حذف می‌شوند.',
    'Landing visits, registration starts, account creation and the first successful task creation or card review are recorded with a random browser ID, language and campaign source. These analytics events do not include your email, password, task text or health details. Records older than 90 days are removed automatically.',
  ],
  ['سرویس‌های بیرونی', 'External services'],
  [
    'برای ایمیل‌های حساب و اعلان‌های فعال‌شده، دادهٔ لازم به سرویس ارسال مربوط می‌رسد. هنگام استفاده از هوش مصنوعی یا قابلیت‌های گفتاری، متن یا صدای لازم به سرویس تنظیم‌شده فرستاده می‌شود؛ کلیدهای هوش مصنوعی در سرور رمزگذاری می‌شوند. نمایش نشان اینماد نیز تصویری را از سرویس اینماد بارگیری می‌کند. نگهداری داده در سرویس‌های بیرونی تابع تنظیمات و سیاست همان سرویس است.',
    'Account emails and enabled notifications send necessary data to their delivery services. AI and speech features send the text or audio required for the request to the configured service; AI keys are encrypted on the server. Displaying the Enamad seal also loads an image from Enamad. External services retain data according to their own settings and policies.',
  ],
  ['مدت نگهداری', 'Retention'],
  [
    'قاعدهٔ ۹۰ روز مربوط به رویدادهای آمار است؛ برای تمام محتوای حساب، حذف خودکار عمومی تعریف نشده است. ممکن است اطلاعات فنی درخواست، از جمله نشانی IP، در لاگ‌های زیرساخت ثبت شود. این صفحه زمان حذف قطعی لاگ‌های فنی یا نسخه‌های پشتیبان را اعلام نمی‌کند.',
    'The 90-day rule applies to analytics events. There is no general automatic deletion period for all account content. Technical request information, including IP addresses, may be recorded in infrastructure logs. This page does not specify a guaranteed deletion date for technical logs or backups.',
  ],
  ['کنترل‌های فعلی حساب', 'Current account controls'],
  [
    'در حساب کاربری می‌توانی رمز را تغییر بدهی و تنظیمات اعلان و هوش مصنوعی را مدیریت کنی. محتوای بخش‌ها از همان صفحات قابل ویرایش یا حذف است؛ برخی موارد مانند کارهای برنامه‌ریز ابتدا به سطل زباله می‌روند. در این نسخه گزینهٔ حذف کامل حساب از داخل برنامه وجود ندارد.',
    'Account settings let you change your password and manage notifications and AI settings. Content can be edited or deleted within its own area; some items, such as planner tasks, first move to trash. This version does not offer complete account deletion from within the app.',
  ],
];
