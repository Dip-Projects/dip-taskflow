# DIP TaskFlow + Site Engineer — Simple Steps (एक-एक करके)

Follow **exactly in this order**. Do not skip.

---

## STEP 1 — Sirf missing SQL (tables pehle se hain)

Tumhare DB mein `dpr_*`, `manpower`, `attendance`, `leaves`, `users`, … **pehle se hain**.  
Poora `site_engineer_merge.sql` **mat** chalao.

1. Supabase → **SQL Editor** → **New query**
2. File kholo: `dip-taskflow/backend/sql/only_missing.sql`
3. Copy → paste → **Run**

**Isse kya hota hai (sirf ye 3 cheezein):**
- `users` pe `is_head`, `site_name`, `site_names`
- department name `Site Engineer`
- view `site_user_details` (Site pages ke liye)

---

## STEP 2 — Anon key frontend mein daalna

1. Supabase → **Project Settings** (gear) → **API**
2. **anon public** key copy karo (lambi key)
3. File kholo: `dip-taskflow/frontend/.env`
4. Line aisi banao:

```
VITE_API_BASE=/api
VITE_SUPABASE_URL=https://doqzerzcuppkksukhwvm.supabase.co
VITE_SUPABASE_ANON_KEY=yahan_apni_anon_key_paste_karo
```

5. Save karo.

**Isse kya hota hai:** Site Engineer pages (Clock In, Reports) TaskFlow DB se baat kar sakte hain.

---

## STEP 3 — Head user mark karna (jisko dono UI chahiye)

1. Supabase → SQL Editor → New query
2. Apne head ka username likho (example `chirag.s`):

```sql
update users set is_head = true where username = 'chirag.s';
```

3. **Run**

**Isse kya hota hai:** Head login pe pehle TaskFlow dikhega, upar **TaskFlow | Site Engineer** toggle milega.

---

## STEP 4 — Site Engineer user banana

**Option A — Admin se (TaskFlow UI):**  
Manage employees → naya employee → Department = `Site Engineer` → Designation = `Site Engineer` (ya Site Incharge) → save → jo **username + password** dikhe woh save kar lo.

**Option B — SQL (password pehle bcrypt se banana padega)** — pehle Option A try karo.

**Isse kya hota hai:** Site Engineer login pe seedha Site pages (Clock In/Out wala UI) khulega.

---

## STEP 5 — App chalana (local)

**Terminal 1:**
```bash
cd "D:/div pmc/dip-taskflow/backend"
npm run dev
```

**Terminal 2:**
```bash
cd "D:/div pmc/dip-taskflow/frontend"
npm run dev
```

Browser: `http://localhost:5173`

| Kaun login | Kya dikhega |
|------------|-------------|
| Site Engineer dept | Site Engineer pages |
| Normal employee / admin | TaskFlow pages |
| Head (`is_head=true`) | TaskFlow + upar toggle |

---

## STEP 6 — Purane dip-projects data laana (optional, baad mein)

Jab upar sab chal jaye, tab dip-projects Supabase se tables export/import karo  
(`attendance`, leaves → `site_leaves`, `dpr_reports`, …) aur users TaskFlow `users` table mein bcrypt password ke saath banao.

---

## Checklist

- [ ] STEP 1 SQL run
- [ ] STEP 2 anon key `.env` mein
- [ ] STEP 3 head `is_head = true`
- [ ] STEP 4 Site Engineer user
- [ ] STEP 5 dono servers start + login test

---

## STEP 7 — Vercel pe deploy (production)

Repo: `https://github.com/DivyankaOp/dip-taskflow`

1. Vercel project **dip-taskflow** → **Settings** → **Root Directory** = **`backend`** (Save)
2. **Environment Variables** (Production + Preview; Build ke liye bhi enable):

| Name | Where from |
|------|------------|
| `SUPABASE_URL` | backend `.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | backend `.env` (service_role only) |
| `SUPABASE_ANON_KEY` | backend `.env` |
| `JWT_SECRET` | backend `.env` |
| `VITE_SUPABASE_URL` | frontend `.env` |
| `VITE_SUPABASE_ANON_KEY` | frontend `.env` |
| `VITE_API_BASE` | `/api` |

3. Naya code push / **Redeploy** → `https://dip-taskflow.vercel.app` pe login page aani chahiye (not `Cannot GET /`)

**Note:** `SUPABASE_SERVICE_ROLE_KEY` kabhi `VITE_*` mein mat dalna.  
Large PPT uploads Hobby plan pe ~4.5MB limit se fail ho sakte hain.
