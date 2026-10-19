import type { AvatarColor, PaletteKey } from '@kite/shared';
import { createRng } from './random.js';
import { FEMALE_NAMES, FOREIGN_NAMES, MALE_NAMES, PATRONYMICS, transliterate } from './text.js';
import type {
  PersonDef,
  ProjectDef,
  ScenarioDef,
  SpaceDef,
  StandupGroupDef,
  TagDef,
  Topic,
} from './types.js';

// "Altai Group": 120 people in 8 departments, 10 spaces, 60 projects (5 archived), ~25k tasks
// over a year. Engineering spaces run two-week sprints. Planted edge cases: three Bat-Erdenes,
// two Sarangerels (same short name), two Anus, several "Б.Б." initials, nine people who left but
// still own tasks (one still leads a project), people in 20+ projects, 1,000+ task projects.

const rng = createRng(2026);
const AVATARS: readonly AvatarColor[] = [
  'indigo',
  'green',
  'rose',
  'amber',
  'sky',
  'purple',
  'teal',
  'yellow',
];

type Dept = 'eng' | 'product' | 'design' | 'marketing' | 'sales' | 'finance' | 'hr' | 'support';

const DEPARTMENTS: Record<Dept, { size: number; titles: string[] }> = {
  eng: {
    size: 38,
    titles: [
      'Backend engineer',
      'Backend engineer',
      'Frontend engineer',
      'Mobile engineer',
      'DevOps engineer',
      'QA engineer',
      'Data engineer',
      'Senior backend engineer',
    ],
  },
  product: { size: 9, titles: ['Product manager', 'Business analyst'] },
  design: { size: 8, titles: ['Product designer', 'UX researcher', 'Graphic designer'] },
  marketing: {
    size: 12,
    titles: ['Marketing specialist', 'Content creator', 'SMM specialist', 'Brand manager'],
  },
  sales: { size: 14, titles: ['Account manager', 'Sales representative', 'Key account manager'] },
  finance: {
    size: 13,
    titles: ['Accountant', 'Financial analyst', 'Operations specialist', 'Procurement specialist'],
  },
  hr: { size: 7, titles: ['HR specialist', 'Recruiter'] },
  support: { size: 19, titles: ['Customer support agent', 'Call center operator'] },
};

interface Planted extends Omit<PersonDef, 'avatarColor' | 'locale' | 'joinedDaysAgo'> {
  dept: Dept;
  locale?: PersonDef['locale'];
  joinedDaysAgo?: number;
}

const p = (def: Planted) => def;

