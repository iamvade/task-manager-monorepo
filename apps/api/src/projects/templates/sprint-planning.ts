import type { ProjectTemplate } from './types.js';

/** 12 tasks in a two-week sprint that starts the day the template is applied. */
export const sprintPlanning: ProjectTemplate = {
  id: 'sprint-planning',
  sprint: { name: ['Спринт 1', 'Sprint 1'], days: 14 },
  tasks: [
    {
      title: ['Спринт төлөвлөлтийн уулзалт', 'Sprint planning meeting'],
      priority: 'high',
      dueInDays: 0,
    },
    {
      title: ['Бэклогийг цэгцэлж, үнэлэх', 'Groom and estimate the backlog'],
      priority: 'high',
      dueInDays: 1,
    },
    {
      title: ['Спринтийн зорилго тодорхойлох', 'Define the sprint goal'],
      priority: 'medium',
      dueInDays: 1,
    },
    {
      title: ['Хэрэглэгчийн түүхийг даалгавар болгон задлах', 'Break stories into tasks'],
      priority: 'medium',
      dueInDays: 2,
    },
    {
      title: ['Спринтийн самбарыг шинэчлэх', 'Set up the sprint board'],
      priority: 'low',
      dueInDays: 2,
    },
    {
      title: ['Спринтийн дунд үеийн уулзалт', 'Mid-sprint check-in'],
      priority: 'medium',
      dueInDays: 7,
    },
    { title: ['Түгжигдсэн ажлуудыг шийдэх', 'Unblock stuck work'], priority: 'high', dueInDays: 8 },
    {
      title: ['Код хяналтын үлдэгдлийг цэвэрлэх', 'Clear the code review queue'],
      priority: 'medium',
      dueInDays: 10,
    },
    {
      title: ['Спринтийн түүхүүдийг шалгах', 'QA the sprint stories'],
      priority: 'high',
      dueInDays: 11,
    },
    {
      title: ['Хувилбарын тэмдэглэл бичих', 'Write release notes'],
      priority: 'low',
      dueInDays: 12,
    },
    {
      title: ['Спринтийн хяналт, демо', 'Sprint review and demo'],
      priority: 'high',
      dueInDays: 13,
    },
    { title: ['Спринтийн дүгнэлт', 'Sprint retrospective'], priority: 'medium', dueInDays: 13 },
  ],
};
