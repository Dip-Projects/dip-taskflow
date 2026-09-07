# WhatsApp task Done — list picker (recommended for site teams)

Site people get **one message** with all open tasks (not one WhatsApp per task).
They tap **Select** → pick a task or **Mark ALL done**.

## How it works

1. Admin assigns tasks → WhatsApp gets **one list** of all open tasks (Select → Done / Mark ALL).
2. Monday morning cron (`0 3 * * 1` UTC ≈ 8:30 IST) re-sends open-task lists.
3. User taps a row → that task Completes → updated list if any left.
4. Or reply: `LIST` | `ALL` | `1,3`

Note: if admin creates 5 tasks as 5 separate API calls, the employee may get up to 5
list refreshes (each showing the full open set). Prefer assigning then checking WhatsApp
once; Monday cron also consolidates.

Portal: **Site → My Tasks** still has checkboxes.

## Meta setup (required for Done from WhatsApp)

### Webhook
- URL: `https://dip-taskflow.vercel.app/api/whatsapp/webhook`
- Verify token: `META_WEBHOOK_VERIFY_TOKEN` (e.g. `dip-taskflow-wa`)
- Subscribe: **messages**

### Interactive list
List messages need the **24-hour customer care window** (user messaged you recently),
or you open the window with a template first.

If list send fails, we fall back to `task_notification_v2` with a short summary
(still **one** message, not five).

Optional: create a soft utility template and set:

```text
WHATSAPP_TASK_LIST_TEMPLATE=task_notification_v2
```

### Env (Vercel)

```text
META_PHONE_NUMBER_ID=...
META_ACCESS_TOKEN=...
META_WEBHOOK_VERIFY_TOKEN=dip-taskflow-wa
CRON_SECRET=your_cron_secret
WA_LIST_DEBOUNCE_MS=20000
```

## Optional single-task Done template

Only if you still want per-task Quick Reply (not needed with list picker):

See older `site_task_done_v1` notes — set `WHATSAPP_TASK_DONE_TEMPLATE`.

## Limits

- WhatsApp list: max **10 rows** (we use 1 = ALL + up to 9 tasks).
- More than 9 open → rest in **Site → My Tasks**.
