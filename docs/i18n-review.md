# Screen strings — i18n review

Drafted Mongolian for screens whose designs only have English; please review.

Source: `design/{Board,TaskDetail,MyTasks,Calendar,CreateTask,EmptyProject,EmptyInbox,ListDark}.dc.html`. Strings already in Main's `STR` table (sidebar, top bar, table headers, status/priority names, Today/Tomorrow, List/Board/Calendar, Filter, New Task, Add task, Share, Assignee/Due date/Priority/Tags, Invite teammates) are not repeated; ListDark adds no new strings. `<b>`, `<task>`, `<from>`, `<to>`, `<browse>`, `<kbd>` are react-i18next `<Trans components>` tags. Date templates receive all of `m`, `d`, `year`, `monthShort`, `monthLong`, `weekdayShort`, `weekdayLong` (names from `calendar.months` / `calendar.weekdays`); each locale uses what it needs. Mongolian avoids case suffixes after interpolated values (e.g. "Үүсгэсэн: {{name}}" instead of "{{name}}-ий"), since vowel harmony can't be resolved at runtime. "(derived)" = not drawn in the designs but needed by the same UI.

## `board` (13)

| key | en | mn (draft) | where |
|---|---|---|---|
| `sortManual` | Sort: Manual | Эрэмбэ: Гараар | Board — toolbar sort button |
| `columnsStatus` | Columns: Status | Багана: Төлөв | Board — toolbar grouping button |
| `columnLabel_one` | {{status}}, {{count}} task | {{status}}, {{count}} ажил | Board — column `<section>` aria-label |
| `columnLabel_other` | {{status}}, {{count}} tasks | {{status}}, {{count}} ажил | Board — column `<section>` aria-label |
| `addTaskTo` | Add task to {{status}} | «{{status}}» баганад ажил нэмэх | Board — column header + button aria-label |
| `columnOptions` | {{status}} column options | «{{status}}» баганын сонголтууд | Board — column header … button aria-label |
| `dropToMove` | Drop to move to {{status}} | Энд тавьж «{{status}}» руу шилжүүлэх | Board — drop placeholder text while dragging |
| `completed` | Completed | Дууссан | Board — green check icon aria-label on done cards |
| `priorityLabel` | {{priority}} priority | Ач холбогдол: {{priority}} | Board — priority flag aria-label (also Calendar unscheduled cards) |
| `subtasksDone_one` | {{done}}/{{count}} subtask done | Дэд ажил: {{done}}/{{count}} дууссан | Board — card subtask counter aria-label (count = total) |
| `subtasksDone_other` | {{done}}/{{count}} subtasks done | Дэд ажил: {{done}}/{{count}} дууссан | Board — card subtask counter aria-label (count = total) |
| `dueOverdue` | {{date}} · Overdue | {{date}} · Хугацаа хэтэрсэн | Board — card due date when overdue ("Oct 7 · Overdue") |
| `moreTags` | +{{count}} | +{{count}} | Board — card "+N" chip when more than 2 tags |

## `drawer` (64)

| key | en | mn (draft) | where |
|---|---|---|---|
| `closeToList` | Close task and return to list | Ажлыг хаагаад жагсаалт руу буцах | TaskDetail — scrim link aria-label |
| `location` | Task location | Ажлын байршил | TaskDetail — header breadcrumb `<nav>` aria-label |
| `markComplete` | Mark complete | Дууссан гэж тэмдэглэх | TaskDetail — header secondary button |
| `copyLink` | Copy link to task | Ажлын холбоосыг хуулах | TaskDetail — header icon button aria-label |
| `openFullPage` | Open as full page | Бүтэн хуудсаар нээх | TaskDetail — header icon button aria-label |
| `moreActions` | More task actions | Ажлын нэмэлт үйлдэл | TaskDetail — header … button aria-label |
| `close` | Close | Хаах | TaskDetail — header × aria-label |
| `titleLabel` | Task title | Ажлын нэр | TaskDetail — sr-only label of the title textarea |
| `createdMeta` | Created by {{name}} on {{date}} · Updated {{relative}} | Үүсгэсэн: {{name}}, {{date}} · Шинэчилсэн: {{relative}} | TaskDetail — meta line under the title ("Updated 2 hours ago") |
| `status` | Status | Төлөв | TaskDetail — property label + status listbox aria-label |
| `assignees` | Assignees | Хариуцагчид | TaskDetail — property label |
| `addAssignee` | Add assignee | Хариуцагч нэмэх | TaskDetail — dashed + button aria-label |
| `dueRelative` | {{relative}}, {{date}} | {{relative}}, {{date}} | TaskDetail — due value when today/tomorrow ("Today, Oct 8") |
| `started` | Started {{date}} | Эхэлсэн: {{date}} | TaskDetail — muted suffix after due ("· Started Oct 4") |
| `addTag` | Add tag | Шошго нэмэх | TaskDetail — tags + button aria-label |
| `description` | Description | Тайлбар | TaskDetail — section heading |
| `toolbar.label` | Formatting | Форматлах | TaskDetail — editor toolbar aria-label |
| `toolbar.text` | Text | Текст | TaskDetail — editor block-type dropdown ("Text ▾") |
| `toolbar.bold` | Bold | Тод | TaskDetail — toolbar aria-label |
| `toolbar.italic` | Italic | Налуу | TaskDetail — toolbar aria-label |
| `toolbar.strike` | Strikethrough | Дундуур зураас | TaskDetail — toolbar aria-label |
| `toolbar.code` | Inline code | Мөр доторх код | TaskDetail — toolbar aria-label |
| `toolbar.bulletList` | Bulleted list | Цэгтэй жагсаалт | TaskDetail — toolbar aria-label |
| `toolbar.orderedList` | Numbered list | Дугаартай жагсаалт | TaskDetail — toolbar aria-label |
| `toolbar.link` | Link | Холбоос | TaskDetail — toolbar aria-label |
| `toolbar.mention` | Mention someone | Хэн нэгнийг дурдах | TaskDetail — toolbar @ and composer @ aria-label |
| `subtasks` | Subtasks | Дэд ажлууд | TaskDetail — section heading ("Subtasks 5/6") |
| `newSubtask` | New subtask | Шинэ дэд ажил | TaskDetail — sr-only label of the add-subtask input |
| `addSubtask` | Add subtask | Дэд ажил нэмэх | TaskDetail — add-subtask input placeholder |
| `attachments` | Attachments | Хавсралтууд | TaskDetail — section heading (count badge follows) |
| `attach` | Attach | Хавсаргах | TaskDetail — attachments header button |
| `attachmentMeta` | {{size}} · {{name}} | {{size}} · {{name}} | TaskDetail — attachment card meta ("248 KB · Dorj E.") |
| `size.b` | {{value}} B | {{value}} B | TaskDetail — file size unit (design-notes A.4: same in mn) |
| `size.kb` | {{value}} KB | {{value}} KB | TaskDetail — file size unit ("248 KB") |
| `size.mb` | {{value}} MB | {{value}} MB | TaskDetail — file size unit |
| `dropFiles` | Drop files or &lt;browse>browse&lt;/browse> | Файлаа энд чирч оруулах эсвэл &lt;browse>сонгох&lt;/browse> | TaskDetail — dashed dropzone ("browse" is the file-picker link) |
| `activity` | Activity | Үйл ажиллагаа | TaskDetail — section heading |
| `activityFilter` | Activity filter | Үйл ажиллагааны шүүлтүүр | TaskDetail — segmented tablist aria-label |
| `tabs.all` | All | Бүгд | TaskDetail — activity segmented tab |
| `tabs.comments` | Comments | Сэтгэгдэл | TaskDetail — activity segmented tab |
| `tabs.history` | History | Түүх | TaskDetail — activity segmented tab |
| `history.created` | &lt;b>{{actor}}&lt;/b> created this task | &lt;b>{{actor}}&lt;/b> энэ ажлыг үүсгэсэн | TaskDetail — history line |
| `history.prioritySet` | &lt;b>{{actor}}&lt;/b> set priority to &lt;b>{{to}}&lt;/b> | &lt;b>{{actor}}&lt;/b> ач холбогдлыг &lt;b>{{to}}&lt;/b> болгосон | TaskDetail — history line (no previous priority) |
| `history.priorityChanged` | &lt;b>{{actor}}&lt;/b> changed priority from {{from}} to &lt;b>{{to}}&lt;/b> | &lt;b>{{actor}}&lt;/b> ач холбогдлыг өөрчилсөн: {{from}} → &lt;b>{{to}}&lt;/b> | TaskDetail — history line (old value not bold in design) |
| `history.statusChanged` | &lt;b>{{actor}}&lt;/b> changed status from &lt;from>{{from}}&lt;/from> to &lt;to>{{to}}&lt;/to> | &lt;b>{{actor}}&lt;/b> төлөвийг өөрчилсөн: &lt;from>{{from}}&lt;/from> → &lt;to>{{to}}&lt;/to> | TaskDetail — history line; `<from>`/`<to>` render status pills |
| `history.statusSet` | &lt;b>{{actor}}&lt;/b> changed status to &lt;to>{{to}}&lt;/to> | &lt;b>{{actor}}&lt;/b> төлөвийг &lt;to>{{to}}&lt;/to> болгосон | TaskDetail — history line, short form |
| `history.attached` | &lt;b>{{actor}}&lt;/b> attached &lt;b>{{filename}}&lt;/b> | &lt;b>{{actor}}&lt;/b> &lt;b>{{filename}}&lt;/b> файл хавсаргасан | TaskDetail — history line |
| `history.subtaskCompleted` | &lt;b>{{actor}}&lt;/b> completed subtask &lt;b>{{title}}&lt;/b> | &lt;b>{{actor}}&lt;/b> «&lt;b>{{title}}&lt;/b>» дэд ажлыг дуусгасан | TaskDetail — history line |
| `commentOptions` | Comment options | Сэтгэгдлийн сонголтууд | TaskDetail — comment … button aria-label |
| `reply` | Reply | Хариулах | TaskDetail — comment action |
| `replies_one` | {{count}} reply | {{count}} хариулт | TaskDetail — reply count under a comment |
| `replies_other` | {{count}} replies | {{count}} хариулт | TaskDetail — reply count under a comment |
| `mentionSuggestions` | Mention suggestions | Дурдах хүний санал | TaskDetail — @-suggestions listbox aria-label |
| `people` | People | Хүмүүс | TaskDetail — @-suggestions group header |
| `writeComment` | Write a comment | Сэтгэгдэл бичих | TaskDetail — sr-only label of the composer |
| `attachFile` | Attach file | Файл хавсаргах | TaskDetail — composer paperclip aria-label |
| `sendHint` | ⌘ Enter to send | ⌘ Enter дарж илгээнэ | TaskDetail — composer footer hint |
| `send` | Comment | Илгээх | TaskDetail — composer primary button |
| `time.justNow` | Just now | Дөнгөж сая | TaskDetail — relative time (derived, not drawn) |
| `time.minutesAgo_one` | {{count}} minute ago | {{count}} минутын өмнө | TaskDetail — relative time (derived, not drawn) |
| `time.minutesAgo_other` | {{count}} minutes ago | {{count}} минутын өмнө | TaskDetail — relative time (derived, not drawn) |
| `time.hoursAgo_one` | {{count}} hour ago | {{count}} цагийн өмнө | TaskDetail — relative time ("2 hours ago") |
| `time.hoursAgo_other` | {{count}} hours ago | {{count}} цагийн өмнө | TaskDetail — relative time ("2 hours ago") |
| `time.yesterdayAt` | Yesterday, {{time}} | Өчигдөр, {{time}} | TaskDetail — relative time ("Yesterday, 4:12 PM"); time via calendar.format.time |

