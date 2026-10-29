import type { CefrLevel } from '@all-in-one/applets/english-learning/contracts';

export interface SeedWord {
  term: string;
  partOfSpeech: string;
  meaningFa: string;
  example: string;
  exampleFa: string;
}

export interface SeedDeck {
  slug: string;
  title: string;
  description: string;
  level: CefrLevel;
  words: SeedWord[];
}

const w = (
  term: string,
  partOfSpeech: string,
  meaningFa: string,
  example: string,
  exampleFa: string,
): SeedWord => ({
  term,
  partOfSpeech,
  meaningFa,
  example,
  exampleFa,
});

export const ENGLISH_DECKS: SeedDeck[] = [
  {
    slug: 'daily-life-a1',
    title: 'زندگی روزمره',
    description: 'واژه‌های پرکاربرد برای صحبت درباره روز و کارهای معمول.',
    level: 'A1',
    words: [
      w(
        'wake up',
        'phrasal verb',
        'بیدار شدن',
        'I wake up at seven every day.',
        'هر روز ساعت هفت بیدار می‌شوم.',
      ),
      w(
        'breakfast',
        'noun',
        'صبحانه',
        'We have breakfast together.',
        'با هم صبحانه می‌خوریم.',
      ),
      w(
        'busy',
        'adjective',
        'سرشلوغ؛ مشغول',
        "I'm very busy today.",
        'امروز سرم خیلی شلوغ است.',
      ),
      w('hungry', 'adjective', 'گرسنه', 'Are you hungry?', 'گرسنه‌ای؟'),
      w(
        'tired',
        'adjective',
        'خسته',
        'She is tired after work.',
        'او بعد از کار خسته است.',
      ),
      w(
        'weekend',
        'noun',
        'آخر هفته',
        'See you at the weekend.',
        'آخر هفته می‌بینمت.',
      ),
      w(
        'neighbor',
        'noun',
        'همسایه',
        'Our neighbor is very kind.',
        'همسایه‌مان خیلی مهربان است.',
      ),
      w(
        'borrow',
        'verb',
        'قرض گرفتن',
        'Can I borrow your pen?',
        'می‌توانم خودکارت را قرض بگیرم؟',
      ),
      w(
        'cheap',
        'adjective',
        'ارزان',
        'This shirt is cheap.',
        'این پیراهن ارزان است.',
      ),
      w(
        'expensive',
        'adjective',
        'گران',
        'The hotel is too expensive.',
        'هتل خیلی گران است.',
      ),
      w('early', 'adverb', 'زود', 'I go to bed early.', 'زود می‌خوابم.'),
      w('late', 'adjective', 'دیر', "Sorry, I'm late.", 'ببخشید، دیر کردم.'),
    ],
  },
  {
    slug: 'travel-a2',
    title: 'سفر',
    description: 'واژه‌های فرودگاه، هتل و گردش در شهر.',
    level: 'A2',
    words: [
      w(
        'luggage',
        'noun',
        'بار سفر؛ چمدان',
        'My luggage is too heavy.',
        'بارم خیلی سنگین است.',
      ),
      w(
        'passport',
        'noun',
        'گذرنامه',
        "Don't forget your passport.",
        'گذرنامه‌ات را فراموش نکن.',
      ),
      w(
        'delay',
        'noun',
        'تأخیر',
        'There is a two-hour delay.',
        'دو ساعت تأخیر هست.',
      ),
      w(
        'book',
        'verb',
        'رزرو کردن',
        'I booked a room online.',
        'اتاق را اینترنتی رزرو کردم.',
      ),
      w(
        'departure',
        'noun',
        'حرکت؛ عزیمت',
        'Departure is at 9 a.m.',
        'حرکت ساعت ۹ صبح است.',
      ),
      w(
        'arrival',
        'noun',
        'رسیدن؛ ورود',
        'Our arrival time is noon.',
        'ساعت رسیدن ما ظهر است.',
      ),
      w(
        'sightseeing',
        'noun',
        'گشت‌وگذار و دیدن جاهای دیدنی',
        'We went sightseeing in Isfahan.',
        'در اصفهان به گشت‌وگذار رفتیم.',
      ),
      w(
        'souvenir',
        'noun',
        'سوغاتی',
        'I bought a souvenir for my mother.',
        'برای مادرم سوغاتی خریدم.',
      ),
      w(
        'currency',
        'noun',
        'ارز؛ واحد پول',
        'What currency do they use?',
        'آنجا از چه ارزی استفاده می‌کنند؟',
      ),
      w(
        'reservation',
        'noun',
        'رزرو',
        'I have a reservation for two nights.',
        'برای دو شب رزرو دارم.',
      ),
      w(
        'landmark',
        'noun',
        'مکان شاخص؛ نماد',
        'Azadi Tower is a famous landmark.',
        'برج آزادی یک نماد مشهور است.',
      ),
      w(
        'round trip',
        'noun',
        'رفت و برگشت',
        'A round trip ticket, please.',
        'یک بلیت رفت و برگشت، لطفاً.',
      ),
    ],
  },
  {
    slug: 'health-fitness-a2',
    title: 'سلامت و ورزش',
    description: 'واژه‌های بدن، تغذیه و تمرین؛ همراه با اپلت سلامت.',
    level: 'A2',
    words: [
      w(
        'healthy',
        'adjective',
        'سالم',
        'Fruit is a healthy snack.',
        'میوه یک میان‌وعده سالم است.',
      ),
      w(
        'exercise',
        'verb',
        'ورزش کردن',
        'I exercise three times a week.',
        'هفته‌ای سه بار ورزش می‌کنم.',
      ),
      w(
        'muscle',
        'noun',
        'عضله',
        'Squats build leg muscles.',
        'اسکات عضلات پا را تقویت می‌کند.',
      ),
      w(
        'diet',
        'noun',
        'رژیم غذایی',
        'She follows a balanced diet.',
        'او رژیم غذایی متعادلی دارد.',
      ),
      w(
        'weight',
        'noun',
        'وزن',
        'He wants to lose weight.',
        'او می‌خواهد وزن کم کند.',
      ),
      w(
        'stretch',
        'verb',
        'حرکات کششی انجام دادن',
        'Always stretch after running.',
        'همیشه بعد از دویدن حرکات کششی انجام بده.',
      ),
      w(
        'injury',
        'noun',
        'آسیب‌دیدگی',
        'Warm up to avoid injury.',
        'برای جلوگیری از آسیب‌دیدگی گرم کن.',
      ),
      w(
        'breathe',
        'verb',
        'نفس کشیدن',
        'Breathe slowly and deeply.',
        'آرام و عمیق نفس بکش.',
      ),
      w(
        'protein',
        'noun',
        'پروتئین',
        'Eggs are rich in protein.',
        'تخم‌مرغ سرشار از پروتئین است.',
      ),
      w(
        'habit',
        'noun',
        'عادت',
        'Walking every day is a good habit.',
        'پیاده‌روی روزانه عادت خوبی است.',
      ),
      w(
        'recover',
        'verb',
        'بهبود یافتن؛ ریکاوری کردن',
        'Muscles recover while you sleep.',
        'عضلات در خواب ریکاوری می‌کنند.',
      ),
      w(
        'balanced',
        'adjective',
        'متعادل',
        'A balanced meal has vegetables and protein.',
        'یک وعده متعادل سبزیجات و پروتئین دارد.',
      ),
    ],
  },
  {
    slug: 'work-b1',
    title: 'کار و محیط اداری',
    description: 'واژه‌های جلسه، پروژه و ارتباط کاری.',
    level: 'B1',
    words: [
      w(
        'deadline',
        'noun',
        'مهلت نهایی',
        'The deadline is next Monday.',
        'مهلت نهایی دوشنبه آینده است.',
      ),
      w(
        'colleague',
        'noun',
        'همکار',
        'My colleagues are very helpful.',
        'همکارانم خیلی کمک می‌کنند.',
      ),
      w(
        'schedule',
        'noun',
        'برنامه زمانی',
        "Let's check the schedule.",
        'بیایید برنامه زمانی را بررسی کنیم.',
      ),
      w(
        'promotion',
        'noun',
        'ارتقای شغلی؛ ترفیع',
        'She got a promotion last year.',
        'او پارسال ترفیع گرفت.',
      ),
      w(
        'salary',
        'noun',
        'حقوق',
        'The salary is paid monthly.',
        'حقوق ماهانه پرداخت می‌شود.',
      ),
      w(
        'apply for',
        'phrasal verb',
        'درخواست دادن برای',
        'I applied for a new job.',
        'برای یک کار جدید درخواست دادم.',
      ),
      w(
        'responsible',
        'adjective',
        'مسئول',
        'Who is responsible for this project?',
        'چه کسی مسئول این پروژه است؟',
      ),
      w(
        'achieve',
        'verb',
        'به دست آوردن؛ رسیدن به',
        'We achieved our goals this quarter.',
        'این فصل به اهدافمان رسیدیم.',
      ),
      w(
        'negotiate',
        'verb',
        'مذاکره کردن',
        'They negotiated a better price.',
        'آن‌ها برای قیمت بهتر مذاکره کردند.',
      ),
      w(
        'feedback',
        'noun',
        'بازخورد',
        'Thanks for your feedback.',
        'ممنون از بازخوردتان.',
      ),
      w(
        'resign',
        'verb',
        'استعفا دادن',
        'He resigned from his job.',
        'او از کارش استعفا داد.',
      ),
      w(
        'attend',
        'verb',
        'شرکت کردن (در جلسه)',
        'I will attend the meeting.',
        'در جلسه شرکت می‌کنم.',
      ),
    ],
  },
];
