import type {
  ActivityCategory,
  ProgramExercise,
  WorkoutProgram,
} from '@all-in-one/applets/health/contracts';

export const ACTIVITY_TYPES: {
  slug: string;
  name: string;
  category: ActivityCategory;
  met: number;
  icon: string;
}[] = [
  {
    slug: 'gym',
    name: 'باشگاه (بدنسازی)',
    category: 'gym',
    met: 5,
    icon: 'lucideDumbbell',
  },
  { slug: 'trx', name: 'TRX', category: 'trx', met: 6, icon: 'lucideActivity' },
  {
    slug: 'walking',
    name: 'پیاده‌روی',
    category: 'cardio',
    met: 3.5,
    icon: 'lucideFootprints',
  },
  {
    slug: 'running',
    name: 'دویدن',
    category: 'cardio',
    met: 8,
    icon: 'lucideZap',
  },
  {
    slug: 'cycling',
    name: 'دوچرخه‌سواری',
    category: 'cardio',
    met: 7,
    icon: 'lucideBike',
  },
  {
    slug: 'swimming',
    name: 'شنا',
    category: 'cardio',
    met: 7,
    icon: 'lucideWaves',
  },
  {
    slug: 'hiking',
    name: 'کوهنوردی',
    category: 'cardio',
    met: 6.5,
    icon: 'lucideMountain',
  },
  {
    slug: 'home-workout',
    name: 'ورزش در خانه',
    category: 'home',
    met: 5,
    icon: 'lucideHouse',
  },
  {
    slug: 'jump-rope',
    name: 'طناب‌زنی',
    category: 'home',
    met: 10,
    icon: 'lucideTimer',
  },
  {
    slug: 'football',
    name: 'فوتبال',
    category: 'sport',
    met: 7,
    icon: 'lucideTrophy',
  },
  {
    slug: 'volleyball',
    name: 'والیبال',
    category: 'sport',
    met: 4,
    icon: 'lucideTrophy',
  },
  {
    slug: 'basketball',
    name: 'بسکتبال',
    category: 'sport',
    met: 6.5,
    icon: 'lucideTrophy',
  },
  {
    slug: 'yoga',
    name: 'یوگا',
    category: 'mind',
    met: 2.5,
    icon: 'lucideFlower2',
  },
  {
    slug: 'stretching',
    name: 'حرکات کششی',
    category: 'mind',
    met: 2.3,
    icon: 'lucideStretchHorizontal',
  },
];

const ex = (
  name: string,
  o: Omit<ProgramExercise, 'name'> = {},
): ProgramExercise => ({ name, ...o });