## `myTasks` (41)

| key | en | mn (draft) | where |
|---|---|---|---|
| `allSpaces` | All spaces | Бүх орон зай | MyTasks — header space filter |
| `groupDueDate` | Group: Due date | Бүлэглэх: Дуусах огноо | MyTasks — header group button |
| `greeting.morning` | Good morning, {{name}} | Өглөөний мэнд, {{name}} | MyTasks — h1 (first name) |
| `greeting.afternoon` | Good afternoon, {{name}} | Өдрийн мэнд, {{name}} | MyTasks — h1 (derived: time of day) |
| `greeting.evening` | Good evening, {{name}} | Оройн мэнд, {{name}} | MyTasks — h1 (derived: time of day) |
| `stats.dueToday` | Due today | Өнөөдөр дуусах | MyTasks — stat card title |
| `stats.dueTodayLeft_one` | of {{count}} left | {{count}} ажлаас үлдсэн | MyTasks — after the big number ("3 · of 4 left"); count = total due today |
| `stats.dueTodayLeft_other` | of {{count}} left | {{count}} ажлаас үлдсэн | MyTasks — after the big number ("3 · of 4 left"); count = total due today |
| `stats.urgent_one` | {{count}} urgent | {{count}} яаралтай | MyTasks — due-today card ("· 1 urgent") |
| `stats.urgent_other` | {{count}} urgent | {{count}} яаралтай | MyTasks — due-today card ("· 1 urgent") |
| `stats.completedThisWeek` | Completed this week | Энэ долоо хоногт дууссан | MyTasks — stat card title |
| `stats.vsLastWeek` | {{delta}} vs last week | Өмнөх долоо хоногоос {{delta}} | MyTasks — delta ("+3 vs last week"); delta pre-signed |
| `stats.perDayLabel` | Completed per day: {{list}} | Өдөр бүр дууссан: {{list}} | MyTasks — week bar chart aria-label |
| `stats.perDayItem` | {{day}} {{count}} | {{day}}: {{count}} | MyTasks — one item of the chart list ("Mon 2"), joined with ", " |
| `stats.overdue` | Overdue | Хугацаа хэтэрсэн | MyTasks — stat card title + section label |
| `stats.oldestLate_one` | oldest is {{count}} day late | хамгийн удаан нь {{count}} хоног хоцорсон | MyTasks — overdue card |
| `stats.oldestLate_other` | oldest is {{count}} days late | хамгийн удаан нь {{count}} хоног хоцорсон | MyTasks — overdue card |
| `sections.overdue` | Overdue | Хугацаа хэтэрсэн | MyTasks — section label |
| `sections.overdueHint` | Reschedule or close these first | Эхлээд эдгээрийг хойшлуулах эсвэл хаана уу | MyTasks — overdue section hint |
| `sections.thisWeek` | This Week | Энэ долоо хоног | MyTasks — section label |
| `sections.later` | Later | Дараа | MyTasks — section label |
| `sections.laterHint` | After this week | Энэ долоо хоногоос хойш | MyTasks — later section hint |
| `sections.rangeHint` | {{start}} – {{end}} | {{start}} – {{end}} | MyTasks — This Week hint ("Fri, Oct 9 – Sun, Oct 11"); ends via calendar.format.weekdayShortDate |
| `recentActivity` | Recent activity | Сүүлийн үйл ажиллагаа | MyTasks — right panel heading |
| `viewInbox` | View inbox | Мэдэгдэл харах | MyTasks — right panel link |
| `feed.mentioned` | &lt;b>{{actor}}&lt;/b> mentioned you in &lt;task>{{task}}&lt;/task> | &lt;b>{{actor}}&lt;/b> таныг &lt;task>{{task}}&lt;/task> дээр дурдсан | MyTasks — feed row (also Inbox rows) |
| `feed.statusChanged` | &lt;b>{{actor}}&lt;/b> moved &lt;task>{{task}}&lt;/task> to {{status}} | &lt;b>{{actor}}&lt;/b> &lt;task>{{task}}&lt;/task> ажлын төлөвийг «{{status}}» болгосон | MyTasks — feed row ("moved … to In Review") |
| `feed.commented` | &lt;b>{{actor}}&lt;/b> commented on &lt;task>{{task}}&lt;/task> | &lt;b>{{actor}}&lt;/b> &lt;task>{{task}}&lt;/task> дээр сэтгэгдэл бичсэн | MyTasks — feed row |
| `feed.assigned` | &lt;b>{{actor}}&lt;/b> assigned you &lt;task>{{task}}&lt;/task> | &lt;b>{{actor}}&lt;/b> таныг &lt;task>{{task}}&lt;/task> ажлын хариуцагчаар томилсон | MyTasks — feed row |
| `feed.dueChanged` | &lt;b>{{actor}}&lt;/b> changed the due date of &lt;task>{{task}}&lt;/task> to {{date}} | &lt;b>{{actor}}&lt;/b> &lt;task>{{task}}&lt;/task> ажлын дуусах огноог {{date}} болгосон | MyTasks — feed row |
| `feed.completed` | &lt;b>{{actor}}&lt;/b> completed &lt;task>{{task}}&lt;/task> | &lt;b>{{actor}}&lt;/b> &lt;task>{{task}}&lt;/task> ажлыг дуусгасан | MyTasks — feed row |
| `feed.updated` | &lt;b>{{actor}}&lt;/b> updated &lt;task>{{task}}&lt;/task> | &lt;b>{{actor}}&lt;/b> &lt;task>{{task}}&lt;/task> ажлыг шинэчилсэн | MyTasks — feed row for changes without their own line (derived) |
| `feed.empty` | No recent activity | Сүүлийн үйл ажиллагаа алга | MyTasks — feed panel with no items (derived) |
| `feed.meta` | {{time}} · {{project}} | {{time}} · {{project}} | MyTasks — feed row meta ("2h ago · App Redesign") |
| `feed.unread` | Unread | Уншаагүй | MyTasks — unread dot aria-label |
| `showOlder` | Show older activity | Өмнөх үйл ажиллагааг харуулах | MyTasks — feed pagination link |
| `time.minutesAgo_one` | {{count}}m ago | {{count}} мин өмнө | MyTasks — short relative time (derived) |
| `time.minutesAgo_other` | {{count}}m ago | {{count}} мин өмнө | MyTasks — short relative time (derived) |
| `time.hoursAgo_one` | {{count}}h ago | {{count}} цагийн өмнө | MyTasks — short relative time ("2h ago") |
| `time.hoursAgo_other` | {{count}}h ago | {{count}} цагийн өмнө | MyTasks — short relative time ("2h ago") |
| `time.yesterday` | Yesterday | Өчигдөр | MyTasks — feed time |

## `calendar` (71)

