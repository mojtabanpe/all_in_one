/** English-only CEFR starter decks and exact legacy presentation mappings.
 * Legacy mappings preserve existing user storage and review schedules.
 */
import type {
  DeckColor,
  StarterDeck,
} from '@all-in-one/applets/english-learning/contracts';
export interface SeedWord {
  term: string;
  partOfSpeech: string;
  definition: string;
  example: string;
}
export interface SeedDeck {
  slug: string;
  color?: DeckColor;
  title: string;
  description: string;
  level: StarterDeck['level'];
  words: SeedWord[];
}
export const ENGLISH_DECKS: SeedDeck[] = [
  {
    slug: 'daily-life-a1',
    title: 'Daily life',
    description:
      'Common words for talking about your day and everyday activities.',
    level: 'A1',
    words: [
      {
        term: 'wake up',
        partOfSpeech: 'phrasal verb',
        definition: 'To stop sleeping.',
        example: 'I wake up at seven every day.',
      },
      {
        term: 'breakfast',
        partOfSpeech: 'noun',
        definition: 'The meal you eat in the morning.',
        example: 'We have breakfast together.',
      },
      {
        term: 'busy',
        partOfSpeech: 'adjective',
        definition: 'Having a lot of things to do.',
        example: "I'm very busy today.",
      },
      {
        term: 'hungry',
        partOfSpeech: 'adjective',
        definition: 'Wanting or needing food.',
        example: 'Are you hungry?',
      },
      {
        term: 'tired',
        partOfSpeech: 'adjective',
        definition: 'Needing rest or sleep.',
        example: 'She is tired after work.',
      },
      {
        term: 'weekend',
        partOfSpeech: 'noun',
        definition: 'Saturday and Sunday, or the days when you do not work.',
        example: 'See you at the weekend.',
      },
      {
        term: 'neighbor',
        partOfSpeech: 'noun',
        definition: 'A person who lives near you.',
        example: 'Our neighbor is very kind.',
      },
      {
        term: 'borrow',
        partOfSpeech: 'verb',
        definition:
          'To use something that belongs to someone else and return it later.',
        example: 'Can I borrow your pen?',
      },
      {
        term: 'cheap',
        partOfSpeech: 'adjective',
        definition: 'Costing little money.',
        example: 'This shirt is cheap.',
      },
      {
        term: 'expensive',
        partOfSpeech: 'adjective',
        definition: 'Costing a lot of money.',
        example: 'The hotel is too expensive.',
      },
      {
        term: 'early',
        partOfSpeech: 'adverb',
        definition: 'Before the usual or expected time.',
        example: 'I go to bed early.',
      },
      {
        term: 'late',
        partOfSpeech: 'adjective',
        definition: 'Arriving after the expected time.',
        example: "Sorry, I'm late.",
      },
    ],
  },
  {
    slug: 'travel-a2',
    title: 'Travel',
    description: 'Vocabulary for airports, hotels and exploring a city.',
    level: 'A2',
    words: [
      {
        term: 'luggage',
        partOfSpeech: 'noun',
        definition: 'Bags and suitcases you take when travelling.',
        example: 'My luggage is too heavy.',
      },
      {
        term: 'passport',
        partOfSpeech: 'noun',
        definition:
          'An official document that lets you travel to other countries.',
        example: "Don't forget your passport.",
      },
      {
        term: 'delay',
        partOfSpeech: 'noun',
        definition: 'A period of waiting before something happens.',
        example: 'There is a two-hour delay.',
      },
      {
        term: 'book',
        partOfSpeech: 'verb',
        definition: 'To arrange and pay for a room, seat or ticket in advance.',
        example: 'I booked a room online.',
      },
      {
        term: 'departure',
        partOfSpeech: 'noun',
        definition: 'The act of leaving a place.',
        example: 'Departure is at 9 a.m.',
      },
      {
        term: 'arrival',
        partOfSpeech: 'noun',
        definition: 'The act of reaching a place.',
        example: 'Our arrival time is noon.',
      },
      {
        term: 'sightseeing',
        partOfSpeech: 'noun',
        definition: 'Visiting interesting places as a tourist.',
        example: 'We went sightseeing in Isfahan.',
      },
      {
        term: 'souvenir',
        partOfSpeech: 'noun',
        definition: 'Something you buy to remember a place or trip.',
        example: 'I bought a souvenir for my mother.',
      },
      {
        term: 'currency',
        partOfSpeech: 'noun',
        definition: 'The money used in a country.',
        example: 'What currency do they use?',
      },
      {
        term: 'reservation',
        partOfSpeech: 'noun',
        definition: 'An arrangement to keep a room, table or seat for you.',
        example: 'I have a reservation for two nights.',
      },
      {
        term: 'landmark',
        partOfSpeech: 'noun',
        definition: 'A well-known building or place that is easy to recognise.',
        example: 'Azadi Tower is a famous landmark.',
      },
      {
        term: 'round trip',
        partOfSpeech: 'noun',
        definition: 'A journey to a place and back again.',
        example: 'A round trip ticket, please.',
      },
    ],
  },
  {
    slug: 'health-fitness-a2',
    title: 'Health and fitness',
    description: 'Words for your body, nutrition and exercise.',
    level: 'A2',
    words: [
      {
        term: 'healthy',
        partOfSpeech: 'adjective',
        definition: 'Good for your body or mind.',
        example: 'Fruit is a healthy snack.',
      },
      {
        term: 'exercise',
        partOfSpeech: 'verb',
        definition: 'To do physical activity to stay fit.',
        example: 'I exercise three times a week.',
      },
      {
        term: 'muscle',
        partOfSpeech: 'noun',
        definition: 'A part of your body that makes it move.',
        example: 'Squats build leg muscles.',
      },
      {
        term: 'diet',
        partOfSpeech: 'noun',
        definition: 'The food and drink you usually have.',
        example: 'She follows a balanced diet.',
      },
      {
        term: 'weight',
        partOfSpeech: 'noun',
        definition: 'How heavy someone or something is.',
        example: 'He wants to lose weight.',
      },
      {
        term: 'stretch',
        partOfSpeech: 'verb',
        definition: 'To extend your body or muscles to make them less tight.',
        example: 'Always stretch after running.',
      },
      {
        term: 'injury',
        partOfSpeech: 'noun',
        definition: 'Physical damage to your body.',
        example: 'Warm up to avoid injury.',
      },
      {
        term: 'breathe',
        partOfSpeech: 'verb',
        definition: 'To take air into your lungs and let it out.',
        example: 'Breathe slowly and deeply.',
      },
      {
        term: 'protein',
        partOfSpeech: 'noun',
        definition: 'A nutrient your body uses to build and repair tissue.',
        example: 'Eggs are rich in protein.',
      },
      {
        term: 'habit',
        partOfSpeech: 'noun',
        definition: 'Something you do regularly, often without thinking.',
        example: 'Walking every day is a good habit.',
      },
      {
        term: 'recover',
        partOfSpeech: 'verb',
        definition: 'To become healthy or strong again.',
        example: 'Muscles recover while you sleep.',
      },
      {
        term: 'balanced',
        partOfSpeech: 'adjective',
        definition: 'Having different parts in suitable amounts.',
        example: 'A balanced meal has vegetables and protein.',
      },
    ],
  },
  {
    slug: 'work-b1',
    title: 'Work and office',
    description:
      'Vocabulary for meetings, projects and workplace communication.',
    level: 'B1',
    words: [
      {
        term: 'deadline',
        partOfSpeech: 'noun',
        definition: 'The latest time or date when something must be finished.',
        example: 'The deadline is next Monday.',
      },
      {
        term: 'colleague',
        partOfSpeech: 'noun',
        definition: 'A person you work with.',
        example: 'My colleagues are very helpful.',
      },
      {
        term: 'schedule',
        partOfSpeech: 'noun',
        definition: 'A plan showing when activities will happen.',
        example: "Let's check the schedule.",
      },
      {
        term: 'promotion',
        partOfSpeech: 'noun',
        definition: 'A move to a more important job.',
        example: 'She got a promotion last year.',
      },
      {
        term: 'salary',
        partOfSpeech: 'noun',
        definition: 'The money you receive regularly for your work.',
        example: 'The salary is paid monthly.',
      },
      {
        term: 'apply for',
        partOfSpeech: 'phrasal verb',
        definition: 'To make a formal request for something, such as a job.',
        example: 'I applied for a new job.',
      },
      {
        term: 'responsible',
        partOfSpeech: 'adjective',
        definition: 'Having a duty to take care of something.',
        example: 'Who is responsible for this project?',
      },
      {
        term: 'achieve',
        partOfSpeech: 'verb',
        definition: 'To succeed in doing or getting something.',
        example: 'We achieved our goals this quarter.',
      },
      {
        term: 'negotiate',
        partOfSpeech: 'verb',
        definition: 'To discuss something to reach an agreement.',
        example: 'They negotiated a better price.',
      },
      {
        term: 'feedback',
        partOfSpeech: 'noun',
        definition: 'Comments about how well someone has done something.',
        example: 'Thanks for your feedback.',
      },
      {
        term: 'resign',
        partOfSpeech: 'verb',
        definition: 'To formally leave your job.',
        example: 'He resigned from his job.',
      },
      {
        term: 'attend',
        partOfSpeech: 'verb',
        definition: 'To be present at an event or meeting.',
        example: 'I will attend the meeting.',
      },
    ],
  },
];
const LEGACY_DECKS = [
  {
    name: 'زندگی روزمره',
    description: 'واژه‌های پرکاربرد برای صحبت درباره روز و کارهای معمول.',
    englishName: 'Daily life',
    englishDescription:
      'Common words for talking about your day and everyday activities.',
  },
  {
    name: 'سفر',
    description: 'واژه‌های فرودگاه، هتل و گردش در شهر.',
    englishName: 'Travel',
    englishDescription: 'Vocabulary for airports, hotels and exploring a city.',
  },
  {
    name: 'سلامت و ورزش',
    description: 'واژه‌های بدن، تغذیه و تمرین؛ همراه با اپلت سلامت.',
    englishName: 'Health and fitness',
    englishDescription: 'Words for your body, nutrition and exercise.',
  },
  {
    name: 'کار و محیط اداری',
    description: 'واژه‌های جلسه، پروژه و ارتباط کاری.',
    englishName: 'Work and office',
    englishDescription:
      'Vocabulary for meetings, projects and workplace communication.',
  },
];
const LEGACY_CARDS = [
  {
    front: 'wake up',
    back: 'بیدار شدن',
    examples:
      '- I wake up at seven every day.\n- هر روز ساعت هفت بیدار می‌شوم.',
    definition: 'To stop sleeping.',
    englishExamples: '- I wake up at seven every day.',
  },
  {
    front: 'breakfast',
    back: 'صبحانه',
    examples: '- We have breakfast together.\n- با هم صبحانه می‌خوریم.',
    definition: 'The meal you eat in the morning.',
    englishExamples: '- We have breakfast together.',
  },
  {
    front: 'busy',
    back: 'سرشلوغ؛ مشغول',
    examples: "- I'm very busy today.\n- امروز سرم خیلی شلوغ است.",
    definition: 'Having a lot of things to do.',
    englishExamples: "- I'm very busy today.",
  },
  {
    front: 'hungry',
    back: 'گرسنه',
    examples: '- Are you hungry?\n- گرسنه‌ای؟',
    definition: 'Wanting or needing food.',
    englishExamples: '- Are you hungry?',
  },
  {
    front: 'tired',
    back: 'خسته',
    examples: '- She is tired after work.\n- او بعد از کار خسته است.',
    definition: 'Needing rest or sleep.',
    englishExamples: '- She is tired after work.',
  },
  {
    front: 'weekend',
    back: 'آخر هفته',
    examples: '- See you at the weekend.\n- آخر هفته می‌بینمت.',
    definition: 'Saturday and Sunday, or the days when you do not work.',
    englishExamples: '- See you at the weekend.',
  },
  {
    front: 'neighbor',
    back: 'همسایه',
    examples: '- Our neighbor is very kind.\n- همسایه‌مان خیلی مهربان است.',
    definition: 'A person who lives near you.',
    englishExamples: '- Our neighbor is very kind.',
  },
  {
    front: 'borrow',
    back: 'قرض گرفتن',
    examples: '- Can I borrow your pen?\n- می‌توانم خودکارت را قرض بگیرم؟',
    definition:
      'To use something that belongs to someone else and return it later.',
    englishExamples: '- Can I borrow your pen?',
  },
  {
    front: 'cheap',
    back: 'ارزان',
    examples: '- This shirt is cheap.\n- این پیراهن ارزان است.',
    definition: 'Costing little money.',
    englishExamples: '- This shirt is cheap.',
  },
  {
    front: 'expensive',
    back: 'گران',
    examples: '- The hotel is too expensive.\n- هتل خیلی گران است.',
    definition: 'Costing a lot of money.',
    englishExamples: '- The hotel is too expensive.',
  },
  {
    front: 'early',
    back: 'زود',
    examples: '- I go to bed early.\n- زود می‌خوابم.',
    definition: 'Before the usual or expected time.',
    englishExamples: '- I go to bed early.',
  },
  {
    front: 'late',
    back: 'دیر',
    examples: "- Sorry, I'm late.\n- ببخشید، دیر کردم.",
    definition: 'Arriving after the expected time.',
    englishExamples: "- Sorry, I'm late.",
  },
  {
    front: 'luggage',
    back: 'بار سفر؛ چمدان',
    examples: '- My luggage is too heavy.\n- بارم خیلی سنگین است.',
    definition: 'Bags and suitcases you take when travelling.',
    englishExamples: '- My luggage is too heavy.',
  },
  {
    front: 'passport',
    back: 'گذرنامه',
    examples: "- Don't forget your passport.\n- گذرنامه‌ات را فراموش نکن.",
    definition: 'An official document that lets you travel to other countries.',
    englishExamples: "- Don't forget your passport.",
  },
  {
    front: 'delay',
    back: 'تأخیر',
    examples: '- There is a two-hour delay.\n- دو ساعت تأخیر هست.',
    definition: 'A period of waiting before something happens.',
    englishExamples: '- There is a two-hour delay.',
  },
  {
    front: 'book',
    back: 'رزرو کردن',
    examples: '- I booked a room online.\n- اتاق را اینترنتی رزرو کردم.',
    definition: 'To arrange and pay for a room, seat or ticket in advance.',
    englishExamples: '- I booked a room online.',
  },
  {
    front: 'departure',
    back: 'حرکت؛ عزیمت',
    examples: '- Departure is at 9 a.m.\n- حرکت ساعت ۹ صبح است.',
    definition: 'The act of leaving a place.',
    englishExamples: '- Departure is at 9 a.m.',
  },
  {
    front: 'arrival',
    back: 'رسیدن؛ ورود',
    examples: '- Our arrival time is noon.\n- ساعت رسیدن ما ظهر است.',
    definition: 'The act of reaching a place.',
    englishExamples: '- Our arrival time is noon.',
  },
  {
    front: 'sightseeing',
    back: 'گشت‌وگذار و دیدن جاهای دیدنی',
    examples:
      '- We went sightseeing in Isfahan.\n- در اصفهان به گشت‌وگذار رفتیم.',
    definition: 'Visiting interesting places as a tourist.',
    englishExamples: '- We went sightseeing in Isfahan.',
  },
  {
    front: 'souvenir',
    back: 'سوغاتی',
    examples:
      '- I bought a souvenir for my mother.\n- برای مادرم سوغاتی خریدم.',
    definition: 'Something you buy to remember a place or trip.',
    englishExamples: '- I bought a souvenir for my mother.',
  },
  {
    front: 'currency',
    back: 'ارز؛ واحد پول',
    examples:
      '- What currency do they use?\n- آنجا از چه ارزی استفاده می‌کنند؟',
    definition: 'The money used in a country.',
    englishExamples: '- What currency do they use?',
  },
  {
    front: 'reservation',
    back: 'رزرو',
    examples: '- I have a reservation for two nights.\n- برای دو شب رزرو دارم.',
    definition: 'An arrangement to keep a room, table or seat for you.',
    englishExamples: '- I have a reservation for two nights.',
  },
  {
    front: 'landmark',
    back: 'مکان شاخص؛ نماد',
    examples:
      '- Azadi Tower is a famous landmark.\n- برج آزادی یک نماد مشهور است.',
    definition: 'A well-known building or place that is easy to recognise.',
    englishExamples: '- Azadi Tower is a famous landmark.',
  },
  {
    front: 'round trip',
    back: 'رفت و برگشت',
    examples: '- A round trip ticket, please.\n- یک بلیت رفت و برگشت، لطفاً.',
    definition: 'A journey to a place and back again.',
    englishExamples: '- A round trip ticket, please.',
  },
  {
    front: 'healthy',
    back: 'سالم',
    examples: '- Fruit is a healthy snack.\n- میوه یک میان‌وعده سالم است.',
    definition: 'Good for your body or mind.',
    englishExamples: '- Fruit is a healthy snack.',
  },
  {
    front: 'exercise',
    back: 'ورزش کردن',
    examples: '- I exercise three times a week.\n- هفته‌ای سه بار ورزش می‌کنم.',
    definition: 'To do physical activity to stay fit.',
    englishExamples: '- I exercise three times a week.',
  },
  {
    front: 'muscle',
    back: 'عضله',
    examples: '- Squats build leg muscles.\n- اسکات عضلات پا را تقویت می‌کند.',
    definition: 'A part of your body that makes it move.',
    englishExamples: '- Squats build leg muscles.',
  },
  {
    front: 'diet',
    back: 'رژیم غذایی',
    examples: '- She follows a balanced diet.\n- او رژیم غذایی متعادلی دارد.',
    definition: 'The food and drink you usually have.',
    englishExamples: '- She follows a balanced diet.',
  },
  {
    front: 'weight',
    back: 'وزن',
    examples: '- He wants to lose weight.\n- او می‌خواهد وزن کم کند.',
    definition: 'How heavy someone or something is.',
    englishExamples: '- He wants to lose weight.',
  },
  {
    front: 'stretch',
    back: 'حرکات کششی انجام دادن',
    examples:
      '- Always stretch after running.\n- همیشه بعد از دویدن حرکات کششی انجام بده.',
    definition: 'To extend your body or muscles to make them less tight.',
    englishExamples: '- Always stretch after running.',
  },
  {
    front: 'injury',
    back: 'آسیب‌دیدگی',
    examples:
      '- Warm up to avoid injury.\n- برای جلوگیری از آسیب‌دیدگی گرم کن.',
    definition: 'Physical damage to your body.',
    englishExamples: '- Warm up to avoid injury.',
  },
  {
    front: 'breathe',
    back: 'نفس کشیدن',
    examples: '- Breathe slowly and deeply.\n- آرام و عمیق نفس بکش.',
    definition: 'To take air into your lungs and let it out.',
    englishExamples: '- Breathe slowly and deeply.',
  },
  {
    front: 'protein',
    back: 'پروتئین',
    examples: '- Eggs are rich in protein.\n- تخم‌مرغ سرشار از پروتئین است.',
    definition: 'A nutrient your body uses to build and repair tissue.',
    englishExamples: '- Eggs are rich in protein.',
  },
  {
    front: 'habit',
    back: 'عادت',
    examples:
      '- Walking every day is a good habit.\n- پیاده‌روی روزانه عادت خوبی است.',
    definition: 'Something you do regularly, often without thinking.',
    englishExamples: '- Walking every day is a good habit.',
  },
  {
    front: 'recover',
    back: 'بهبود یافتن؛ ریکاوری کردن',
    examples:
      '- Muscles recover while you sleep.\n- عضلات در خواب ریکاوری می‌کنند.',
    definition: 'To become healthy or strong again.',
    englishExamples: '- Muscles recover while you sleep.',
  },
  {
    front: 'balanced',
    back: 'متعادل',
    examples:
      '- A balanced meal has vegetables and protein.\n- یک وعده متعادل سبزیجات و پروتئین دارد.',
    definition: 'Having different parts in suitable amounts.',
    englishExamples: '- A balanced meal has vegetables and protein.',
  },
  {
    front: 'deadline',
    back: 'مهلت نهایی',
    examples: '- The deadline is next Monday.\n- مهلت نهایی دوشنبه آینده است.',
    definition: 'The latest time or date when something must be finished.',
    englishExamples: '- The deadline is next Monday.',
  },
  {
    front: 'colleague',
    back: 'همکار',
    examples: '- My colleagues are very helpful.\n- همکارانم خیلی کمک می‌کنند.',
    definition: 'A person you work with.',
    englishExamples: '- My colleagues are very helpful.',
  },
  {
    front: 'schedule',
    back: 'برنامه زمانی',
    examples:
      "- Let's check the schedule.\n- بیایید برنامه زمانی را بررسی کنیم.",
    definition: 'A plan showing when activities will happen.',
    englishExamples: "- Let's check the schedule.",
  },
  {
    front: 'promotion',
    back: 'ارتقای شغلی؛ ترفیع',
    examples: '- She got a promotion last year.\n- او پارسال ترفیع گرفت.',
    definition: 'A move to a more important job.',
    englishExamples: '- She got a promotion last year.',
  },
  {
    front: 'salary',
    back: 'حقوق',
    examples: '- The salary is paid monthly.\n- حقوق ماهانه پرداخت می‌شود.',
    definition: 'The money you receive regularly for your work.',
    englishExamples: '- The salary is paid monthly.',
  },
  {
    front: 'apply for',
    back: 'درخواست دادن برای',
    examples: '- I applied for a new job.\n- برای یک کار جدید درخواست دادم.',
    definition: 'To make a formal request for something, such as a job.',
    englishExamples: '- I applied for a new job.',
  },
  {
    front: 'responsible',
    back: 'مسئول',
    examples:
      '- Who is responsible for this project?\n- چه کسی مسئول این پروژه است؟',
    definition: 'Having a duty to take care of something.',
    englishExamples: '- Who is responsible for this project?',
  },
  {
    front: 'achieve',
    back: 'به دست آوردن؛ رسیدن به',
    examples:
      '- We achieved our goals this quarter.\n- این فصل به اهدافمان رسیدیم.',
    definition: 'To succeed in doing or getting something.',
    englishExamples: '- We achieved our goals this quarter.',
  },
  {
    front: 'negotiate',
    back: 'مذاکره کردن',
    examples:
      '- They negotiated a better price.\n- آن‌ها برای قیمت بهتر مذاکره کردند.',
    definition: 'To discuss something to reach an agreement.',
    englishExamples: '- They negotiated a better price.',
  },
  {
    front: 'feedback',
    back: 'بازخورد',
    examples: '- Thanks for your feedback.\n- ممنون از بازخوردتان.',
    definition: 'Comments about how well someone has done something.',
    englishExamples: '- Thanks for your feedback.',
  },
  {
    front: 'resign',
    back: 'استعفا دادن',
    examples: '- He resigned from his job.\n- او از کارش استعفا داد.',
    definition: 'To formally leave your job.',
    englishExamples: '- He resigned from his job.',
  },
  {
    front: 'attend',
    back: 'شرکت کردن (در جلسه)',
    examples: '- I will attend the meeting.\n- در جلسه شرکت می‌کنم.',
    definition: 'To be present at an event or meeting.',
    englishExamples: '- I will attend the meeting.',
  },
];

/** Translate only exact starter content; leave user edits intact. */
export function englishStarterDeck<
  T extends { name: string; description: string },
>(deck: T): T {
  const legacy = LEGACY_DECKS.find((d) => d.name === deck.name);
  return legacy
    ? {
        ...deck,
        name: legacy.englishName,
        description:
          deck.description === legacy.description
            ? legacy.englishDescription
            : deck.description,
      }
    : deck;
}
export function englishStarterCard<
  T extends { front: string; back: string; examples: string },
>(card: T): T {
  const legacy = LEGACY_CARDS.find(
    (c) => c.front === card.front && c.back === card.back,
  );
  return legacy
    ? {
        ...card,
        back: legacy.definition,
        examples:
          card.examples === legacy.examples
            ? legacy.englishExamples
            : card.examples,
      }
    : card;
}
