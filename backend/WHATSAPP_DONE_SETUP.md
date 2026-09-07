# WhatsApp Done button — Meta template (optional but recommended)

Without this template, TaskFlow still sends `task_notification_v2` and then
tries an interactive **Done** button. Interactive buttons only work inside the
**24-hour customer care window**. For reliable Done outside that window, create
this template in Meta Business Manager.

## 1. Create template

Meta Business Suite → WhatsApp Manager → Message templates → Create

| Field | Value |
|--------|--------|
| Name | `site_task_done_v1` (or any name; set same in Vercel env) |
| Category | **Utility** |
| Language | English |

**Body** (5 variables):

```text
Hi {{1}},

New task assigned:
{{2}}

Project: {{3}}
Due: {{4}}
Priority: {{5}}

Open Site Portal → My Tasks, or tap Done below when finished.
```

**Buttons** → Add **Quick reply** → label: `Done`

Submit for approval.

## 2. Vercel env

```text
WHATSAPP_TASK_DONE_TEMPLATE=site_task_done_v1
WHATSAPP_TASK_DONE_LANG=en
META_WEBHOOK_VERIFY_TOKEN=dip-taskflow-wa
```

(Keep existing `META_PHONE_NUMBER_ID` + `META_ACCESS_TOKEN`.)

## 3. Webhook

Meta App → WhatsApp → Configuration → Callback URL:

```text
https://dip-taskflow.vercel.app/api/whatsapp/webhook
```

Verify token: same as `META_WEBHOOK_VERIFY_TOKEN`  
Subscribe to: **messages**

## 4. Behaviour

- Assign task → WhatsApp notify + Done
- Tap Done on WhatsApp → task `Completed`
- Site Portal → **My Tasks** → checkbox / Done → same
