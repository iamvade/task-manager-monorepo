# Feedback feature – design reference (from Claude Design)

These are design references, not production code. Match layout, spacing, colors, copy (mn + en) and states; implement with the app's own components and i18n. The per-screen language toggles are design-preview only: the app's global language selector replaces them.

| File | Screen |
|---|---|
| Main.dc.html | Sidebar with the new Feedback item + unread badge |
| Feedback.dc.html | Feedback inbox (filters, table, bulk actions) |
| FeedbackEmpty.dc.html | Inbox empty state |
| FeedbackDetail.dc.html | Feedback detail panel (unlinked / task picker / linked / lightbox states) |
| FeedbackCreateTask.dc.html | Create task from feedback modal |
| FeedbackDuplicates.dc.html | Detail with several reports linked to one task |
| TaskDetail.dc.html | Task detail with Linked feedback section |
| PublicFeedback.dc.html | Public submission page (form state; contains all scenes) |
| PublicFeedbackSuccess.dc.html | Desktop success scene |
| PublicFeedbackMobileErrors.dc.html | Mobile validation errors scene |
| PublicFeedbackMobileLoading.dc.html | Mobile submitting scene |
| PublicFeedbackMobileSuccess.dc.html | Mobile success scene |

Note: the small PublicFeedback*Success/Mobile* files only set a scene/viewport on PublicFeedback.dc.html; all markup and logic lives in PublicFeedback.dc.html.