/** Named people with a role in the story; everyone else is generated. */
// prettier-ignore
const PLANTED: Planted[] = [
  // Leadership and department heads.
  p({ key: 'ceo', name: 'Алтангэрэл Баатар', role: 'owner', title: 'Chief executive officer', dept: 'product', archetype: 'executive' }),
  p({ key: 'cto', name: 'Энхбаяр Дорж', role: 'admin', title: 'Chief technology officer', dept: 'eng', archetype: 'lead', note: 'in every engineering and product project (28)' }),
  p({ key: 'pmo', name: 'Номин Ганзориг', role: 'admin', title: 'Program manager (PMO)', dept: 'product', archetype: 'lead', note: 'in 30+ projects across all spaces' }),
  p({ key: 'em_plat', name: 'Отгонбаяр Чулуун', role: 'member', title: 'Engineering manager, Platform', dept: 'eng', archetype: 'lead' }),
  p({ key: 'em_apps', name: 'Мөнхзул Төмөр', role: 'member', title: 'Engineering manager, Apps', dept: 'eng', archetype: 'lead' }),
  p({ key: 'it', name: 'Хангай Сосор', role: 'admin', title: 'IT & infrastructure lead', dept: 'eng', archetype: 'lead' }),
  p({ key: 'cpo', name: 'Уранчимэг Жаргал', role: 'member', title: 'Head of product', dept: 'product', archetype: 'lead' }),
  p({ key: 'design_head', name: 'Хулан Нямаа', role: 'member', title: 'Head of design', dept: 'design', archetype: 'lead' }),
  p({ key: 'sales_head', name: 'Ганхуяг Шагдар', role: 'admin', title: 'Head of sales', dept: 'sales', archetype: 'lead' }),
  p({ key: 'cfo', name: 'Дэлгэрмаа Лхагва', role: 'admin', title: 'Chief financial officer', dept: 'finance', archetype: 'lead' }),
  // Same first names, same short names, similar initials.
  p({ key: 'qa_lead', name: 'Bat-Erdene Tsogt', role: 'member', title: 'QA lead', dept: 'eng', archetype: 'normal', locale: 'en', note: 'member in 21 projects' }),
  p({ key: 'baterdene_g1', name: 'Бат-Эрдэнэ Ганболд', role: 'member', title: 'Backend engineer', dept: 'eng', archetype: 'overloaded', note: 'overloaded; same short name as Бат-Эрдэнэ Гантулга' }),
  p({ key: 'baterdene_g2', name: 'Бат-Эрдэнэ Гантулга', role: 'member', title: 'Sales representative', dept: 'sales', archetype: 'normal' }),
  p({ key: 'sarangerel_designer', name: 'Сарангэрэл Батбаяр', role: 'member', title: 'Lead product designer', dept: 'design', archetype: 'commenter', note: 'mostly comments; same short name as Сарангэрэл Болд' }),
  p({ key: 'sarangerel_acc', name: 'Сарангэрэл Болд', role: 'member', title: 'Accountant', dept: 'finance', archetype: 'vacation', vacation: { fromDaysAgo: 40, untilDaysAhead: 50 }, note: 'on parental leave (40 days ago → in 50 days)' }),
  p({ key: 'anu_hr', name: 'Ану Дорж', role: 'admin', title: 'Head of people', dept: 'hr', archetype: 'lead' }),
  p({ key: 'anu_mkt', name: 'Anu Ganzorig', role: 'member', title: 'Head of marketing', dept: 'marketing', archetype: 'lead', locale: 'en' }),
  p({ key: 'batbold', name: 'Батболд Батсүх', role: 'member', title: 'Mobile engineer', dept: 'eng', archetype: 'vacation', vacation: { fromDaysAgo: 4, untilDaysAhead: 9 }, note: 'on vacation (4 days ago → in 9 days)' }),
  p({ key: 'bayarmaa', name: 'Баярмаа Бат-Очир', role: 'member', title: 'Support team lead', dept: 'support', archetype: 'lead' }),
  p({ key: 'bolormaa', name: 'Болормаа Батзориг', role: 'member', title: 'Customer support agent', dept: 'support', archetype: 'overloaded' }),
  // Abroad.
  p({ key: 'daniel', name: 'Daniel Park', role: 'member', title: 'Senior backend engineer', dept: 'eng', archetype: 'normal', locale: 'en', timezone: 'Asia/Seoul', note: 'Asia/Seoul time zone, English UI' }),
  p({ key: 'anna', name: 'Anna Müller', role: 'member', title: 'Data engineer (contractor)', dept: 'eng', archetype: 'normal', locale: 'en', timezone: 'Europe/Berlin', note: 'Europe/Berlin time zone' }),
  // Overloaded.
  p({ key: 'javkhlan', name: 'Жавхлан Пүрэв', role: 'member', title: 'DevOps engineer', dept: 'eng', archetype: 'overloaded' }),
  p({ key: 'solongo', name: 'Солонго Даваа', role: 'member', title: 'Key account manager', dept: 'sales', archetype: 'overloaded' }),
  // New joiners.
  p({ key: 'misheel', name: 'Мишээл Сүхбат', role: 'member', title: 'Frontend engineer', dept: 'eng', archetype: 'newcomer', joinedDaysAgo: 5, note: 'joined 5 days ago' }),
  p({ key: 'kenji', name: 'Kenji Tanaka', role: 'member', title: 'Product designer', dept: 'design', archetype: 'newcomer', joinedDaysAgo: 7, locale: 'en' }),
  p({ key: 'tergel', name: 'Тэргэл Отгон', role: 'member', title: 'Recruiter', dept: 'hr', archetype: 'newcomer', joinedDaysAgo: 3 }),
  p({ key: 'irmuun', name: 'Ирмүүн Цэрэн', role: 'member', title: 'Customer support agent', dept: 'support', archetype: 'newcomer', joinedDaysAgo: 1, note: 'joined yesterday' }),
  // Left the company (not members any more; still assignees, a lead, reviewers).
  p({ key: 'left_ganzorig', name: 'Ганзориг Бямба', role: 'member', title: 'Senior backend engineer', dept: 'eng', archetype: 'left', joinedDaysAgo: 900, leftDaysAgo: 120, note: 'left 120 days ago, still lead of KYC' }),
  p({ key: 'left_indra', name: 'Indra Munkhbat', role: 'member', title: 'Product manager', dept: 'product', archetype: 'left', joinedDaysAgo: 700, leftDaysAgo: 200 }),
  p({ key: 'left_suvd', name: 'Сувд Эрдэнэ', role: 'member', title: 'Account manager', dept: 'sales', archetype: 'left', joinedDaysAgo: 600, leftDaysAgo: 45 }),
  p({ key: 'left_james', name: 'James O’Connor', role: 'member', title: 'Mobile engineer (contractor)', dept: 'eng', archetype: 'left', locale: 'en', joinedDaysAgo: 500, leftDaysAgo: 75 }),
  p({ key: 'left_ariunbold', name: 'Ариунболд Түмэн', role: 'member', title: 'Customer support agent', dept: 'support', archetype: 'left', joinedDaysAgo: 400, leftDaysAgo: 30 }),
  p({ key: 'left_tsetseg', name: 'Цэцэг Мягмар', role: 'member', title: 'Accountant', dept: 'finance', archetype: 'left', joinedDaysAgo: 800, leftDaysAgo: 250 }),
  p({ key: 'left_mandakh', name: 'Мандах Хүрэлбаатар', role: 'member', title: 'DevOps engineer', dept: 'eng', archetype: 'left', joinedDaysAgo: 650, leftDaysAgo: 15, note: 'left 15 days ago with open tasks' }),
  p({ key: 'left_munkhtulga', name: 'Мөнхтулга Алтангэрэл', role: 'member', title: 'Marketing specialist', dept: 'marketing', archetype: 'left', joinedDaysAgo: 500, leftDaysAgo: 160 }),
  p({ key: 'left_sofia', name: 'Sofia Rossi', role: 'member', title: 'UX researcher', dept: 'design', archetype: 'left', locale: 'en', joinedDaysAgo: 450, leftDaysAgo: 90 }),
];

