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

## `myTasks` (39)

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
