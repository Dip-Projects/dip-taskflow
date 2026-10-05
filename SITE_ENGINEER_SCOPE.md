# Site Engineer — ONLY ye tables chahiye

Image wale menu ke hisaab se. Verification / tickets / TaskFlow tasks — **nahi**.

| Menu (image) | Tables / storage |
|--------------|------------------|
| Clock In / Out | `attendance` + storage bucket `attendance-photos` |
| Attendance | `attendance`, `site_leaves` |
| Apply Leave / My Leave | `site_leaves`, `leave_seen_status`, `site_user_details` (view) |
| Daily Report | `dpr_reports`, `dpr_drafts`, `manpower`, `man_type`, `workcategory`, `dpr_equipment` (+ site storage buckets for photos/PDF) |
| Weekly Report | `wpr_reports`, `wpr_drafts`, `wpr_images`, `site_details` |
| Site Visit Report | `site_reports`, `svr_drafts` |
| My Reports | `dpr_reports`, `wpr_reports`, `site_reports` (read) |
| Manpower Report | `dpr_reports` (read aggregate) |
| Settings & Profile | `site_user_details`, + report/attendance counts |
| Login / dept | `users` (`department`, `designation`, `site_name`, `site_names`, `is_head`, username + password_hash) |
| Department list | `departments` row: **Site Engineer** |

## Explicitly NOT needed for Site Engineer UI

- TaskFlow: `tasks`, `tickets`, `drawings`, verification queues, recurring_tasks, …
- dip-projects extras: office portal, material requirement nav, leave-approvals (unless you want approvers later), report-submissions for heads inside site nav
- `leaves` = TaskFlow leave (alag). Site leave = **`site_leaves`**

## Tumhare DB pe pehle se

Bahut `dpr_*` / manpower etc. already hain — theek hai.  
Ab sirf [`only_missing.sql`](backend/sql/only_missing.sql) chalao (`is_head`, `site_name`, `Site Engineer` dept, `site_user_details` view).