function buildPeople(): { people: PersonDef[]; byDept: Map<Dept, string[]> } {
  const people: PersonDef[] = [];
  const byDept = new Map<Dept, string[]>();
  const used = new Set(PLANTED.map((x) => x.name));
  const add = (def: Planted) => {
    people.push({
      ...def,
      avatarColor: rng.pick(AVATARS),
      locale: def.locale ?? 'mn',
      // Most people have been here longer than the year of history.
      joinedDaysAgo: def.joinedDaysAgo ?? (rng.chance(0.8) ? rng.int(380, 2000) : rng.int(20, 360)),
    });
    byDept.set(def.dept, [...(byDept.get(def.dept) ?? []), def.key]);
  };
  for (const def of PLANTED) add(def);

  // Fill each department up to its size with current members (people who left don't count).
  const foreign = FOREIGN_NAMES.filter((n) => !used.has(n));
  let n = 0;
  for (const [dept, { size, titles }] of Object.entries(DEPARTMENTS) as [
    Dept,
    (typeof DEPARTMENTS)[Dept],
  ][]) {
    let current = PLANTED.filter((x) => x.dept === dept && x.archetype !== 'left').length;
    while (current < size) {
      let name: string;
      let locale: PersonDef['locale'] = 'mn';
      if (dept === 'eng' && foreign.length > 0 && rng.chance(0.08)) {
        name = foreign.shift() ?? '';
        locale = 'en';
      } else {
        const given = rng.chance(0.5) ? rng.pick(MALE_NAMES) : rng.pick(FEMALE_NAMES);
        const family = rng.pick(PATRONYMICS);
        name = `${given} ${family}`;
        // Some people write their name in Latin letters.
        if (rng.chance(0.2)) name = transliterate(name);
      }
      if (!name || used.has(name)) continue;
      used.add(name);
      n += 1;
      add({
        key: `p${n}`,
        name,
        role: 'member',
        title: rng.pick(titles),
        dept,
        archetype: 'normal',
        locale,
      });
      current += 1;
    }
  }
  return { people, byDept };
}

const { people: PEOPLE, byDept: BY_DEPT } = buildPeople();
const isLeft = (key: string) => PEOPLE.find((x) => x.key === key)?.archetype === 'left';
const dept = (d: Dept) => BY_DEPT.get(d) ?? [];

/** `'a|b|c'` → `['a', 'b', 'c']` (keeps the long name lists compact). */
const list = (names: string) => names.split('|');

// Tags ----------------------------------------------------------------------------------------

