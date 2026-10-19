import {
  FEEDBACK_SEQ_START,
  formatTaskKey,
  type FeedbackActivityData,
  type FeedbackDevice,
  type FeedbackStatus,
  type FeedbackType,
} from '@kite/shared';
import { uuidv7 } from 'uuidv7';
import type * as schema from '../schema/index.js';
import type { PersonRef, Text } from './data.js';
import type { Clock } from './dates.js';

type Row<T extends { $inferInsert: unknown }> = T['$inferInsert'];

interface Ctx {
  clock: Clock;
  pick: (text: Text) => string;
  workspaceId: string;
  user: (ref: PersonRef) => { id: string };
  task: (ref: string) => { row: { id?: string; number: number; title: string; projectId: string } };
  projectKey: (projectId: string) => string;
}

const IPHONE: FeedbackDevice = {
  browser: 'Safari 17.4',
  os: 'iOS 17.4',
  device: 'iPhone',
  kind: 'mobile',
  screen: '390×844',
  viewport: '390×664',
  language: 'mn-MN',
  timezone: 'Asia/Ulaanbaatar',
};
const ANDROID: FeedbackDevice = {
  browser: 'Chrome 128',
  os: 'Android 14',
  device: 'SM-A546B',
  kind: 'mobile',
  screen: '412×915',
  viewport: '412×780',
  language: 'mn-MN',
  timezone: 'Asia/Ulaanbaatar',
};
const DESKTOP: FeedbackDevice = {
  browser: 'Chrome 128',
  os: 'Windows 10/11',
  device: null,
  kind: 'desktop',
  screen: '1920×1080',
  viewport: '1536×864',
  language: 'en-US',
  timezone: 'Asia/Ulaanbaatar',
};
const TABLET: FeedbackDevice = {
  ...IPHONE,
  os: 'iPadOS 17.4',
  device: 'iPad',
  kind: 'tablet',
  screen: '820×1180',
  viewport: '820×1100',
};

interface FeedbackDef {
  type: FeedbackType;
  status: FeedbackStatus;
  read: boolean;
  title: Text;
  body: Text;
  name: Text | null;
  email: string;
  phone?: string;
  hoursAgo: number;
  device: FeedbackDevice;
  /** Linked task (seed ref) and who linked it. */
  task?: { ref: string; by: PersonRef };
  /** Who moved it to review / closed it. */
  by?: PersonRef;
  files?: { filename: string; mime: string; size: number }[];
  notes?: [PersonRef, Text][];
  /** Refs (by index in FEEDBACK) found similar when it arrived. */
  similar?: number[];
}

/**
 * Feedback inbox sample from Feedback.dc.html / FeedbackDetail / FeedbackDuplicates / TaskDetail
 * (drawn on Oct 19; seeded relative to now), oldest first: numbers follow. Four reports share the
 * Checkout task (APP-142) for the duplicates banner and the task drawer's "Linked feedback".
 */