| key | en | mn (draft) | where |
|---|---|---|---|
| `allProjects` | All projects | Бүх төсөл | Calendar — breadcrumb after the space name |
| `spaceOptions` | Space options | Орон зайн сонголтууд | Calendar — header … button aria-label |
| `previousMonth` | Previous month | Өмнөх сар | Calendar — ‹ aria-label (month mode) |
| `previousWeek` | Previous week | Өмнөх долоо хоног | Calendar — ‹ aria-label (week mode) |
| `nextMonth` | Next month | Дараагийн сар | Calendar — › aria-label (month mode) |
| `nextWeek` | Next week | Дараагийн долоо хоног | Calendar — › aria-label (week mode) |
| `range` | Calendar range | Календарийн хугацаа | Calendar — Month/Week radiogroup aria-label |
| `month` | Month | Сар | Calendar — segmented option |
| `week` | Week | Долоо хоног | Calendar — segmented option |
| `showProjects` | Show projects | Харуулах төслүүд | Calendar — project toggle chips group aria-label |
| `period.month` | {{monthLong}} {{year}} | {{year}} оны {{m}}-р сар | Calendar — title, month mode ("October 2026") |
| `period.week` | {{monthShort}} {{startDay}} – {{endDay}}, {{year}} | {{year}} оны {{m}}-р сарын {{startDay}} – {{endDay}} | Calendar — title, week mode ("Oct 5 – 11, 2026") |
| `period.weekCrossMonth` | {{startMonthShort}} {{startDay}} – {{endMonthShort}} {{endDay}}, {{year}} | {{year}} оны {{startM}}-р сарын {{startDay}} – {{endM}}-р сарын {{endDay}} | Calendar — week title spanning two months (derived) |
| `period.weekCrossYear` | {{startMonthShort}} {{startDay}}, {{startYear}} – {{endMonthShort}} {{endDay}}, {{endYear}} | {{startYear}} оны {{startM}}-р сарын {{startDay}} – {{endYear}} оны {{endM}}-р сарын {{endDay}} | Calendar — week title spanning two years (derived) |
| `dayLabel_one` | {{date}}, {{count}} task | {{date}}, {{count}} ажил | Calendar — day cell / week column aria-label; date = format.weekdayLongDate |
| `dayLabel_other` | {{date}}, {{count}} tasks | {{date}}, {{count}} ажил | Calendar — day cell / week column aria-label; date = format.weekdayLongDate |
| `more_one` | +{{count}} more | +{{count}} бусад | Calendar — month cell overflow button |
| `more_other` | +{{count}} more | +{{count}} бусад | Calendar — month cell overflow button |
| `closePopover` | Close | Хаах | Calendar — day popover × aria-label |
| `pillTitle` | {{title}} — {{project}} | {{title}} — {{project}} | Calendar — pill title tooltip |
| `unscheduled` | Unscheduled | Огноогүй | Calendar — side panel heading (count follows) |
| `addUnscheduled` | Add unscheduled task | Огноогүй ажил нэмэх | Calendar — panel + aria-label |
| `filterUnscheduled` | Filter unscheduled tasks | Огноогүй ажлуудыг шүүх | Calendar — sr-only label of the panel filter |
| `filterPlaceholder` | Filter tasks | Ажил шүүх | Calendar — panel filter placeholder |
| `dragHint` | Drag a task onto a date to schedule it | Ажлыг огноо руу чирж хуваарьт оруулна уу | Calendar — panel hint |
| `unscheduledCard` | {{title}}, {{project}}, {{priority}} priority. Draggable. | {{title}}, {{project}}, ач холбогдол: {{priority}}. Чирж болно. | Calendar — unscheduled card aria-label |
| `allScheduled` | Everything is scheduled. | Бүх ажил огноотой байна. | Calendar — panel empty state |
| `weekdays.short.mon` | Mon | Да | Calendar — month header, week columns, chart labels |
| `weekdays.short.tue` | Tue | Мя | Calendar — weekday short |
| `weekdays.short.wed` | Wed | Лх | Calendar — weekday short |
| `weekdays.short.thu` | Thu | Пү | Calendar — weekday short |
| `weekdays.short.fri` | Fri | Ба | Calendar — weekday short |
| `weekdays.short.sat` | Sat | Бя | Calendar — weekday short |
| `weekdays.short.sun` | Sun | Ня | Calendar — weekday short |
| `weekdays.long.mon` | Monday | Даваа | Calendar — popover title, aria-labels, page date |
| `weekdays.long.tue` | Tuesday | Мягмар | Calendar — weekday long |
| `weekdays.long.wed` | Wednesday | Лхагва | Calendar — weekday long |
| `weekdays.long.thu` | Thursday | Пүрэв | Calendar — weekday long |
| `weekdays.long.fri` | Friday | Баасан | Calendar — weekday long |
| `weekdays.long.sat` | Saturday | Бямба | Calendar — weekday long |
| `weekdays.long.sun` | Sunday | Ням | Calendar — weekday long |
| `months.long.m1` | January | 1-р сар | Calendar — month name long |
| `months.long.m2` | February | 2-р сар | Calendar — month name long |
| `months.long.m3` | March | 3-р сар | Calendar — month name long |
| `months.long.m4` | April | 4-р сар | Calendar — month name long |
| `months.long.m5` | May | 5-р сар | Calendar — month name long |
| `months.long.m6` | June | 6-р сар | Calendar — month name long |
| `months.long.m7` | July | 7-р сар | Calendar — month name long |
| `months.long.m8` | August | 8-р сар | Calendar — month name long |
| `months.long.m9` | September | 9-р сар | Calendar — month name long |
| `months.long.m10` | October | 10-р сар | Calendar — month name long |
| `months.long.m11` | November | 11-р сар | Calendar — month name long |
| `months.long.m12` | December | 12-р сар | Calendar — month name long |
| `months.short.m1` | Jan | 1-р сар | Calendar — month name short |
| `months.short.m2` | Feb | 2-р сар | Calendar — month name short |
| `months.short.m3` | Mar | 3-р сар | Calendar — month name short |
| `months.short.m4` | Apr | 4-р сар | Calendar — month name short |
| `months.short.m5` | May | 5-р сар | Calendar — month name short |
| `months.short.m6` | Jun | 6-р сар | Calendar — month name short |
| `months.short.m7` | Jul | 7-р сар | Calendar — month name short |
| `months.short.m8` | Aug | 8-р сар | Calendar — month name short |
| `months.short.m9` | Sep | 9-р сар | Calendar — month name short |
| `months.short.m10` | Oct | 10-р сар | Calendar — month name short |
| `months.short.m11` | Nov | 11-р сар | Calendar — month name short |
| `months.short.m12` | Dec | 12-р сар | Calendar — month name short |
| `format.dateShort` | {{monthShort}} {{d}} | {{m}}-р сарын {{d}} | All screens — "Oct 14"; Calendar "Oct 1" on the 1st |
| `format.dateShortYear` | {{monthShort}} {{d}}, {{year}} | {{year}} оны {{m}}-р сарын {{d}} | All screens — date outside the current year (design-notes A.4) |
| `format.weekdayShortDate` | {{weekdayShort}}, {{monthShort}} {{d}} | {{m}}-р сарын {{d}}, {{weekdayShort}} | MyTasks This Week due/hint, CreateTask due presets ("Fri, Oct 9") |
| `format.weekdayLongDate` | {{weekdayLong}}, {{monthShort}} {{d}} | {{m}}-р сарын {{d}}, {{weekdayLong}} | Calendar day popover, MyTasks Today hint ("Thursday, Oct 8") |
| `format.weekdayLongDateFull` | {{weekdayLong}}, {{monthLong}} {{d}} | {{m}}-р сарын {{d}}, {{weekdayLong}} гараг | MyTasks — page date above greeting ("Thursday, October 8") |
| `format.time` | h:mm a | HH:mm | TaskDetail — time of day (date-fns pattern, "4:12 PM" / "16:12") |

## `create` (29)

| key | en | mn (draft) | where |
|---|---|---|---|
| `closeToList` | Close and return to list | Хаагаад жагсаалт руу буцах | CreateTask — scrim link aria-label |
| `heading` | New task | Шинэ ажил | CreateTask — modal title after the project chip |
| `close` | Close (Esc) | Хаах (Esc) | CreateTask — Esc button aria-label |
| `escKey` | Esc | Esc | CreateTask — kbd in the close button |
| `titlePlaceholder` | Task title | Ажлын нэр | CreateTask — title placeholder + sr-only label |
| `description` | Description | Тайлбар | CreateTask — sr-only label of the description |
| `descriptionPlaceholder` | Add a description… Markdown and @mentions work here | Тайлбар нэмэх… Markdown болон @дурдалт ажиллана | CreateTask — description placeholder |
| `searchPeople` | Search people | Хүн хайх | CreateTask — assignee picker search sr-only label |
| `assignTo` | Assign to… | Хэнд оноох… | CreateTask — assignee picker search placeholder |
| `you` | You | Та | CreateTask — role hint next to my name |
| `unassigned` | Unassigned | Хариуцагчгүй | CreateTask — assignee option with dashed avatar |
| `keys.navigate` | navigate | шилжих | CreateTask — assignee picker footer ("↑↓ navigate") |
| `keys.select` | select | сонгох | CreateTask — assignee picker footer ("↵ select") |
| `keys.unassign` | unassign | хасах | CreateTask — assignee picker footer ("⌫ unassign") |
| `typeDate` | Type a date | Огноо бичих | CreateTask — due picker search sr-only label |
| `typeDatePlaceholder` | Type a date, e.g. “next fri” | Огноо бичих, ж.нь «дараа баасан» | CreateTask — due picker search placeholder |
| `due.thisWeekend` | This weekend | Энэ амралтын өдөр | CreateTask — due preset (Sat) |
| `due.nextWeek` | Next week | Дараа долоо хоног | CreateTask — due preset (Mon) |
| `due.inTwoWeeks` | In two weeks | 2 долоо хоногийн дараа | CreateTask — due preset |
| `due.none` | No due date | Дуусах огноогүй | CreateTask — due preset |
| `searchProjects` | Search projects | Төсөл хайх | CreateTask — project picker search sr-only label |
| `moveToProject` | Move to project… | Төсөл сонгох… | CreateTask — project picker search placeholder |
| `project` | Project | Төсөл | CreateTask — project listbox aria-label + hints bar ("P Project") |
| `moreFields` | More fields | Бусад талбар | CreateTask — … chip aria-label |
| `createMore` | Create more | Дараалан үүсгэх | CreateTask — footer switch |
| `cancel` | Cancel | Болих | CreateTask — footer button |
| `submit` | Create task | Ажил үүсгэх | CreateTask — footer primary button |
| `hints.create` | Create | Үүсгэх | CreateTask — hints bar ("⌘↵ Create") |
| `hints.createAndOpen` | Create and open | Үүсгээд нээх | CreateTask — hints bar ("⇧⌘↵ Create and open") |