const COMPONENTS = list(
  'api|backend|frontend|ios|android|web|payments|qr|card|ledger|kyc|auth|sso|' +
    'notifications|sms|push|email|webhook|database|postgres|kafka|redis|k8s|terraform|' +
    'ci|monitoring|alerting|security|performance|accessibility|i18n|analytics|etl|dwh|' +
    'bi|ml|search|cache|migration|refactor|tech-debt|flaky-test|hotfix|regression|' +
    'crash|ux|ui|design-system|api-v3|sdk|merchant|kiosk|super-app|mini-app|loyalty|' +
    'gamification|family-account|invoicing|e-barimt|currency',
);
const RELEASES = [
  ...Array.from({ length: 10 }, (_, i) => `release/3.${10 + i}`),
  ...Array.from({ length: 40 }, (_, i) => `release/4.${i}`),
];
const TYPES = list(
  'bug|feature|improvement|chore|spike|research|docs|blocked|needs-info|duplicate|' +
    'wontfix|good-first-issue|customer-reported|urgent-fix|compliance|legal|audit',
);
const QUARTERS = ['2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4', '2027-Q1'];
const REGIONS = list(
  'Архангай|Баян-Өлгий|Баянхонгор|Булган|Говь-Алтай|Говьсүмбэр|Дархан-Уул|Дорноговь|' +
    'Дорнод|Дундговь|Завхан|Орхон|Өвөрхангай|Өмнөговь|Сүхбаатар|Сэлэнгэ|Төв|Увс|Ховд|' +
    'Хөвсгөл|Хэнтий|Баянзүрх|Баянгол|Сүхбаатар дүүрэг|Чингэлтэй|Хан-Уул|' +
    'Сонгинохайрхан|Налайх|Багануур|Багахангай',
);
const CLIENT_PREFIXES = list(
  'Хөх Тэнгэр|Алтан Өргөө|Steppe|Говийн Эрдэнэ|Хангай|Mongol|Номин|Эрдэнэс|Тэнгэр|' +
    'Blue Sky|Хүннү|Орхон',
);
const CLIENT_SUFFIXES = list('ХХК|Logistics|Трейд|Group|Финанс|Констракшн|Маркет|Холдинг');
const CLIENTS = rng
  .shuffle(CLIENT_PREFIXES.flatMap((a) => CLIENT_SUFFIXES.map((b) => `${a} ${b}`)))
  .slice(0, 90);
const CAMPAIGNS = list(
  'facebook|instagram|tiktok|youtube|radio|tv|billboard|influencer|newsletter|seo|' +
    'sem|Наадам 2026|Цагаан сар 2026|Black Friday 2025|Шинэ жил 2026|' +
    'Back to school 2026|Эмэгтэйчүүдийн баяр',
);
const HR_TAGS = list(
  'hiring|интерн|onboarding|offboarding|сургалт|гүйцэтгэлийн үнэлгээ|цалин|тэтгэмж|' +
    'team-building',
);
const FINANCE_TAGS = list(
  'НӨАТ|татвар|аудит|төсөв|нэхэмжлэх|гэрээ|түрээс|худалдан авалт|тооллого|зардал|' + 'даатгал|банк',
);
const SUPPORT_TAGS = list(
  'гомдол|буцаан олголт|нууц үг|карт|QR төлбөр|хүргэлт|дуудлага|chat|email-ticket|' +
    'VIP|давтан гомдол|SLA зөрчсөн|Android апп|iOS апп',
);

const tagGroup = (names: string[], colors: PaletteKey[]): TagDef[] =>
  names.map((name, i) => ({ name, color: colors[i % colors.length] ?? 'neutral' }));
const TAGS: TagDef[] = [
  ...tagGroup(COMPONENTS, ['blue', 'violet', 'sky', 'indigo', 'teal']),
  ...tagGroup(RELEASES, ['neutral']),
  ...tagGroup(TYPES, ['rose', 'teal', 'green', 'neutral', 'amber']),
  ...tagGroup(QUARTERS, ['purple']),
  ...tagGroup(REGIONS, ['orange', 'amber', 'yellow']),
  ...tagGroup(CLIENTS, ['green', 'teal']),
  ...tagGroup(CAMPAIGNS, ['pink', 'rose', 'orange']),
  ...tagGroup(HR_TAGS, ['rose']),
  ...tagGroup(FINANCE_TAGS, ['amber']),
  ...tagGroup(SUPPORT_TAGS, ['sky', 'rose']),
];

// Spaces and projects -------------------------------------------------------------------------