const FEEDBACK: FeedbackDef[] = [
  {
    type: 'other',
    status: 'closed',
    read: true,
    title: ['Ажлын байрны зар байна уу?', 'Are you hiring?'],
    body: [
      'Танай багт дизайнераар орох сонирхолтой байна. Портфолиогоо хаана илгээх вэ?',
      'I’d love to join your team as a designer. Where can I send my portfolio?',
    ],
    name: ['Энэрэл О.', 'Enerel O.'],
    email: 'enerel.o@gmail.com',
    hoursAgo: 270,
    device: DESKTOP,
    by: 'anu',
  },
  {
    type: 'feedback',
    status: 'closed',
    read: true,
    title: ['Төлбөр хийх хурдан болсон', 'Checkout feels much faster now'],
    body: [
      'Өмнөхөөсөө хоёр алхам цөөхөн болсон нь их таалагдлаа. Баярлалаа!',
      'Love that there are two fewer steps than before. Thank you!',
    ],
    name: ['Ариунаа Б.', 'Ariunaa B.'],
    email: 'ariunaa@gmail.com',
    hoursAgo: 245,
    device: IPHONE,
    by: 'bat',
  },
  {
    type: 'bug',
    status: 'closed',
    read: true,
    title: ['Нэвтрэх код ирэхгүй байна', 'Login code never arrives'],
    body: [
      'Unitel дугаар дээр SMS ирээгүй. Одоо зассан байна, баярлалаа.',
      'No SMS on my Unitel number. It works now, thanks.',
    ],
    name: ['Золбоо Х.', 'Zolboo Kh.'],
    email: 'zolboo.kh@gmail.com',
    phone: '8811 4455',
    hoursAgo: 220,
    device: ANDROID,
    by: 'bat',
  },
  {
    type: 'bug',
    status: 'linked',
    read: true,
    title: [
      'Нийт дүнг харахын тулд хажуу тийш гүйлгэх хэрэгтэй',
      'Have to scroll sideways to see the total',
    ],
    body: [
      'Android 14, Samsung A54. Төлбөрийн хуудсанд нийт дүн дэлгэцээс гарчихаж байна.',
      'Android 14, Samsung A54. On the checkout page the total runs off the screen.',
    ],
    name: ['Гэрэл С.', 'Gerel S.'],
    email: 'gerel.s@gmail.com',
    hoursAgo: 200,
    device: ANDROID,
    task: { ref: 'checkout-responsive', by: 'dorj' },
  },
  {
    type: 'feature',
    status: 'review',
    read: true,
    title: ['Хүргэлтийн явцыг харах', 'Let me track my delivery'],
    body: [
      'Захиалга хаана явааг газрын зураг дээр харж болох уу?',
      'Can I see where my order is on a map?',
    ],
    name: ['Мөнх-Эрдэнэ С.', 'Munkh-Erdene S.'],
    email: 'munkh.s@gmail.com',
    hoursAgo: 170,
    device: IPHONE,
    by: 'anu',
  },
  {
    type: 'feedback',
    status: 'linked',
    read: true,
    title: ['Бүтээгдэхүүний зураг жижиг байна', 'Product photos feel small'],
    body: [
      'Жагсаалтад зургийг томруулж харах боломжгүй байна.',
      'There’s no way to see a bigger photo from the list.',
    ],
    name: ['Түвшин Э.', 'Tuvshin E.'],
    email: 'tuvshin.e@gmail.com',
    hoursAgo: 150,
    device: ANDROID,
    task: { ref: 'product-card', by: 'sara' },
  },
  {
    type: 'feedback',
    status: 'linked',
    read: true,
    title: ['Таблет дээр төлбөрийн хуудас уншихад хэцүү', 'Checkout is hard to read on my tablet'],
    body: [
      'iPad дээр бичиг жижиг, товчнууд хоорондоо хэт ойрхон байна.',
      'On my iPad the text is tiny and the buttons are too close together.',
    ],
    name: ['Оюун-Эрдэнэ Д.', 'Oyun-Erdene D.'],
    email: 'oyunerdene.d@gmail.com',
    hoursAgo: 130,
    device: TABLET,
    task: { ref: 'checkout-responsive', by: 'dorj' },
  },
  {
    type: 'feature',
    status: 'review',
    read: true,
    title: ['Бараан горим хэрэгтэй байна', 'Dark mode, please'],
    body: ['Шөнө дэлгэц хэт гэрэлтэй байна.', 'The screen is too bright at night.'],
    name: ['Хулан М.', 'Khulan M.'],
    email: 'khulan.m@gmail.com',
    hoursAgo: 115,
    device: IPHONE,
    by: 'sara',
    notes: [
      [
        'sara',
        ['Бараан горимын токенууд энэ спринтэд бэлэн болно.', 'Dark mode tokens land this sprint.'],
      ],
    ],
  },
  {
    type: 'feature',
    status: 'linked',
    read: true,
    title: ['Сагсаа дараа нь үргэлжлүүлэх', 'Save my cart for later'],
    body: [
      'Утсаараа нэмсэн барааг компьютер дээрээ үргэлжлүүлэн авмаар байна.',
      'I want to add on my phone and finish on my laptop.',
    ],
    name: ['Номин А.', 'Nomin A.'],
    email: 'nomin.a@gmail.com',
    hoursAgo: 100,
    device: DESKTOP,
    task: { ref: 'prd-saved-carts', by: 'anu' },
  },
  {
    type: 'bug',
    status: 'review',
    read: true,
    title: [
      'Үсгийн алдаатай хайлтад хоосон дэлгэц гарч байна',
      'Search shows a blank screen for typos',
    ],
    body: [
      '“гуталл” гэж хайхад юу ч гарахгүй, буцах товч ч алга.',
      'Searching “shooes” shows nothing, not even a back button.',
    ],
    name: ['Билгүүн Т.', 'Bilguun T.'],
    email: 'bilguun.t@gmail.com',
    hoursAgo: 95,
    device: IPHONE,
    by: 'bat',
    files: [{ filename: 'search-empty.png', mime: 'image/png', size: 182 * 1024 }],
  },
  {
    type: 'bug',
    status: 'linked',
    read: true,
    title: ['Сагсны тоо шинэчлэгдэхгүй байна', 'Cart badge count doesn’t update'],
    body: [
      'Бараа нэмсний дараа доод цэсний тоо хуучнаараа үлдэж байна.',
      'After adding an item the number on the bottom bar stays the same.',
    ],
    name: ['Ганбат Ж.', 'Ganbat J.'],
    email: 'ganbat.j@gmail.com',
    hoursAgo: 80,
    device: ANDROID,
    task: { ref: 'cart-badge', by: 'tem' },
    files: [{ filename: 'cart-badge.png', mime: 'image/png', size: 96 * 1024 }],
  },
  {
    type: 'bug',
    status: 'linked',
    read: true,
    title: [
      'Захиалгын хураангуй картын маягттай давхцаж байна',
      'Order summary overlaps the card form on small phones',
    ],
    body: [
      'iPhone SE дээр захиалгын хураангуй картын дугаарын талбарыг дарж байна.',
      'On my iPhone SE the order summary covers the card number field.',
    ],
    name: ['Батзориг М.', 'Batzorig M.'],
    email: 'batzorig.m@gmail.com',
    hoursAgo: 50,
    device: IPHONE,
    task: { ref: 'checkout-responsive', by: 'dorj' },
  },
  {
    type: 'other',
    status: 'new',
    read: false,
    title: ['Байгууллагын нэхэмжлэх авч болох уу?', 'Can I get a company invoice?'],
    body: [
      'Компанийн нэрээр худалдан авалт хийсэн, НӨАТ-ын баримт хэрэгтэй.',
      'I bought on behalf of my company and need a VAT receipt.',
    ],
    name: ['Оюунаа Г.', 'Oyunaa G.'],
    email: 'oyunaa@company.mn',
    phone: '9900 1122',
    hoursAgo: 30,
    device: DESKTOP,
  },
  {
    type: 'bug',
    status: 'new',
    read: false,
    title: [
      '24-өөс урт промо код таслагдаж байна',
      'Promo codes longer than 24 characters get cut off',
    ],
    body: [
      'Түнш компанийн код оруулахад сүүлийн тэмдэгтүүд харагдахгүй байна.',
      'When I enter a partner code the last characters don’t show.',
    ],
    name: ['Тэмүүжин Н.', 'Temuujin N.'],
    email: 'temuujin.n@yahoo.com',
    hoursAgo: 22,
    device: ANDROID,
    files: [{ filename: 'promo-field.png', mime: 'image/png', size: 74 * 1024 }],
  },
  {
    type: 'feedback',
    status: 'new',
    read: false,
    title: ['Шинэ нүүр хуудас их гоё болсон', 'Love the new home page'],
    body: [
      'Бүтээгдэхүүнүүд илүү том, ойлгомжтой харагдаж байна. Баярлалаа!',
      'Products look bigger and clearer now. Thank you!',
    ],
    name: ['Сарнай Б.', 'Sarnai B.'],
    email: 'sarnai.b@gmail.com',
    hoursAgo: 6,
    device: IPHONE,
  },
  {
    type: 'bug',
    status: 'new',
    read: false,
    title: ['Төлбөр төлөх алхам дээр апп гацаж байна', 'App freezes on the payment step'],
    body: [
      'iPhone 13, iOS 17. Карт сонгоод “Төлөх” дарахад дэлгэц хөдлөхгүй болж байна.\n\nАлхмууд:\n1. Сагсанд бараа нэмэх\n2. Төлбөр рүү орох\n3. Карт сонгоод “Төлөх” дарах\n\nАпп бүрэн гацаж, дахин нээх хэрэгтэй болдог.',
      'iPhone 13, iOS 17. After choosing a card and tapping “Pay” the screen stops responding.\n\nSteps:\n1. Add an item to the cart\n2. Go to checkout\n3. Choose a card and tap “Pay”\n\nThe app freezes completely and I have to restart it.',
    ],
    name: ['Энхжин Д.', 'Enkhjin D.'],
    email: 'enkhjin.d@gmail.com',
    phone: '+976 9911 2233',
    hoursAgo: 3,
    device: IPHONE,
    files: [
      { filename: 'payment-frozen.png', mime: 'image/png', size: 1.2 * 1024 * 1024 },
      { filename: 'card-picker.png', mime: 'image/png', size: 980 * 1024 },
      { filename: 'screen-recording.mov', mime: 'video/quicktime', size: 4.2 * 1024 * 1024 },
    ],
  },
  {
    type: 'feature',
    status: 'new',
    read: false,
    title: ['QPay-ээр төлөх боломж нэмээч', 'Please add QPay as a payment option'],
    body: [
      'Ихэнх найзууд маань QPay ашигладаг. Карт байхгүй үед их хэрэгтэй.',
      'Most of my friends use QPay — really useful when you don’t have a card.',
    ],
    name: ['Батбаяр Ц.', 'Batbayar Ts.'],
    email: 'batbayar@mail.mn',
    hoursAgo: 2,
    device: ANDROID,
  },
  {
    type: 'bug',
    status: 'linked',
    read: true,
    title: [
      'iPhone SE дээр Төлөх товч гарын ард нуугдаж байна',
      'Pay button hidden behind keyboard on iPhone SE',
    ],
    body: [
      'Картын дугаар оруулахад гар гарч ирээд Төлөх товчийг бүрэн далдалж байна.',
      'When I type my card number the keyboard covers the Pay button completely.',
    ],
    name: null,
    email: 'tsetseg.b@gmail.com',
    hoursAgo: 1,
    device: IPHONE,
    task: { ref: 'checkout-responsive', by: 'dorj' },
    similar: [11],
  },
];

