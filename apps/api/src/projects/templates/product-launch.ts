import type { ProjectTemplate } from './types.js';

/** 18 tasks: planning (first week), build (weeks 2–4), go-live (week 5). */
export const productLaunch: ProjectTemplate = {
  id: 'product-launch',
  tasks: [
    // Planning
    {
      title: [
        'Нээлтийн зорилго, амжилтын хэмжүүрийг тодорхойлох',
        'Define launch goals and success metrics',
      ],
      priority: 'high',
      dueInDays: 2,
    },
    {
      title: ['Зорилтот хэрэглэгч, персонаг тодорхойлох', 'Identify target audience and personas'],
      priority: 'medium',
      dueInDays: 3,
    },
    {
      title: ['Өрсөлдөгчийн шинжилгээ хийх', 'Run a competitive analysis'],
      priority: 'medium',
      dueInDays: 4,
    },
    {
      title: ['Бүтээгдэхүүний шаардлагын баримт бичих', 'Write the product requirements doc'],
      priority: 'high',
      dueInDays: 5,
    },
    {
      title: ['Нээлтийн огноо, үе шатуудыг тогтоох', 'Set the launch date and milestones'],
      priority: 'high',
      dueInDays: 6,
    },
    {
      title: ['Төсөв, нөөцийг батлах', 'Approve budget and resources'],
      priority: 'medium',
      dueInDays: 7,
    },
    // Build
    { title: ['Дизайныг эцэслэх', 'Finalize designs'], priority: 'high', dueInDays: 10 },
    {
      title: ['Үндсэн боломжуудыг хөгжүүлэх', 'Build the core features'],
      priority: 'urgent',
      dueInDays: 21,
    },
    {
      title: ['Аналитик, хэмжилтийг тохируулах', 'Set up analytics and tracking'],
      priority: 'medium',
      dueInDays: 18,
    },
    {
      title: [
        'Маркетингийн сайт, нүүр хуудсыг бэлтгэх',
        'Prepare the marketing site and landing page',
      ],
      priority: 'medium',
      dueInDays: 22,
    },
    {
      title: ['Тусламжийн нийтлэлүүд бичих', 'Write help center articles'],
      priority: 'low',
      dueInDays: 24,
    },
    {
      title: [
        'Нээлтийн материал бэлтгэх (зураг, видео)',
        'Create launch assets (screenshots, video)',
      ],
      priority: 'medium',
      dueInDays: 25,
    },
    {
      title: ['Чанарын шалгалт, алдаа илрүүлэлт', 'QA and bug bash'],
      priority: 'high',
      dueInDays: 26,
    },
    {
      title: ['Туршилтын хэрэглэгчидтэй бета хийх', 'Run a beta with pilot customers'],
      priority: 'high',
      dueInDays: 28,
    },
    // Go-live
    {
      title: ['Нээлтэд бэлэн байдлын хяналт', 'Launch readiness review'],
      priority: 'urgent',
      dueInDays: 30,
    },
    {
      title: [
        'Мэдэгдэл нийтлэх (блог, имэйл, сошиал)',
        'Publish the announcement (blog, email, social)',
      ],
      priority: 'high',
      dueInDays: 32,
    },
    {
      title: ['Хэмжүүр, тусламжийн хүсэлтийг хянах', 'Monitor metrics and the support queue'],
      priority: 'medium',
      dueInDays: 34,
    },
    {
      title: ['Нээлтийн дүгнэлт хийх', 'Hold a launch retrospective'],
      priority: 'low',
      dueInDays: 35,
    },
  ],
};
