# WhatsApp task Done — daily list picker (site teams)

## Who sees what

| Who | EA uploads (QR weekly plan) | Day tasks WhatsApp |
|-----|----------------------------|--------------------|
| **Uploader** (e.g. Rocky) | Own uploads only | Own tasks if any |
| **Beena** (Process Controller) | **All** EA uploads | Daily list of tasks assigned to her |
| **Admin** | Hidden | Not in digest |

On present / upload: WhatsApp goes to **uploader + Beena** only.

## Day list picker

Beena gets **one WhatsApp list per day** for that day’s tasks
(Monday’s tasks on Monday, Tuesday’s on Tuesday, …).

Overdue open tasks also appear in **today’s** list.

## How it works

1. Admin assigns day tasks to **Beena** (not to admin).
2. **Daily cron** (~8:30 IST, `0 3 * * *` UTC) sends Beena a **list picker**.
3. EA QR upload → Rocky + Beena get WhatsApp; both see list on Site → My Tasks (Beena sees everyone’s EA).
4. User taps **Select** → Done; reply `LIST` / `ALL` / `1,3`.

Portal: **Site → My Tasks** has Mon–Sun tabs (hidden for admin).

## Meta setup

### Webhook
- URL: `https://dip-taskflow.vercel.app/api/whatsapp/webhook`
- Verify token: `META_WEBHOOK_VERIFY_TOKEN` (e.g. `dip-taskflow-wa`)
- Subscribe: **messages**

### Env (Vercel)

```text
META_PHONE_NUMBER_ID=...
META_ACCESS_TOKEN=...
META_WEBHOOK_VERIFY_TOKEN=dip-taskflow-wa
CRON_SECRET=your_cron_secret
WA_LIST_DEBOUNCE_MS=20000
WHATSAPP_TASK_LIST_TEMPLATE=task_notification_v2
# Optional: force digest/EA viewer usernames
# WA_DIGEST_USERNAMES=beena.username
```

## Limits

- WhatsApp list: max **10 rows** (1 = ALL + up to 9 tasks).
- User must have `users.whatsapp_number` set (uploader and Beena).