## `emptyProject` (16)

| key | en | mn (draft) | where |
|---|---|---|---|
| `newBadge` | New | Шинэ | EmptyProject — sidebar pill on projects created ≤ 7 days ago |
| `title` | {{project}} has no tasks yet | «{{project}}» төсөлд одоогоор ажил алга | EmptyProject — h1 |
| `body` | Add the first piece of work to get things moving. Tasks show up here grouped by status, and teammates you invite can pick them up. | Эхний ажлаа нэмээд эхлүүлээрэй. Ажлууд энд төлөвөөрөө бүлэглэгдэж харагдах ба таны урьсан хамт олон тэдгээрийг авч хийх боломжтой. | EmptyProject — body |
| `createFirst` | Create first task | Эхний ажлаа үүсгэх | EmptyProject — primary CTA (kbd C) |
| `importCsv` | Import from CSV | CSV-ээс импортлох | EmptyProject — secondary button (disabled in v1) |
| `comingSoon` | Coming soon | Тун удахгүй | EmptyProject — tooltip on the disabled Import button (design-notes §0) |
| `orTemplate` | Or start from a template | Эсвэл загвараас эхлэх | EmptyProject — templates heading |
| `templates.productLaunch.name` | Product launch | Бүтээгдэхүүн гаргах | EmptyProject — template card |
| `templates.productLaunch.desc_one` | {{count}} task across planning, build and go-live | Төлөвлөлт, хөгжүүлэлт, нээлтийн {{count}} ажил | EmptyProject — template card ("18 tasks …") |
| `templates.productLaunch.desc_other` | {{count}} tasks across planning, build and go-live | Төлөвлөлт, хөгжүүлэлт, нээлтийн {{count}} ажил | EmptyProject — template card ("18 tasks …") |
| `templates.sprintPlanning.name` | Sprint planning | Спринт төлөвлөлт | EmptyProject — template card |
| `templates.sprintPlanning.desc_one` | {{count}} task for a two-week cycle | Хоёр долоо хоногийн мөчлөгт {{count}} ажил | EmptyProject — template card ("12 tasks …") |
| `templates.sprintPlanning.desc_other` | {{count}} tasks for a two-week cycle | Хоёр долоо хоногийн мөчлөгт {{count}} ажил | EmptyProject — template card ("12 tasks …") |
| `templates.bugTriage.name` | Bug triage | Алдаа ангилах | EmptyProject — template card |
| `templates.bugTriage.desc_one` | {{count}} task plus priority and severity fields | {{count}} ажил, ач холбогдол ба ноцтой байдлын талбартай | EmptyProject — template card ("6 tasks …") |
| `templates.bugTriage.desc_other` | {{count}} tasks plus priority and severity fields | {{count}} ажил, ач холбогдол ба ноцтой байдлын талбартай | EmptyProject — template card ("6 tasks …") |

## `inbox` (15)

| key | en | mn (draft) | where |
|---|---|---|---|
| `markAllRead` | Mark all as read | Бүгдийг уншсан болгох | EmptyInbox — header button (disabled when none unread) |
| `notificationSettings` | Notification settings | Мэдэгдлийн тохиргоо | EmptyInbox — bell button aria-label + empty-state secondary button |
| `filter` | Inbox filter | Мэдэгдлийн шүүлтүүр | EmptyInbox — tablist aria-label |
| `tabs.all` | All | Бүгд | EmptyInbox — tab |
| `tabs.mentions` | Mentions | Дурдсан | EmptyInbox — tab |
| `tabs.assigned` | Assigned to me | Надад оноосон | EmptyInbox — tab |
| `tabs.archived` | Archived | Архивласан | EmptyInbox — tab |
| `empty.title` | You’re all caught up | Бүх мэдэгдлээ үзсэн байна | EmptyInbox — h2 |
| `empty.body` | Mentions, new assignments and comments on tasks you follow will land here. Notifications you’ve read are moved to Archived after 30 days. | Таныг дурдсан, танд шинээр оноосон болон таны дагадаг ажлын сэтгэгдлүүд энд ирнэ. Уншсан мэдэгдлүүд 30 хоногийн дараа Архивласан руу шилжинэ. | EmptyInbox — body |
| `empty.goToMyTasks` | Go to My Tasks | Миний ажлууд руу очих | EmptyInbox — primary button |
| `empty.viewArchived_one` | View {{count}} archived notification | Архивласан {{count}} мэдэгдэл харах | EmptyInbox — link ("View 24 archived notifications") |
| `empty.viewArchived_other` | View {{count}} archived notifications | Архивласан {{count}} мэдэгдэл харах | EmptyInbox — link ("View 24 archived notifications") |
| `empty.tip` | Tip: press &lt;kbd>G&lt;/kbd> then &lt;kbd>I&lt;/kbd> to jump here from anywhere | Зөвлөмж: хаанаас ч &lt;kbd>G&lt;/kbd>, дараа нь &lt;kbd>I&lt;/kbd> дарж энд шууд ирнэ | EmptyInbox — tip under the empty state (`<kbd>` = Trans component) |
| `markRead` | Mark as read | Уншсан болгох | Inbox — row hover action (derived; populated list not designed) |
| `archive` | Archive | Архивлах | Inbox — row hover action (derived; populated list not designed) |

## `table` / `filters` / `picker` additions (phase 9, derived)