const SPACES: SpaceDef[] = [
  { key: 'plat', name: 'Платформ ба API', initial: 'П', color: 'indigo' },
  { key: 'apps', name: 'Мобайл ба вэб аппликейшн', initial: 'М', color: 'violet' },
  { key: 'infra', name: 'Өгөгдөл ба дэд бүтэц', initial: 'Ө', color: 'teal' },
  { key: 'product', name: 'Бүтээгдэхүүн', initial: 'Б', color: 'blue' },
  { key: 'design', name: 'Дизайн', initial: 'Д', color: 'pink' },
  { key: 'marketing', name: 'Маркетинг ба брэнд', initial: 'М', color: 'orange' },
  { key: 'sales', name: 'Борлуулалт ба түншлэл', initial: 'Б', color: 'green' },
  { key: 'finance', name: 'Санхүү ба үйл ажиллагаа', initial: 'С', color: 'amber' },
  { key: 'hr', name: 'Хүний нөөц', initial: 'Х', color: 'rose' },
  { key: 'support', name: 'Харилцагчийн үйлчилгээ', initial: 'Х', color: 'sky' },
];

const SPACE_DEPT: Record<string, Dept> = {
  plat: 'eng',
  apps: 'eng',
  infra: 'eng',
  product: 'product',
  design: 'design',
  marketing: 'marketing',
  sales: 'sales',
  finance: 'finance',
  hr: 'hr',
  support: 'support',
};
const ENGINEERING = new Set(['plat', 'apps', 'infra']);

const SPACE_TOPIC: Record<string, Topic> = {
  plat: 'platform',
  apps: 'mobile',
  infra: 'data',
  product: 'product',
  design: 'design',
  marketing: 'marketing',
  sales: 'sales',
  finance: 'finance',
  hr: 'hr',
  support: 'support',
};

const SPACE_TAGS: Record<string, string[]> = {
  plat: [...COMPONENTS, ...RELEASES, ...TYPES, ...QUARTERS],
  apps: [...COMPONENTS, ...RELEASES, ...TYPES, ...QUARTERS],
  infra: [...COMPONENTS, ...TYPES, ...QUARTERS],
  product: [...TYPES, ...QUARTERS, ...COMPONENTS.slice(50)],
  design: ['ux', 'ui', 'design-system', 'accessibility', 'i18n', ...TYPES, ...CAMPAIGNS],
  marketing: [...CAMPAIGNS, ...REGIONS, ...QUARTERS],
  sales: [...CLIENTS, ...REGIONS, ...QUARTERS],
  finance: [...FINANCE_TAGS, ...CLIENTS.slice(0, 30), ...QUARTERS],
  hr: [...HR_TAGS, ...QUARTERS],
  support: [...SUPPORT_TAGS, ...REGIONS, 'bug', 'duplicate', 'customer-reported'],
};

