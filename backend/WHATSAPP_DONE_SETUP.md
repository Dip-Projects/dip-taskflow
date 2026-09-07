# WhatsApp task Done — daily list picker (site teams)

Site people get **one WhatsApp list per day** for that day’s tasks
(Monday’s tasks on Monday, Tuesday’s on Tuesday, …).

**Daily morning digest is only for Process Controller Beena Parmar** (not admin).
Assign day tasks to **Beena Parmar**. Override with `WA_DIGEST_USERNAMES`.

Overdue open tasks (due earlier, still open) also appear in **today’s** list.

## How it works

1. Admin assigns tasks with a **target_date** (Mon / Tue / …).
2. **Daily cron** (~8:30 IST, `0 3 * * *` UTC) sends each user a **list picker**
   of that day’s open tasks (+ overdue).
3. User taps **Select** → pick a task or **Mark ALL done**.
4. After Done, WhatsApp shows:
   - which task(s) completed  
   - **Completed** list for the day  
   - **Still open** list  
   - then a refreshed Select list if anything left
5. Or reply: `LIST` | `ALL` | `1,3`

Portal: **Site → My Tasks** has **Mon–Sun** day tabs + Open / Done.

## Meta setup

### Webhook
- URL: `https://dip-taskflow.vercel.app/api/whatsapp/webhook`
- Verify token: `META_WEBHOOK_VERIFY_TOKEN` (e.g. `dip-taskflow-wa`)
- Subscribe: **messages**

### Interactive list
Needs the **24-hour customer care window**, or open it with a template first.
If list fails → fallback template `task_notification_v2` (one summary).

### Env (Vercel)

```text
META_PHONE_NUMBER_ID=...
META_ACCESS_TOKEN=...
META_WEBHOOK_VERIFY_TOKEN=dip-taskflow-wa
CRON_SECRET=your_cron_secret
WA_LIST_DEBOUNCE_MS=20000
WHATSAPP_TASK_LIST_TEMPLATE=task_notification_v2
# Optional: only these usernames get the daily list (default = Beena Parmar PC)
# WA_DIGEST_USERNAMES=beena.parmar
```

## Cron

```text
/api/whatsapp/cron/tasks-list-digest
schedule: 0 3 * * *   (every day ~08:30 IST)
```

Manual test (with secret):

```text
GET /api/whatsapp/cron/tasks-list-digest?secret=YOUR_CRON_SECRET
```

## Limits

- WhatsApp list: max **10 rows** (1 = ALL + up to 9 tasks).
- More than 9 open today → rest in **Site → My Tasks**.
- User must have `users.whatsapp_number` set.