| key | en | mn (draft) | where |
|---|---|---|---|
| `table.markIncomplete` | Mark {{name}} not complete | «{{name}}» ажлыг дуусаагүй болгох | List — checkbox aria-label on done rows |
| `table.addTaskPlaceholder` | Task name — Enter to add, Esc to cancel | Ажлын нэр — Enter дарж нэмэх, Esc дарж болих | List — inline add input |
| `table.newTaskTitle` | New task title | Шинэ ажлын нэр | List — inline add input aria-label |
| `table.noAssignee` | No assignee | Хариуцагчгүй | List — Group: Assignee, tasks without one |
| `table.noMatches` | No tasks match these filters | Шүүлтүүрт тохирох ажил алга | List — empty filtered result |
| `table.assigneeMore` | {{name}} +{{count}} | {{name}} +{{count}} | List — assignee cell with several people |
| `table.subtasks` | {{done}} of {{total}} subtasks done | {{total}} дэд ажлаас {{done}} дууссан | List — subtask counter (sr / title) |
| `table.comments_*` | {{count}} comment(s) | {{count}} сэтгэгдэл | List — comment counter (sr) |
| `table.setAssignee/setDue/setPriority/setTags` | Assignee of {{name}} … | «{{name}}» — хариуцагч … | List — cell picker buttons |
| `table.open` / `reopen` / `delete` | Open / Reopen / Delete | Нээх / Дахин нээх / Устгах | List — row "…" menu |
| `table.deleteConfirm` | Delete “{{name}}”? You can restore it later. | «{{name}}» ажлыг устгах уу? Дараа нь сэргээх боломжтой. | List — delete confirmation |
| `filters.fields.*` | Status, Assignee, Priority, Tags, Sprint, Due date | Төлөв, Хариуцагч, Ач холбогдол, Шошго, Спринт, Дуусах огноо | Filter menu fields |
| `filters.is.*` | Status is, Assignee is, Priority is, Tags include, Sprint is, Due | Төлөв:, Хариуцагч:, Ач холбогдол:, Шошго:, Спринт:, Дуусах огноо: | Filter chips (follows Main's "Спринт:") |
| `filters.me` | Me | Би | Assignee filter |
| `filters.clearAll` / `back` | Clear all / Back to filters | Бүгдийг арилгах / Шүүлтүүр рүү буцах | Filter menu |
| `filters.dueFrom` / `dueTo` | From / To | Эхлэх / Хүртэл | Due range inputs |
| `filters.duePresets.*` | Overdue, Due today, This week, Next week | Хоцорсон, Өнөөдөр дуусах, Энэ долоо хоног, Дараа долоо хоног | Due presets |
| `filters.fromDate` / `untilDate` | from {{date}} / until {{date}} | {{date}}-аас хойш / {{date}} хүртэл | One-sided due chip (suffix after a date — check harmony) |
| `filters.noSprints`, `searchPeople`, `searchTags` | No sprints yet, Search people, Search tags | Спринт алга, Хүн хайх, Шошго хайх | Filter menu |
| `picker.projectTeam` / `others` | Project team / Others | Төслийн баг / Бусад | Assignee picker groups |
| `picker.*Label` | Assignees, Due date, Priority, Tags | Хариуцагчид, Дуусах огноо, Ач холбогдол, Шошго | Picker listbox names |
| `drawer.dialogLabel` / `loadError` | Task {{key}} / Couldn't load this task. | {{key}} ажил / Ажлыг ачаалж чадсангүй. | Drawer shell |

## `drawer` additions (phase 10, derived)

Not drawn in TaskDetail.dc.html but needed by the same UI: editing states, menus, toasts and the history lines for every activity type.

| key | en | mn (draft) | where |
|---|---|---|---|
| `markIncomplete` | Mark incomplete | Дуусаагүй болгох | Drawer header — Mark complete on a done task |
| `copyFailed` | Couldn't copy the link | Холбоосыг хуулж чадсангүй | Toast — clipboard refused |
| `copyTitle` | {{title}} (copy) | {{title}} (хуулбар) | Duplicate — title of the copy |
| `duplicate` | Duplicate | Хуулбарлах | Drawer … menu |
| `duplicated` | Duplicated as {{key}} | Хуулбар үүслээ: {{key}} | Toast after Duplicate (action: Open) |
| `deleted` | {{key}} deleted | {{key}} устгагдлаа | Toast after Delete (action: Undo) |
| `undo` | Undo | Буцаах | Toast action |
| `movedTo` | Moved to {{project}} as {{key}} | Шилжүүллээ: {{project}} · {{key}} | Toast after Move to project |
| `notFound` | This task doesn't exist or was deleted. | Энэ ажил байхгүй эсвэл устгагдсан байна. | Drawer / full page — 404 |
| `startDate` | Start date | Эхлэх огноо | Due row — start date button / picker label |
| `starts` | Starts {{date}} | Эхлэх: {{date}} | Due row — future start date |
| `sprint` | Sprint | Спринт | Property label |
| `noSprint` | No sprint | Спринтгүй | Sprint property / picker option |
| `project` | Project | Төсөл | Property label (opens Move to project) |
| `descriptionPlaceholder` | Add a description… Markdown and @mentions work here | Тайлбар нэмэх… Markdown болон @дурдалт ажиллана | Empty description (copy from CreateTask) |
| `saving` | Saving… | Хадгалж байна… | Description autosave note |
| `saved` | Saved | Хадгалсан | Description autosave note |
| `saveFailed` | Couldn't save | Хадгалж чадсангүй | Description autosave note (+ Try again) |
| `linkPlaceholder` | Paste or type a link | Холбоос буулгах эсвэл бичих | Toolbar link popover input |
| `linkApply` | Apply | Хэрэглэх | Toolbar link popover button |
| `renameSubtask` | Subtask title | Дэд ажлын нэр | Subtask inline rename input |
| `subtaskDue` | Subtask due date | Дэд ажлын дуусах огноо | Subtask due picker |
| `subtaskAssignee` | Subtask assignee | Дэд ажлын хариуцагч | Subtask assignee picker |
| `subtaskOptions` | Subtask options | Дэд ажлын сонголтууд | Subtask … menu |
| `attachmentOptions` | Options for {{name}} | Сонголтууд: {{name}} | Attachment card … menu |
| `download` | Download | Татах | Attachment … menu |
| `uploading` | Uploading… | Хуулж байна… | Pending attachment card |
| `dropToAttach` | Drop files to attach them to {{key}} | Файлаа энд тавьж хавсаргана уу ({{key}}) | Overlay while dragging files over the drawer |
| `fileBlocked` | {{name}} can't be attached: this file type isn't allowed | {{name}}: энэ төрлийн файл хавсаргах боломжгүй | Toast — blocked file type |
| `fileTooLarge` | {{name}} is larger than 25 MB | {{name}}: 25 MB-аас том байна | Toast — over 25 MB |
| `uploadFailed` | Couldn't upload {{name}} | Хуулж чадсангүй: {{name}} | Toast — upload error |
| `activityError` | Couldn't load the activity. | Үйл ажиллагааг ачаалж чадсангүй. | Activity — load error |
| `noComments` | Nothing here yet | Одоогоор юу ч алга | Activity — empty tab |
| `writeReply` | Write a reply | Хариулт бичих | Reply composer aria-label |
| `commentPlaceholder` | Write a comment… @ to mention | Сэтгэгдэл бичих… @ дарж дурдана | Composer placeholder |
| `replyPlaceholder` | Reply… @ to mention | Хариулах… @ дарж дурдана | Reply composer placeholder |
| `commentFailed` | Couldn't post the comment | Сэтгэгдлийг илгээж чадсангүй | Toast — comment not posted (text restored) |
| `editComment` | Edit | Засах | Comment … menu / edit editor label |
| `saveComment` | Save | Хадгалах | Comment edit button |
| `edited` | (edited) | (зассан) | Comment header after an edit |
| `commentDeleted` | This comment was deleted | Энэ сэтгэгдэл устгагдсан | Tombstone of a deleted comment with replies |
| `deleteCommentConfirm` | Delete this comment? | Энэ сэтгэгдлийг устгах уу? | Confirm before deleting a comment |
| `hideReplies` | Hide replies | Хариултуудыг нуух | Thread toggle when expanded |
| `toolbar.heading` | Heading | Гарчиг | Description toolbar Text ▾ menu |
| `toolbar.subheading` | Subheading | Дэд гарчиг | Description toolbar Text ▾ menu |
| `history.duplicated` | &lt;b>{{actor}}&lt;/b> duplicated this task from &lt;b>{{key}}&lt;/b> | &lt;b>{{actor}}&lt;/b> энэ ажлыг хуулбарласан (эх: &lt;b>{{key}}&lt;/b>) | History line |
| `history.titleChanged` | &lt;b>{{actor}}&lt;/b> renamed this task to &lt;b>{{to}}&lt;/b> | &lt;b>{{actor}}&lt;/b> нэрийг өөрчилсөн: &lt;b>{{to}}&lt;/b> | History line |
| `history.descriptionChanged` | &lt;b>{{actor}}&lt;/b> updated the description | &lt;b>{{actor}}&lt;/b> тайлбарыг шинэчилсэн | History line |
| `history.dueSet` | &lt;b>{{actor}}&lt;/b> set the due date to &lt;b>{{to}}&lt;/b> | &lt;b>{{actor}}&lt;/b> дуусах огноог тохируулсан: &lt;b>{{to}}&lt;/b> | History line |
| `history.dueChanged` | &lt;b>{{actor}}&lt;/b> changed the due date from {{from}} to &lt;b>{{to}}&lt;/b> | &lt;b>{{actor}}&lt;/b> дуусах огноог өөрчилсөн: {{from}} → &lt;b>{{to}}&lt;/b> | History line |
| `history.dueCleared` | &lt;b>{{actor}}&lt;/b> removed the due date | &lt;b>{{actor}}&lt;/b> дуусах огноог арилгасан | History line |
| `history.startSet` | &lt;b>{{actor}}&lt;/b> set the start date to &lt;b>{{to}}&lt;/b> | &lt;b>{{actor}}&lt;/b> эхлэх огноог тохируулсан: &lt;b>{{to}}&lt;/b> | History line |
| `history.startChanged` | &lt;b>{{actor}}&lt;/b> changed the start date from {{from}} to &lt;b>{{to}}&lt;/b> | &lt;b>{{actor}}&lt;/b> эхлэх огноог өөрчилсөн: {{from}} → &lt;b>{{to}}&lt;/b> | History line |
| `history.startCleared` | &lt;b>{{actor}}&lt;/b> removed the start date | &lt;b>{{actor}}&lt;/b> эхлэх огноог арилгасан | History line |
| `history.sprintSet` | &lt;b>{{actor}}&lt;/b> moved this task to &lt;b>{{to}}&lt;/b> | &lt;b>{{actor}}&lt;/b> спринтэд оруулсан: &lt;b>{{to}}&lt;/b> | History line |
| `history.sprintCleared` | &lt;b>{{actor}}&lt;/b> removed this task from &lt;b>{{from}}&lt;/b> | &lt;b>{{actor}}&lt;/b> спринтээс хассан: &lt;b>{{from}}&lt;/b> | History line |
| `history.assigneeAdded` | &lt;b>{{actor}}&lt;/b> assigned &lt;b>{{name}}&lt;/b> | &lt;b>{{actor}}&lt;/b> хариуцагч нэмсэн: &lt;b>{{name}}&lt;/b> | History line |
| `history.assigneeRemoved` | &lt;b>{{actor}}&lt;/b> unassigned &lt;b>{{name}}&lt;/b> | &lt;b>{{actor}}&lt;/b> хариуцагч хассан: &lt;b>{{name}}&lt;/b> | History line |
| `history.tagAdded` | &lt;b>{{actor}}&lt;/b> added the tag &lt;b>{{name}}&lt;/b> | &lt;b>{{actor}}&lt;/b> шошго нэмсэн: &lt;b>{{name}}&lt;/b> | History line |
| `history.tagRemoved` | &lt;b>{{actor}}&lt;/b> removed the tag &lt;b>{{name}}&lt;/b> | &lt;b>{{actor}}&lt;/b> шошго хассан: &lt;b>{{name}}&lt;/b> | History line |
| `history.subtaskAdded` | &lt;b>{{actor}}&lt;/b> added subtask &lt;b>{{title}}&lt;/b> | &lt;b>{{actor}}&lt;/b> дэд ажил нэмсэн: &lt;b>{{title}}&lt;/b> | History line |
| `history.attachmentRemoved` | &lt;b>{{actor}}&lt;/b> removed &lt;b>{{filename}}&lt;/b> | &lt;b>{{actor}}&lt;/b> хавсралт устгасан: &lt;b>{{filename}}&lt;/b> | History line |
| `history.projectChanged` | &lt;b>{{actor}}&lt;/b> moved this task from &lt;b>{{from}}&lt;/b> to &lt;b>{{to}}&lt;/b> | &lt;b>{{actor}}&lt;/b> өөр төсөлд шилжүүлсэн: &lt;b>{{from}}&lt;/b> → &lt;b>{{to}}&lt;/b> | History line |
| `history.deleted` | &lt;b>{{actor}}&lt;/b> deleted this task | &lt;b>{{actor}}&lt;/b> энэ ажлыг устгасан | History line |
| `history.restored` | &lt;b>{{actor}}&lt;/b> restored this task | &lt;b>{{actor}}&lt;/b> энэ ажлыг сэргээсэн | History line |

## `board` additions (phase 11, derived)

| key | en | mn (draft) | where |
|---|---|---|---|
| `label` | {{project}} board | {{project}} — самбар | Board region aria-label |
| `columnsBy` | Columns by | Баганаар | "Columns: Status" menu aria-label |
| `moveFailed` | Couldn't move the task | Ажлыг шилжүүлж чадсангүй | Toast — move rolled back |
| `collapseColumn` | Collapse {{status}} | «{{status}}» баганыг хураах | Column … menu |
| `expandColumn` | Expand {{status}} | «{{status}}» баганыг дэлгэх | Column … menu / collapsed strip |
| `addTaskPlaceholder` | Task name — Enter to add | Ажлын нэр — Enter дарж нэмэх | Column inline add input |
| `dnd.instructions` | To pick up a card, press Space. Use the arrow keys to move it, Space to drop it in place, or Escape to cancel. | Картыг авахын тулд Space дарна уу. Сумаар зөөж, Space дарж тавина, Esc дарж болино. | Screen-reader drag announcement |
| `dnd.picked` | Picked up {{title}}. | «{{title}}» ажлыг авлаа. | Screen-reader drag announcement |
| `dnd.over` | {{title}} is over {{status}}. | «{{title}}» → {{status}}. | Screen-reader drag announcement |
| `dnd.notOver` | {{title}} is not over a column. | «{{title}}» баганын гадна байна. | Screen-reader drag announcement |
| `dnd.dropped` | {{title}} was dropped in {{status}}. | «{{title}}» шилжлээ: {{status}}. | Screen-reader drag announcement |
| `dnd.cancelled` | Moving {{title}} was cancelled. | «{{title}}» шилжүүлэлтийг цуцаллаа. | Screen-reader drag announcement |

## `inbox` additions (phase 15, derived)

Rows reuse the `myTasks.feed.*` sentences with the task key in `<task>` (the title follows it).

| key | en | mn (draft) | where |
|---|---|---|---|
| `unarchive` | Move to inbox | Ирсэн мэдэгдэл рүү буцаах | Row action on archived rows |
| `archived` | {{key}} archived | {{key}} архивлагдлаа | Toast after archiving (with Undo) |
| `showOlder` | Show older notifications | Өмнөх мэдэгдлүүдийг харах | List footer |
| `emptyTab.mentions` | No one has mentioned you yet | Таныг одоогоор хэн ч дурдаагүй байна | Mentions tab, empty |
| `emptyTab.assigned` | No new assignments | Шинээр оноосон ажил алга | Assigned tab, empty |
| `emptyTab.archived` | No archived notifications | Архивласан мэдэгдэл алга | Archived tab, empty |
| `common.undo` | Undo | Буцаах | Toast action |

## `settings` (phase 15, derived — Settings is not designed)

| key | en | mn (draft) |
|---|---|---|
| `tabsLabel` | Settings sections | Тохиргооны хэсгүүд |
| `tabs.profile` | Profile | Профайл |
| `tabs.preferences` | Preferences | Тохируулга |
| `tabs.notifications` | Notifications | Мэдэгдэл |
| `tabs.members` | Members | Гишүүд |
| `profile.name` | Name | Нэр |
| `profile.nameHint` | Shown on tasks, comments and mentions. | Ажил, сэтгэгдэл, дурдалт дээр харагдана. |
| `profile.nameInvalid` | Enter your name | Нэрээ оруулна уу |
| `profile.avatarColor` | Initials color | Нэрийн үсгийн өнгө |
| `profile.avatarColorHint` | The background of your avatar. | Таны аватарын дэвсгэр өнгө. |
| `profile.email` | Email | Имэйл |
| `profile.emailHint` | Used to sign in. | Нэвтрэхэд ашиглана. |
| `colors.indigo` | Indigo | Хөх ягаан |
| `colors.green` | Green | Ногоон |
| `colors.rose` | Rose | Сарнай |
| `colors.amber` | Amber | Хув |
| `colors.sky` | Sky | Тэнгэр цэнхэр |
| `colors.purple` | Purple | Нил ягаан |
| `colors.teal` | Teal | Оюу |
| `colors.yellow` | Yellow | Шар |
| `preferences.languageHint` | Language of the interface. | Интерфэйсийн хэл. |
| `preferences.timezone` | Time zone | Цагийн бүс |
| `preferences.timezoneHint` | Today, Tomorrow and Overdue follow this zone. | Өнөөдөр, Маргааш, Хугацаа хэтэрсэн нь энэ бүсээр тооцогдоно. |
| `preferences.timezoneSearch` | Search time zones | Цагийн бүс хайх |
| `preferences.themeHint` | System follows your device. | Систем нь таны төхөөрөмжийг дагана. |
| `preferences.accent` | Accent color | Онцлох өнгө |
| `preferences.accentHint` | Buttons, links and highlights. | Товч, холбоос, тодруулга. |
| `preferences.density` | Density | Нягтрал |
| `preferences.densityHint` | Row height in lists. | Жагсаалтын мөрийн өндөр. |
| `preferences.comfortable` | Comfortable | Чөлөөтэй |
| `preferences.compact` | Compact | Нягт |
| `accents.violet` | Violet | Нил ягаан |
| `accents.blue` | Blue | Цэнхэр |
| `accents.teal` | Teal | Оюу |
| `accents.graphite` | Graphite | Бараан саарал |
| `notifications.intro` | Choose what lands in your Inbox. You’re never notified about your own actions. | Ирсэн мэдэгдэлд юу орохыг сонгоно уу. Өөрийн үйлдлийн талаар мэдэгдэл ирэхгүй. |
| `notifications.mention` | Mentions | Дурдалт |
| `notifications.mentionHint` | Someone @mentions you in a comment or description. | Хэн нэгэн таныг сэтгэгдэл эсвэл тайлбарт @дурдах үед. |
| `notifications.assigned` | Assignments | Оноолт |
| `notifications.assignedHint` | You’re added as an assignee. | Таныг хариуцагчаар нэмэх үед. |
| `notifications.comment` | Comments | Сэтгэгдэл |
| `notifications.commentHint` | New comments on tasks you follow. | Таны дагадаг ажилд шинэ сэтгэгдэл бичих үед. |
| `notifications.status` | Status changes | Төлөвийн өөрчлөлт |
| `notifications.statusHint` | A task you follow moves to another status. | Таны дагадаг ажлын төлөв өөрчлөгдөх үед. |
| `roles.owner` | Owner | Эзэмшигч |
| `roles.admin` | Admin | Админ |
| `roles.member` | Member | Гишүүн |
| `members.adminsOnly` | Only admins can invite people and change roles. | Зөвхөн админ хүн урьж, үүрэг өөрчилнө. |
| `members.inviteHint` | Creates a link to share with them. It’s valid for 7 days. | Хуваалцах холбоос үүснэ. 7 хоног хүчинтэй. |
| `members.role` | Role | Үүрэг |
| `members.send` | Create invite | Урилга үүсгэх |
| `members.sent` | Invite created for {{email}} | Урилга үүслээ: {{email}} |
| `members.linkFor` | Invite link for {{email}} | Урилгын холбоос: {{email}} |
| `members.linkOnce` | Send it to them yourself, e.g. in chat. It’s shown only once: invite again for a new link. | Холбоосыг өөрөө, жишээ нь чатаар илгээнэ үү. Зөвхөн нэг удаа харагдана: шинэ холбоос авахын тулд дахин урина уу. |
| `members.alreadyMember` | {{email}} is already in the workspace | {{email}} аль хэдийн багт байна |
| `members.invalidEmail` | Enter a valid email | Зөв имэйл оруулна уу |
| `members.pending` | Pending invites | Хүлээгдэж буй урилга |
| `members.expires` | expires {{date}} | дуусах: {{date}} |
| `members.revoke` | Revoke | Цуцлах |
| `members.revoked` | Invite to {{email}} revoked | Урилгыг цуцаллаа: {{email}} |
| `members.list` | Members | Гишүүд |
| `members.count_one` | {{count}} person | {{count}} хүн |
| `members.count_other` | {{count}} people | {{count}} хүн |
| `members.you` | (you) | (та) |
| `members.changeRole` | Change role of {{name}} | Үүрэг өөрчлөх: {{name}} |

## `errors` + toasts (phase 15, derived)

| key | en | mn (draft) |
|---|---|---|
| `errors.NOT_FOUND` | This item no longer exists or you lost access to it. | Энэ зүйл устсан эсвэл танд хандах эрх алга. |
| `errors.FORBIDDEN` | You don’t have permission to do that. | Танд үүнийг хийх эрх алга. |
| `errors.RATE_LIMITED` | Too many attempts. Wait a minute and try again. | Хэт олон оролдлого. Нэг минут хүлээгээд дахин оролдоно уу. |
| `errors.FILE_TOO_LARGE` | That file is too large (25 MB max). | Файл хэт том байна (дээд тал нь 25 MB). |
| `errors.FILE_TYPE_BLOCKED` | That file type isn’t allowed. | Энэ төрлийн файл зөвшөөрөгдөхгүй. |
| `errors.UNAUTHORIZED` | Your session ended. Sign in again. | Таны нэвтрэлт дууссан. Дахин нэвтэрнэ үү. |
| `errors.network` | Can’t reach the server. Check your connection and try again. | Сервертэй холбогдож чадсангүй. Холболтоо шалгаад дахин оролдоно уу. |
| `common.completed` | {{key}} completed | {{key}} дууслаа |

## Standup write: phone + autosave (derived, 2026-10-16)

`suggestedShort`, `addTodayShort` and `closeShort` come from `StandupWriteMobile.dc.html` `STR.mn`; the rest is drafted.

| key | en | mn (draft) |
|---|---|---|
| `standup.write.saving` | Saving… | Хадгалж байна… |
| `standup.write.autosaved` | Draft saved {{time}} | Ноорог хадгалагдсан {{time}} |
| `standup.write.saveFailed` | Couldn’t save the draft | Ноорог хадгалагдсангүй |
| `shell.openNavigation` | Open navigation | Цэс нээх |
| `shell.closeNavigation` | Close navigation | Цэс хаах |

## Standup live mode and polish (derived, 2026-10-16)

The live screen's own labels (speaking order, total time, Previous/Next/Finish, Up next, Meeting notes, Tasks created, Create task / Created, From …'s blocker/plan, Save notes to standup) come from `StandupLive.dc.html` `STR.mn`. The follower view, the before/after states, the day page's Meeting notes section, the split nudge and the field-test fixes aren't designed; their Mongolian is drafted:

| key | en | mn (draft) |
|---|---|---|
| `standup.live.sub` | {{date}} · {{time}} | {{date}} · {{time}} |
| `standup.live.live` | Live | Шууд |
| `standup.live.timeOf` | {{name}}’s time | {{name}}-ын хугацаа |
| `standup.live.overTime` | over time | хугацаа хэтэрсэн |
| `standup.live.keysHint` | ← → to move between people | ← → товчоор хүн солих |
| `standup.live.notPosted` | hasn’t posted | бичээгүй |
| `standup.live.nothing` | Nothing written | Бичээгүй |
| `standup.live.createFor` | Create task: {{text}} | Ажил үүсгэх: {{text}} |
| `standup.live.notesSaving` | Saving… | Хадгалж байна… |
| `standup.live.notesSavedDraft` | Autosaved | Автоматаар хадгалсан |
| `standup.live.notesFailed` | Couldn’t save. Retrying when you type again. | Хадгалж чадсангүй. Дахин бичихэд дахин оролдоно. |
| `standup.live.noNotes` | No notes yet. | Тэмдэглэл алга. |
| `standup.live.fromBlocker` | From {{name}}’s blocker · {{project}} | {{name}}-ын саадаас · {{project}} |
| `standup.live.fromPlan` | From {{name}}’s plan · {{project}} | {{name}}-ын төлөвлөгөөнөөс · {{project}} |
| `standup.live.notesSavedToast` | Notes saved to the standup page. | Тэмдэглэлийг стэндапын хуудсанд хадгаллаа. |
| `standup.live.notesSavedAt` | On the standup page since {{time}} | {{time}}-аас стэндапын хуудсанд харагдаж байна |
| `standup.live.descriptionFrom` | From the {{group}} standup on {{date}} | {{group}} бүлгийн {{date}}-ны стэндапаас |
| `standup.live.followingHint` | {{name}} runs the meeting. This page moves with them. | Уулзалтыг {{name}} хөтөлж байна. Энэ хуудас хамт шилжинэ. |
| `standup.live.notStarted` | The meeting hasn’t started yet | Уулзалт хараахан эхлээгүй байна |
| `standup.live.notStartedDriver` | Start when everyone is here. The speaking order is fixed when you start. | Бүгд ирсэн үед эхлүүлээрэй. Эхлүүлэхэд ярих дараалал тогтоно. |
| `standup.live.notStartedFollower` | This page follows along once {{name}} starts it. | {{name}} эхлүүлмэгц энэ хуудас дагаж харуулна. |
| `standup.live.notStartedNobody` | This page follows along once the facilitator starts it. | Хөтлөгч эхлүүлмэгц энэ хуудас дагаж харуулна. |
| `standup.live.backToStandup` | Back to standup | Стэндап руу буцах |
| `standup.live.ended` | Meeting ended | Уулзалт дууслаа |
| `standup.live.endedSummary_one` | Took {{duration}} · {{count}} task created | {{duration}} үргэлжилсэн · {{count}} ажил үүсгэсэн |
| `standup.live.endedSummary_other` | Took {{duration}} · {{count}} tasks created | {{duration}} үргэлжилсэн · {{count}} ажил үүсгэсэн |
| `standup.live.everyoneOut` | Everyone in the group is out of office today: there is nobody to go through. | Өнөөдөр бүлгийн бүх гишүүн чөлөөтэй тул ярих хүн алга. |
| `standup.live.noMeetingTime` | This group meets async only: there is no meeting time in its settings. | Энэ бүлэг зөвхөн бичгээр стэндап хийдэг: тохиргоонд уулзалтын цаг алга. |
| `standup.live.notToday` | A meeting runs on its own day only. | Уулзалтыг зөвхөн тухайн өдөрт нь хийнэ. |
| `standup.live.longMeeting` | {{people}} people × {{minutes}} min is longer than the {{total}} min meeting. | {{people}} хүн × {{minutes}} мин нь {{total}} минутын уулзалтаас урт байна. |
| `standup.live.minutes` | {{count}} min | {{count}} мин |
| `standup.live.endFailed` | Couldn’t end the meeting. | Уулзалтыг дуусгаж чадсангүй. |
| `standup.day.joinLive` | Join live | Шууд нэгдэх |
| `standup.day.liveNow` | The standup meeting is live | Стэндап уулзалт явагдаж байна |
| `standup.day.liveNowBy` | {{name}} is running the standup meeting | {{name}} стэндап уулзалтыг хөтөлж байна |
| `standup.day.meetingNotes` | Meeting notes | Уулзалтын тэмдэглэл |
| `standup.day.meetingBy` | Run by {{name}} · {{duration}} | Хөтлөгч {{name}} · {{duration}} |
| `standup.day.meetingTasks` | Tasks created | Үүсгэсэн ажлууд |
| `standup.day.noMeetingNotes` | No notes were written. | Тэмдэглэл бичээгүй. |
| `standup.day.leftGroup` | no longer in this group | бүлгээс гарсан |
| `standup.day.everyoneOut` | Everyone is out of office | Бүгд чөлөөтэй |
| `standup.day.moreBlockers_one` | Show {{count}} more blocker | Өөр {{count}} саад харуулах |
| `standup.day.moreBlockers_other` | Show {{count}} more blockers | Өөр {{count}} саад харуулах |
| `standup.splitHint` | {{count}} people is a lot for one standup: updates get long and the meeting runs over. Consider splitting into teams of up to {{max}}. | Нэг стэндапад {{count}} хүн их байна: шинэчлэлүүд урт болж, уулзалт хэтэрнэ. {{max}} хүртэлх хүнтэй баг болгон хуваахыг бодоорой. |
| `standup.write.moreSuggestions_one` | Show {{count}} more suggestion | Өөр {{count}} санал харуулах |
| `standup.write.moreSuggestions_other` | Show {{count}} more suggestions | Өөр {{count}} санал харуулах |
| `inbox.standupWaiting` | Your {{group}} standup is waiting for your update | «{{group}}» стэндапад таны шинэчлэл хүлээгдэж байна |