// [space, key, name, tasks, createdDaysAgo, lead, archivedDaysAgo?, mn share?]
type Row = [string, string, string, number, number, string, number?, number?];
// prettier-ignore
const PROJECT_ROWS: Row[] = [
  ['plat', 'PAY', 'Төлбөрийн платформ — карт, QR, дансны шилжүүлгийн нэгдсэн гарц', 2400, 365, 'em_plat'],
  ['plat', 'PAPI', 'Partner API v3', 650, 300, 'em_plat', undefined, 0.3],
  ['plat', 'KYC', 'Хэрэглэгчийн баталгаажуулалт (KYC) ба эрсдэлийн удирдлагын системийн шинэчлэл', 520, 330, 'left_ganzorig'],
  ['plat', 'LEDG', 'Ledger service rewrite', 900, 365, 'em_plat', undefined, 0.35],
  ['plat', 'NTF', 'Мэдэгдлийн үйлчилгээ (SMS, push, и-мэйл)', 380, 250, 'em_plat'],
  ['plat', 'EBR', 'И-баримт ба татварын системийн интеграци', 240, 200, 'em_plat'],
  ['plat', 'AUTH', 'Identity & access (SSO)', 300, 180, 'cto', undefined, 0.35],
  ['plat', 'SOAP', 'Legacy SOAP adapter', 420, 365, 'em_plat', 120, 0.3],
  ['apps', 'APP', 'Altai Pay мобайл аппликейшн — 4.0 хувилбар', 1600, 365, 'em_apps'],
  ['apps', 'WEBP', 'Харилцагчийн вэб портал', 700, 340, 'em_apps'],
  ['apps', 'MRC', 'Merchant dashboard', 560, 280, 'em_apps', undefined, 0.4],
  ['apps', 'SUP', 'Супер апп: мини програмуудын платформ', 300, 150, 'em_apps'],
  ['apps', 'KIOS', 'Салбарын киоск ба өөрөө үйлчлэх терминалын програм хангамж', 210, 220, 'em_apps'],
  ['apps', 'WEAR', 'Smartwatch app (pilot)', 90, 300, 'left_james', 200, 0.2],
  ['apps', 'ADM', 'Дотоод админ систем', 450, 365, 'em_apps'],
  ['apps', 'A11Y', 'Accessibility audit & fixes', 120, 90, 'em_apps', undefined, 0.4],
  ['infra', 'DWH', 'Өгөгдлийн агуулах ба BI тайлагнал', 680, 365, 'cto'],
  ['infra', 'K8S', 'Kubernetes migration', 420, 260, 'it', undefined, 0.4],
  ['infra', 'SEC', 'Мэдээллийн аюулгүй байдал ба ISO 27001 бэлтгэл', 330, 300, 'it'],
  ['infra', 'MON', 'Monitoring & on-call', 380, 365, 'it', undefined, 0.4],
  ['infra', 'ML', 'Зээлийн эрсдэлийн машин сургалтын загвар', 160, 120, 'anna', undefined, 0.3],
  ['infra', 'DR', 'Disaster recovery 2025', 110, 365, 'it', 150, 0.4],
  ['product', 'RDM', 'Бүтээгдэхүүний roadmap 2026', 260, 300, 'cpo'],
  ['product', 'RSR', 'User research', 180, 330, 'pmo', undefined, 0.5],
  ['product', 'SME', 'ЖДҮ-д зориулсан нэхэмжлэх ба бүртгэлийн шийдэл', 210, 140, 'cpo'],
  ['product', 'GAM', 'Хэрэглэгчийн урамшууллын оноо ба gamification', 140, 100, 'cpo'],
  ['product', 'FAM', 'Гэр бүлийн данс', 90, 60, 'cpo'],
  ['product', 'PRC', 'Pricing & packaging', 75, 200, 'cpo', undefined, 0.5],
  ['design', 'DS', 'Altai дизайн систем 2.0', 380, 330, 'design_head'],
  ['design', 'BRD', 'Брэндийн шинэчлэл — лого, өнгө, фонт, хэвлэмэл материал', 220, 250, 'design_head'],
  ['design', 'UXR', 'Usability testing', 120, 200, 'design_head', undefined, 0.5],
  ['design', 'ILL', 'Иллюстрац ба анимейшн', 95, 150, 'design_head'],
  ['design', 'OLD', 'Old website redesign (2025)', 160, 365, 'design_head', 240, 0.4],
  ['marketing', 'CMP', 'Кампанит ажлууд 2026', 620, 365, 'anu_mkt'],
  ['marketing', 'NDM', 'Наадам 2026 — үндэсний хэмжээний урамшууллын кампанит ажил', 230, 160, 'anu_mkt'],
  ['marketing', 'TSR', 'Цагаан сар 2026', 150, 300, 'anu_mkt'],
  ['marketing', 'SMM', 'Social media', 520, 365, 'anu_mkt', undefined, 0.6],
  ['marketing', 'PR', 'Хэвлэл мэдээлэл ба олон нийттэй харилцах', 170, 300, 'anu_mkt'],
  ['marketing', 'EVT', 'Events & trade shows', 140, 280, 'anu_mkt', undefined, 0.6],
  ['marketing', 'AIM', '21 аймгийн аян: орон нутагт брэндийг таниулах ба шинэ харилцагч татах хөтөлбөр', 260, 120, 'anu_mkt'],
  ['sales', 'B2B', 'B2B борлуулалт', 1300, 365, 'sales_head'],
  ['sales', 'PART', 'Түншлэлийн хөтөлбөр', 290, 300, 'sales_head'],
  ['sales', 'TND', 'Тендер ба төрийн худалдан авалт', 160, 330, 'sales_head'],
  ['sales', 'RGN', 'Орон нутгийн салбаруудын борлуулалт (Дархан, Эрдэнэт, Чойр)', 420, 330, 'sales_head'],
  ['sales', 'KAM', 'Key accounts', 360, 365, 'sales_head', undefined, 0.6],
  ['sales', 'CRM', 'CRM migration', 130, 330, 'left_suvd', 60, 0.5],
  ['finance', 'ACC', 'Нягтлан бодох бүртгэл', 720, 365, 'cfo'],
  ['finance', 'PROC', 'Худалдан авалт', 300, 365, 'cfo'],
  ['finance', 'BUD', 'Төсөв 2027', 110, 45, 'cfo'],
  ['finance', 'AUD', 'Жилийн аудит 2025', 140, 300, 'cfo'],
  ['finance', 'OFC', 'Оффис ба аж ахуй', 260, 365, 'cfo'],
  ['finance', 'LGL', 'Хууль, эрх зүй ба гэрээний бүртгэл', 190, 330, 'cfo'],
  ['hr', 'HIR', 'Ажилтан сонгон шалгаруулалт', 420, 365, 'anu_hr'],
  ['hr', 'ONB', 'Onboarding & offboarding', 260, 365, 'anu_hr', undefined, 0.6],
  ['hr', 'LND', 'Сургалт ба хөгжил', 150, 280, 'anu_hr'],
  ['hr', 'CUL', 'Байгууллагын соёл ба арга хэмжээ', 110, 300, 'anu_hr'],
  ['support', 'HELP', 'Харилцагчийн хүсэлт ба гомдлын бүртгэл', 3000, 365, 'bayarmaa'],
  ['support', 'CALL', 'Дуудлагын төвийн CRM нэвтрүүлэлт', 260, 210, 'bayarmaa'],
  ['support', 'KB', 'Мэдлэгийн сан (FAQ) — монгол, англи хэлээр', 180, 300, 'bayarmaa'],
  ['support', 'SQA', 'Үйлчилгээний чанарын хяналт', 230, 330, 'bayarmaa'],
];

