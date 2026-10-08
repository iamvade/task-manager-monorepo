import type { ProjectTemplate } from './types.js';

/** 6 tasks with priorities, plus severity tags S1 (critical) – S4 (cosmetic). */
export const bugTriage: ProjectTemplate = {
  id: 'bug-triage',
  tags: [
    { name: 'S1', color: 'pink' },
    { name: 'S2', color: 'orange' },
    { name: 'S3', color: 'blue' },
    { name: 'S4', color: 'neutral' },
  ],
  tasks: [
    {
      title: ['Хамгийн их давтагддаг гацалтыг засах', 'Fix the top crash'],
      priority: 'urgent',
      dueInDays: 1,
      tags: ['S1'],
    },
    {
      title: ['Шинээр ирсэн алдаануудыг ангилах', 'Triage new incoming bugs'],
      priority: 'high',
      dueInDays: 1,
      tags: ['S2'],
    },
    {
      title: ['Удаан сүлжээнд нэвтрэлт тасрах алдааг засах', 'Fix login timeouts on slow networks'],
      priority: 'high',
      dueInDays: 3,
      tags: ['S2'],
    },
    {
      title: [
        'Жижиг дэлгэц дээрх эвдэрсэн байрлалыг засах',
        'Fix the broken layout on small screens',
      ],
      priority: 'medium',
      dueInDays: 5,
      tags: ['S3'],
    },
    {
      title: ['Нээлттэй алдаануудыг долоо хоног бүр хянах', 'Review open bugs every week'],
      priority: 'medium',
      dueInDays: 7,
      tags: ['S3'],
    },
    {
      title: ['Танилцуулгын текстийн үсгийн алдааг засах', 'Fix typos in the onboarding copy'],
      priority: 'low',
      dueInDays: 7,
      tags: ['S4'],
    },
  ],
};