/** Feedback rows, files (no blobs: downloads answer FILE_MISSING) and their logs. */
export function buildFeedback(ctx: Ctx) {
  const { clock, pick, workspaceId, user, task, projectKey } = ctx;
  const feedback: Row<typeof schema.feedback>[] = [];
  const files: Row<typeof schema.feedbackAttachments>[] = [];
  const log: Row<typeof schema.feedbackActivity>[] = [];
  const ids: string[] = [];
  const at = (hoursAgo: number, plusMinutes = 0) =>
    new Date(clock.now.getTime() - hoursAgo * 3_600_000 + plusMinutes * 60_000);

  FEEDBACK.forEach((def, i) => {
    const id = uuidv7();
    ids.push(id);
    const number = FEEDBACK_SEQ_START + 27 + i;
    const created = at(def.hoursAgo);
    const linked = def.task ? task(def.task.ref).row : null;
    const snapshot = linked && {
      id: linked.id ?? '',
      key: formatTaskKey(projectKey(linked.projectId), linked.number),
      title: linked.title,
    };
    feedback.push({
      id,
      workspaceId,
      number,
      type: def.type,
      status: def.status,
      title: pick(def.title),
      body: pick(def.body),
      submitterName: def.name ? pick(def.name) : null,
      email: def.email,
      phone: def.phone ?? null,
      userAgent: '',
      device: def.device,
      taskId: snapshot?.id ?? null,
      isRead: def.read,
      createdAt: created,
      updatedAt: created,
    });
    for (const f of def.files ?? []) {
      const fileId = uuidv7();
      files.push({
        id: fileId,
        workspaceId,
        feedbackId: id,
        uploadTokenHash: '',
        filename: f.filename,
        mime: f.mime,
        size: Math.round(f.size),
        storageKey: `${workspaceId}/feedback/${fileId}`,
        createdAt: created,
      });
    }

    const entry = (
      minutes: number,
      kind: Row<typeof schema.feedbackActivity>['kind'],
      actor: PersonRef | null,
      data: FeedbackActivityData = {},
      text: string | null = null,
    ) =>
      log.push({
        id: uuidv7(),
        feedbackId: id,
        actorId: actor ? user(actor).id : null,
        kind,
        data,
        text,
        createdAt: at(def.hoursAgo, minutes),
      });
    entry(0, 'created', null);
    if (def.similar?.length) {
      entry(0.01, 'similar_found', null, {
        similar: def.similar.map((j) => ({
          id: ids[j] ?? '',
          ref: `FB-${FEEDBACK_SEQ_START + 27 + j}`,
        })),
      });
    }
    if (def.task && snapshot) {
      entry(25, 'linked', def.task.by, {
        task: snapshot,
        statusSet: true,
        from: 'new',
        to: 'linked',
      });
    } else if (def.status !== 'new' && def.by) {
      entry(40, 'status_change', def.by, { from: 'new', to: def.status });
    }
    def.notes?.forEach(([by, text], n) => entry(60 + n, 'note', by, {}, pick(text)));
  });

  return {
    feedback,
    feedbackAttachments: files,
    feedbackActivity: log,
    feedbackSeq: FEEDBACK_SEQ_START + 26 + FEEDBACK.length,
  };
}