const COLORS: PaletteKey[] = [
  'indigo',
  'violet',
  'blue',
  'teal',
  'green',
  'amber',
  'orange',
  'rose',
  'pink',
  'sky',
];

function buildProjects(): ProjectDef[] {
  return PROJECT_ROWS.map(
    ([space, key, name, tasks, createdDaysAgo, lead, archivedDaysAgo, mn]) => {
      const d = SPACE_DEPT[space] ?? 'eng';
      const pool = dept(d).filter((k) => k !== lead);
      const size = Math.min(pool.length, 3 + Math.round(Math.sqrt(tasks) / 2.5));
      const team = new Set([lead, ...rng.sample(pool, size)]);
      if (ENGINEERING.has(space)) {
        team.add('cto');
        team.add('pmo');
        if (!archivedDaysAgo) team.add('qa_lead');
        for (const k of rng.sample(dept('design'), 1)) team.add(k);
        team.add('sarangerel_designer');
        if (tasks >= 500) for (const k of rng.sample(dept('product'), 2)) team.add(k);
      }
      if (space === 'product') {
        team.add('cto');
        team.add('pmo');
        team.add('sarangerel_designer');
        for (const k of rng.sample(dept('eng'), 2)) team.add(k);
      }
      if (space === 'design') team.add('pmo');
      if (['marketing', 'sales'].includes(space) && tasks >= 250) team.add('pmo');
      if (space === 'support' && tasks >= 1000) {
        // Escalations reach engineering.
        for (const k of rng.sample(dept('eng'), 3)) team.add(k);
        team.add('pmo');
      }
      // Planted people where their story needs them.
      const placements: Record<string, string[]> = {
        PAY: ['baterdene_g1', 'javkhlan', 'daniel', 'left_mandakh', 'left_ganzorig'],
        LEDG: ['baterdene_g1', 'daniel', 'left_ganzorig'],
        KYC: ['baterdene_g1', 'left_ganzorig'],
        PAPI: ['baterdene_g1', 'daniel'],
        APP: ['batbold', 'misheel', 'left_james', 'kenji'],
        WEBP: ['misheel', 'batbold'],
        WEAR: ['left_james', 'batbold'],
        K8S: ['javkhlan', 'left_mandakh'],
        MON: ['javkhlan', 'left_mandakh'],
        DWH: ['anna'],
        ML: ['anna'],
        DS: ['kenji', 'sarangerel_designer'],
        UXR: ['left_sofia', 'kenji'],
        RSR: ['left_sofia', 'left_indra'],
        RDM: ['left_indra'],
        PRC: ['left_indra'],
        B2B: ['solongo', 'baterdene_g2', 'left_suvd'],
        KAM: ['solongo', 'left_suvd'],
        CRM: ['left_suvd', 'solongo'],
        ACC: ['sarangerel_acc', 'left_tsetseg'],
        AUD: ['sarangerel_acc', 'left_tsetseg'],
        HELP: ['bolormaa', 'irmuun', 'left_ariunbold', 'qa_lead'],
        SQA: ['qa_lead'],
        CALL: ['bolormaa'],
        HIR: ['tergel'],
        ONB: ['tergel'],
        CMP: ['left_munkhtulga'],
        SMM: ['left_munkhtulga'],
      };
      for (const k of placements[key] ?? []) team.add(k);
      return {
        key,
        name,
        space,
        color: rng.pick(COLORS),
        lead,
        team: [...team],
        tasks,
        createdDaysAgo,
        ...(archivedDaysAgo ? { archivedDaysAgo } : {}),
        sprints: ENGINEERING.has(space),
        topic: SPACE_TOPIC[space] ?? 'platform',
        mn: mn ?? 0.75,
        reviewShare: ENGINEERING.has(space) ? 0.7 : space === 'design' ? 0.5 : 0.2,
        tags: rng.sample(SPACE_TAGS[space] ?? [], rng.int(20, 60)),
      } satisfies ProjectDef;
    },
  );
}