## Mobile app (B2, 2026-10-26)

`apps/mobile/src/i18n/locales/` reuses web keys with the web's exact text (a test enforces it). New mobile-only keys (Mongolian from `MobileFoundations.dc.html` `STR.mn`, not drafted):

| key | en | mn | where |
|---|---|---|---|
| `tabs.myTasks` | My Tasks | Миний ажил | Tab bar (the web's `shell.myTasks` is "Миний ажлууд") |
| `tabs.projects` | Projects | Төслүүд | Tab bar |
| `tabs.inbox` | Inbox | Мэдэгдэл | Tab bar |
| `tabs.standup` | Standup | Стэндап | Tab bar |
| `tabs.more` | More | Бусад | Tab bar |

## Mobile data layer and auth screens (B3, 2026-10-26)

Sign in, invite, No workspace and the workspace switcher reuse the web's `auth.*`, `invite.*`, `workspace.*`, `shell.switchWorkspace`, `shell.unread_*`, `settings.roles.*`, `errors.network` keys. New mobile-only keys (Mongolian from `MobileAuth.dc.html` `STR.mn` where it has the line; the rest drafted):

| key | en | mn | source |
|---|---|---|---|
| `auth.forgotPassword` | Forgot password? | Нууц үгээ мартсан уу? | design |
| `auth.forgotPasswordBody` | Ask your admin for a password reset link. Open it on this phone or a computer to set a new password. | Админаасаа нууц үг сэргээх холбоос хүсээрэй. Холбоосыг энэ утас эсвэл компьютер дээрээ нээж шинэ нууц үг тохируулна. | drafted (no self-service reset) |
| `auth.lockedTitle` | Too many attempts | Хэт олон удаа буруу оролдлоо | design |
| `auth.lockedBody` | For your security, signing in is paused for a few minutes. | Аюулгүй байдлын үүднээс нэвтрэлтийг хэдэн минут түр зогсоолоо. | drafted (the design's "5 minutes" isn't the throttle's window; the button counts down `Retry-After`) |
| `auth.lockedButton` | Try again in {{time}} | {{time}}-ийн дараа оролдоно уу | design |
| `workspace.checkAgain` | Check again | Дахин шалгах | design |
| `workspace.switcherTitle` | Workspaces | Ажлын орчин | design |
| `workspace.switcherLegend` | Number — unread notifications for you | Тоо — танд хамаатай уншаагүй мэдэгдэл | design, without the "dot — new activity" half (no such data) |
| `workspace.current` | Current workspace | Одоогийн ажлын орчин | drafted (screen reader) |
| `workspace.joinWithLink` | Join with an invite link | Урилгын холбоосоор нэгдэх | design |
| `workspace.joinLinkPlaceholder` | Paste the link from your invite | Урилгын холбоосоо энд буулгана уу | drafted |
| `workspace.joinLinkOpen` | Open invite | Урилга нээх | drafted |
| `workspace.joinLinkInvalid` | That doesn’t look like an invite link. | Энэ урилгын холбоос биш бололтой. | drafted |
| `workspace.signOutOf` | Sign out of {{email}} | {{email}}-ээс гарах | design (the suffix doesn't follow the email's vowels) |

## Open questions

1. **Unscheduled**: drafted "Огноогүй" (no date) rather than "Хуваарьгүй"; the hint uses "…хуваарьт оруулна уу". Pick one term.
2. **Activity**: "Үйл ажиллагаа" (section), "Сүүлийн үйл ажиллагаа" (Recent activity); tabs Бүгд / Сэтгэгдэл / Түүх.
3. **Comment button** in the composer drafted as "Илгээх" (Send).
4. **Weekday + date** (mn "10-р сарын 9, Ба" vs en "Fri, Oct 9"): order, and width in My Tasks' 100px due column.
5. **Due picker placeholder** «дараа баасан»: the phase 12 parser understands it (next week's Friday, like English "next fri"), plus өнөөдөр, маргааш, нөгөөдөр, дараа долоо хоног, weekday names, «N хоногийн дараа» and «10-р сарын 14».
6. **Inbox empty title**: "Бүх мэдэгдлээ үзсэн байна" (not literal).
7. **Template names**: "Бүтээгдэхүүн гаргах" (Product launch), "Алдаа ангилах" (Bug triage).
8. **Dropzone**: "Drop files or browse" split so "browse" is a `<browse>` link (assumption).
9. **"of {{count}} left"**: mn adds "ажлаас" to avoid a suffix on a number.
10. **"Task title"** drafted as "Ажлын нэр" (same as the "Task name" column).
11. **`filters.fromDate`** "{{date}}-аас хойш": the suffix follows a date ("10-р сарын 14-аас"); fine for "сарын N" forms, but review.

Shell strings added in phase 8 that are not in any design (user menu theme labels, "Copy link", "Space options", error/not-found pages, picker hints) are drafted the same way; keys: `common.*` (retry, cancel, create, close, noResults, errorTitle, errorBody, reload, notFoundTitle, notFoundBody, goToMyTasks, comingSoon), `shell.{switchWorkspace, unread, openTasks, spaceName, createSpace, newBadge, accountMenu, theme*, loadError}`, `header.{unfavorite, shareHint, spaceOptions, copyLink, linkCopied, allProjects}`, `toolbar.{activeFilters, sortBy, groupBy, sortFields.*, groupFields.*}`, `priority.none`, `dates.{yesterday, overdue}`, `picker.*`.
12. **Settings terms**: "Тохируулга" (Preferences) vs "Тохиргоо" (Settings); "Онцлох өнгө" (Accent color); "Нягтрал" Чөлөөтэй/Нягт (Density); role names Эзэмшигч / Админ / Гишүүн.

## Reports (pending, drafted when the screens are built)

All Reports designs ship a full `STR.mn` table: take Mongolian copy from them as-is. Only these are missing from the designs and will be drafted here when Reports is built:
- **Size** (TaskDetail has English only) — drafted in the report-data phase, keys `taskSize.*`: "Хэмжээ" (Size, from the Workload `STR.mn`), "{{count}} оноо", option titles "L = 5 оноо · Том · 3–4 өдөр" (Жижиг · хагас өдөр орчим / Дунд · 1–2 өдөр / Том · 3–4 өдөр / Маш том · долоо хоног орчим, хуваахыг бодоорой), hint "= 5 оноо · Ачаалал болон Гүйцэтгэлийн хурдны тайланд ашиглана", unsized "Хэмжээгүй · …". Also `table.colSize` / `table.setSize`, `create.size`, `toolbar.columns*` ("Багана", "Багана харуулах").
- **Reviewer** (no design): `drawer.reviewer` "Хянагч", `drawer.noReviewer` "Хянагчгүй"; history lines `drawer.history.reviewerSet` "хянагч томилсон: …", `reviewerCleared`, `sizeSet/sizeChanged/sizeCleared`.
- **Unnamed sprints**: `sprint.name` "{{number}}-р спринт" (from ReportsSprints `STR.mn`).
- **Settings → Members**: `settings.members.jobTitle*` "Албан тушаал", `capacity*` "Багтаамж", unit "оноо / 2 д.х" (2 долоо хоног; review the abbreviation), hint about the Workload marker.
- **Derived Reports strings**: bad-delta labels, burndown insight variants (on track / behind), waits insight variants ("about N times", "X days longer"), past-sprint burndown title, "N unsized", Custom period popover (From / To / Apply), required project picker on Sprints ("Choose a project"), "Capacity" setting in Settings, CSV column headers. Added after the design critique (2026-10-30): `reports.throughput.last12|prev12|selected`, `reports.cards.overdue` "Одоо хугацаа хэтэрсэн", `reports.delta.pctPoints*` ("хувийн пункт" for screen readers), `reports.waits.insight.*` "медианаар" (was "дунджаар", which means average), `reports.refresh`, `reports.chartExplore`, `reports.filters.period`, `reports.person.helping.allAnswered|unanswered`.
13. **Seed job titles** in mn come from the People/Workload `STR` data (e.g. "Фронтенд хөгжүүлэгч", "Инженерийн ахлагч"); "QA" (Bayarmaa) is not in the designs, drafted as "Чанарын баталгаажуулалт" or kept as "QA".

## Feedback (drafted 2026-10-19)

The feedback designs ship `STR.mn` tables for the inbox, empty state, detail, create-task modal, duplicates and public form; those strings are used as-is. Drafted here (no Mongolian in the designs):
- **Task drawer "Linked feedback"** (`TaskDetail.dc.html` is English only), keys `feedback.task.*`: "Холбосон санал хүсэлт", "{{count}} хэрэглэгч мэдээлсэн", "Санал хүсэлт холбох", search "Холбоогүй санал хүсэлтийг гарчиг, ID, илгээгчээр хайх…", empty "Санал хүсэлт холбоогүй байна.", "Дахиад {{count}}-г харах" / "Цөөнийг харах" (review the suffix after a number).
- **Activity lines not drawn** (`feedback.detail.event.*`): "{{key}} ажлаас салгасан", "{{key}} устгагдсан тул салгасан", "хариуцагчийг хассан · {{key}} шинэчлэгдсэн"; toasts `feedback.bulk.*`, `feedback.detail.{linked,unlinked,failed,noteFailed}`, `feedback.create.{created,failed}`, `feedback.duplicates.{closedAll,notifySubject}`.
- **Public form messages not drawn** (`feedbackPublic.*`): file type not allowed, upload failed / rate limited / storage full, the file limit note, "too long" errors, 429 "try again in N minutes", send failure. The intro reads "{{workspace}} баг …" instead of the design's "Kite Studio-гийн баг" (the genitive suffix depends on the name).
- **"Reply by email" subject**: "Re: {{title}} ({{ref}})"; "Notify all" subject "Таны илгээсэн санал хүсэлтийн талаар ({{refs}})".