export const WORKOUT_PROGRAMS: WorkoutProgram[] = [
  {
    slug: 'trx-beginner-full-body',
    title: 'TRX مبتدی: تمام بدن',
    activitySlug: 'trx',
    level: 'beginner',
    description:
      'سه جلسه در هفته. هر حرکت را با کنترل انجام دهید؛ برای سخت‌تر شدن، پاها را به نقطه اتصال نزدیک‌تر کنید.',
    sessionsPerWeek: 3,
    minutes: 30,
    exercises: [
      ex('پارویی TRX (TRX Row)', { sets: 3, reps: 12, restSeconds: 60 }),
      ex('پرس سینه TRX (Chest Press)', { sets: 3, reps: 10, restSeconds: 60 }),
      ex('اسکات TRX', { sets: 3, reps: 12, restSeconds: 60 }),
      ex('لانج TRX', {
        sets: 3,
        reps: 10,
        restSeconds: 60,
        note: 'هر پا ۱۰ تکرار',
      }),
      ex('جلوبازو TRX (Biceps Curl)', { sets: 3, reps: 12, restSeconds: 45 }),
      ex('پلانک با TRX', { sets: 3, seconds: 30, restSeconds: 45 }),
    ],
  },
  {
    slug: 'home-no-equipment-20',
    title: '۲۰ دقیقه در خانه، بدون وسیله',
    activitySlug: 'home-workout',
    level: 'beginner',
    description:
      'سه دور از این مدار را پشت سر هم انجام دهید و بین دورها ۱ دقیقه استراحت کنید.',
    sessionsPerWeek: 4,
    minutes: 20,
    exercises: [
      ex('جامپینگ جک', { seconds: 45 }),
      ex('اسکات با وزن بدن', { reps: 15 }),
      ex('شنا سوئدی (روی زانو هم قبول است)', { reps: 10 }),
      ex('پل باسن (Glute Bridge)', { reps: 15 }),
      ex('کوهنورد (Mountain Climber)', { seconds: 30 }),
      ex('پلانک', { seconds: 30, restSeconds: 60 }),
    ],
  },
  {
    slug: 'gym-full-body-3-day',
    title: 'باشگاه مبتدی: فول‌بادی سه‌روزه',
    activitySlug: 'gym',
    level: 'beginner',
    description:
      'یک روز در میان. وزنه را طوری انتخاب کنید که دو تکرار آخر سخت باشد ولی فرم حرکت حفظ شود.',
    sessionsPerWeek: 3,
    minutes: 60,
    exercises: [
      ex('پرس پا', { sets: 3, reps: 12, restSeconds: 90 }),
      ex('زیربغل سیم‌کش (Lat Pulldown)', {
        sets: 3,
        reps: 10,
        restSeconds: 90,
      }),
      ex('پرس سینه دمبل', { sets: 3, reps: 10, restSeconds: 90 }),
      ex('روئینگ سیم‌کش نشسته', { sets: 3, reps: 12, restSeconds: 90 }),
      ex('پرس سرشانه دمبل', { sets: 3, reps: 10, restSeconds: 90 }),
      ex('پلانک', { sets: 3, seconds: 40, restSeconds: 60 }),
    ],
  },
  {
    slug: 'walking-4-weeks',
    title: 'پیاده‌روی تدریجی: چهار هفته',
    activitySlug: 'walking',
    level: 'beginner',
    description:
      'هفته‌ای پنج روز. هر هفته کمی طولانی‌تر و تندتر؛ با سرعتی که بتوانید هنوز حرف بزنید.',
    sessionsPerWeek: 5,
    minutes: 30,
    exercises: [
      ex('هفته ۱: پیاده‌روی آرام', { seconds: 20 * 60 }),
      ex('هفته ۲: پیاده‌روی با سرعت معمولی', { seconds: 25 * 60 }),
      ex('هفته ۳: پیاده‌روی تند', { seconds: 30 * 60 }),
      ex('هفته ۴: پیاده‌روی تند با ۵ دقیقه سربالایی', { seconds: 35 * 60 }),
    ],
  },
  {
    slug: 'running-from-zero',
    title: 'دویدن از صفر: تا ۲۰ دقیقه پیوسته',
    activitySlug: 'running',
    level: 'beginner',
    description:
      'هفته‌ای سه جلسه، با ۵ دقیقه پیاده‌روی برای گرم کردن و سرد کردن. اگر جلسه‌ای سخت بود، آن هفته را تکرار کنید.',
    sessionsPerWeek: 3,
    minutes: 30,
    exercises: [
      ex('هفته ۱ و ۲: ۸ بار (۱ دقیقه دویدن + ۲ دقیقه راه رفتن)'),
      ex('هفته ۳ و ۴: ۶ بار (۲ دقیقه دویدن + ۲ دقیقه راه رفتن)'),
      ex('هفته ۵: ۴ بار (۴ دقیقه دویدن + ۲ دقیقه راه رفتن)'),
      ex('هفته ۶: ۳ بار (۶ دقیقه دویدن + ۱ دقیقه راه رفتن)'),
      ex('هفته ۷ و ۸: ۲۰ دقیقه دویدن پیوسته'),
    ],
  },
  {
    slug: 'yoga-morning-15',
    title: 'یوگای صبحگاهی ۱۵ دقیقه',
    activitySlug: 'yoga',
    level: 'beginner',
    description: 'هر صبح، آرام و با تنفس عمیق. هر وضعیت را بدون درد نگه دارید.',
    sessionsPerWeek: 5,
    minutes: 15,
    exercises: [
      ex('وضعیت کودک (Child’s Pose)', { seconds: 60 }),
      ex('گربه و گاو (Cat–Cow)', { reps: 10 }),
      ex('سگ رو به پایین (Downward Dog)', { seconds: 45 }),
      ex('جنگجو ۲، هر طرف', { seconds: 45 }),
      ex('پیچش نشسته، هر طرف', { seconds: 30 }),
      ex('شاواسانا (آرامش نهایی)', { seconds: 120 }),
    ],
  },
];