const PROJECTS = buildProjects();

/** A generated member who sits in no special story (for the "regular member" login). */
const REGULAR = PEOPLE.find(
  (x) =>
    /^p\d/.test(x.key) && x.archetype === 'normal' && !isLeft(x.key) && /[А-Яа-яӨөҮү]/.test(x.name),
);

// Standups ------------------------------------------------------------------------------------

const current = (d: Dept) => dept(d).filter((key) => !isLeft(key));
const ENG = current('eng').filter((key) => key !== 'cto');
const squad = (from: number) => ENG.slice(from, from + 8);
const SQUADS: [string, number][] = [
  ['Төлбөрийн баг', 0],
  ['Mobile squad', 8],
  ['Платформын баг', 16],
];

const STANDUPS: StandupGroupDef[] = [
  ...SQUADS.map(([name, from]): StandupGroupDef => ({
    name,
    members: squad(from),
    facilitator: squad(from)[0] ?? null,
    createdDaysAgo: 60,
    postRate: 0.8,
    mn: name === 'Mobile squad' ? 0.4 : 0.85,
  })),
  {
    name: 'Бүтээгдэхүүн ба дизайн',
    members: [
      'pmo',
      ...current('product')
        .filter((k) => k !== 'pmo')
        .slice(0, 4),
      ...current('design').slice(0, 5),
    ],
    facilitator: 'pmo',
    meetingAt: '09:45',
    postBy: '09:30',
    reminderAt: '09:00',
    speakingOrder: 'alphabetical',
    createdDaysAgo: 45,
    postRate: 0.7,
    mn: 0.9,
  },
  {
    // Async only; Irmuun joined yesterday (mid-week).
    name: 'Харилцагчийн үйлчилгээ',
    members: [
      'bayarmaa',
      ...current('support')
        .filter((k) => k !== 'bayarmaa')
        .slice(0, 6),
      'irmuun',
    ],
    facilitator: 'bayarmaa',
    meetingAt: null,
    createdDaysAgo: 30,
    postRate: 0.6,
    mn: 1,
    joinedDaysAgo: { irmuun: 1 },
  },
  {
    // Too big for one standup: the page nudges admins to split it.
    name: 'Engineering all-hands',
    members: ['cto', ...ENG.slice(0, 29)],
    facilitator: 'cto',
    secondsPerPerson: 60,
    totalMeetingMinutes: 20,
    createdDaysAgo: 25,
    postRate: 0.65,
    mn: 0.75,
  },
];

export const LARGE: ScenarioDef = {
  slug: 'altai-group',
  name: 'Altai Group',
  emailDomain: 'altaigroup.test',
  seed: 1206,
  hotThreads: 60,
  people: PEOPLE,
  spaces: SPACES,
  projects: PROJECTS,
  tags: TAGS,
  standups: STANDUPS,
  credentials: [
    ['owner', 'ceo'],
    ['admin · CTO, in 28 projects', 'cto'],
    ['admin · PMO, in 30+ projects', 'pmo'],
    ['member · regular', REGULAR?.key ?? 'p1'],
    ['member · QA lead in 21 projects', 'qa_lead'],
    ['member · overloaded (Бат-Эрдэнэ #1)', 'baterdene_g1'],
    ['member · same short name (Бат-Эрдэнэ #2)', 'baterdene_g2'],
    ['member · designer who mostly comments', 'sarangerel_designer'],
    ['member · on vacation', 'batbold'],
    ['member · long leave', 'sarangerel_acc'],
    ['member · new joiner (5 days)', 'misheel'],
    ['member · joined yesterday', 'irmuun'],
    ['member · other time zone (Seoul)', 'daniel'],
    ['left · still owns open tasks', 'left_mandakh'],
    ['left · still leads KYC', 'left_ganzorig'],
  ],
};
