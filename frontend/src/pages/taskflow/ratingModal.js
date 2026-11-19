// Verify-time review popup: 5 quick star questions (half stars allowed, mandatory),
// overall performance auto-calculated from them, optional note with quick tags,
// and a WhatsApp-to-employee toggle.
// Resolves with the payload for PATCH /tasks/:id/verify, or null if cancelled.

export const RATING_QUESTIONS = [
  { key: 'quality', short: 'Quality', label: 'Quality of work',
    hint: 'Accuracy, completeness and finish of the output' },
  { key: 'instructions', short: 'Instructions', label: 'Followed the brief',
    hint: 'Did exactly what was asked, in the way it was asked' },
  { key: 'corrections', short: 'Right first time', label: 'Right the first time',
    hint: 'Little or no rework needed (5 = no corrections at all)' },
  { key: 'communication', short: 'Communication', label: 'Communication & updates',
    hint: 'Shared progress, replied promptly, raised issues early' },
  { key: 'ownership', short: 'Ownership', label: 'Ownership & initiative',
    hint: 'Took responsibility and solved problems without being chased' },
];

// Answers use half-star steps; the overall score is stored as a whole star.
export const snapHalf = (v) => Math.round(Number(v) * 2) / 2;

export function computeOverall(answers) {
  const vals = RATING_QUESTIONS.map((q) => Number(answers?.[q.key])).filter((v) => v >= 0.5 && v <= 5);
  if (vals.length !== RATING_QUESTIONS.length) return { avg: null, rating: 0 };
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return { avg, rating: Math.min(5, Math.max(1, Math.round(avg))) };
}

function ratingLabel(r) {
  if (r <= 1.5) return 'Poor';
  if (r <= 2.5) return 'Below average';
  if (r <= 3.5) return 'Average';
  if (r <= 4.5) return 'Good';
  return 'Excellent';
}

const TAGS = ['Excellent work', 'Well done, on time', 'Add more detail', 'Share updates earlier', 'Double-check before submitting', 'Follow the brief closely'];

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let cssDone = false;
function injectCss() {
  if (cssDone) return;
  cssDone = true;
  const st = document.createElement('style');
  st.textContent = `
  .rv-back{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;padding:12px}
  .rv-box{background:#fff;color:#222;border-radius:12px;width:100%;max-width:480px;max-height:92vh;overflow:auto;padding:18px 18px 14px;box-shadow:0 10px 40px rgba(0,0,0,.25);font-size:14px}
  .rv-box h3{margin:0 0 2px;font-size:1.1rem}
  .rv-sub{color:#666;font-size:.82rem;margin:0 0 12px;word-break:break-word}
  .rv-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0}
  .rv-q{display:flex;flex-direction:column;flex:1;min-width:0}
  .rv-q small{color:#888;font-size:.72rem;line-height:1.25;margin-top:1px}
  .rv-stars{display:inline-flex;gap:2px;flex-shrink:0}
  .rv-star{background:none;border:0;cursor:pointer;font-size:1.5rem;line-height:1;color:#ccc;padding:0 1px}
  .rv-star.on{color:#f5a623}
  .rv-star.half{background:linear-gradient(90deg,#f5a623 50%,#ccc 50%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
  .rv-val{font-size:.74rem;color:#666;min-width:24px;text-align:right;flex-shrink:0}
  .rv-help{color:#888;font-size:.74rem;margin:-2px 0 6px}
  .rv-big .rv-star{font-size:2rem}
  .rv-ro .rv-star{cursor:default;pointer-events:none}
  .rv-ro{background:#f7f5ef;border-radius:8px;padding:6px 10px}
  .rv-lbl{font-size:.78rem;color:#888;min-width:90px;text-align:right}
  .rv-sec{font-weight:600;margin:14px 0 4px}
  .rv-tags{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
  .rv-tag{border:1px solid #d0d0d0;background:#fafafa;border-radius:14px;padding:3px 10px;font-size:.78rem;cursor:pointer}
  .rv-box textarea{width:100%;min-height:70px;border:1px solid #ccc;border-radius:8px;padding:8px;font:inherit;box-sizing:border-box}
  .rv-err{color:#d33;font-size:.82rem;min-height:1.1em;margin:6px 0 0}
  .rv-wa{display:flex;gap:8px;align-items:center;margin:10px 0 0;font-size:.85rem}
  .rv-act{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
  .rv-act button{padding:8px 16px;border-radius:8px;border:1px solid #ccc;background:#fff;cursor:pointer;font:inherit}
  .rv-act .rv-ok{background:#1f8a4c;color:#fff;border-color:#1f8a4c}
  .rv-act .rv-ok:disabled{opacity:.45;cursor:not-allowed}`;
  document.head.appendChild(st);
}

function starsHtml(name) {
  return `<span class="rv-stars" data-name="${name}">${[1, 2, 3, 4, 5]
    .map((n) => `<button type="button" class="rv-star" data-v="${n}" aria-label="${n} star">★</button>`).join('')}</span>`;
}

export function openVerifyRatingModal({ description = '', assignee = '', project = '' } = {}) {
  injectCss();
  return new Promise((resolve) => {
    const state = { rating: 0, answers: {} };
    const back = document.createElement('div');
    back.className = 'rv-back';
    back.innerHTML = `
      <div class="rv-box" role="dialog" aria-modal="true">
        <h3>Verify & rate task</h3>
        <p class="rv-sub">${esc(description).slice(0, 140)}${assignee ? ` · ${esc(assignee)}` : ''}${project ? ` · ${esc(project)}` : ''}</p>
        <div class="rv-sec" style="margin-top:0">Rate each question <span style="color:#d33">*</span></div>
        <div class="rv-help">Tap the left half of a star for a half rating (e.g. 3.5).</div>
        ${RATING_QUESTIONS.map((q) => `<div class="rv-row"><span class="rv-q">${esc(q.label)}<small>${esc(q.hint)}</small></span>${starsHtml(q.key)}<span class="rv-val" data-val="${q.key}"></span></div>`).join('')}
        <div class="rv-sec">Overall performance <span style="color:#888;font-weight:400">(auto-calculated)</span></div>
        <div class="rv-row rv-big rv-ro">${starsHtml('overall')}<span class="rv-lbl" data-lbl="overall">Answer all questions</span></div>
        <div class="rv-sec">Suggestion / note <span style="color:#888;font-weight:400" data-notereq>(optional)</span></div>
        <div class="rv-tags">${TAGS.map((t) => `<button type="button" class="rv-tag">${esc(t)}</button>`).join('')}</div>
        <textarea placeholder="Write feedback or suggestions for the employee…"></textarea>
        <label class="rv-wa"><input type="checkbox" checked data-wa /> 📲 Send this feedback to employee on WhatsApp</label>
        <p class="rv-err" role="alert"></p>
        <div class="rv-act"><button type="button" data-cancel>Cancel</button><button type="button" class="rv-ok" data-ok disabled>Verify & Submit</button></div>
      </div>`;
    document.body.appendChild(back);

    const ta = back.querySelector('textarea');
    const err = back.querySelector('.rv-err');
    const okBtn = back.querySelector('[data-ok]');
    const noteReq = back.querySelector('[data-notereq]');

    const paint = (name, v) => {
      back.querySelectorAll(`.rv-stars[data-name="${name}"] .rv-star`).forEach((b) => {
        const n = Number(b.dataset.v);
        b.classList.toggle('on', v >= n);
        b.classList.toggle('half', v === n - 0.5);
      });
      const valEl = back.querySelector(`[data-val="${name}"]`);
      if (valEl) valEl.textContent = v ? String(v) : '';
    };
    const paintOverall = () => {
      const { avg, rating } = computeOverall(state.answers);
      state.rating = rating;
      paint('overall', rating);
      back.querySelector('[data-lbl="overall"]').textContent = rating
        ? `${rating}/5 · ${ratingLabel(rating)} (avg ${avg.toFixed(1)})`
        : 'Answer all questions';
    };
    const refresh = () => {
      const done = state.rating && RATING_QUESTIONS.every((q) => state.answers[q.key]);
      okBtn.disabled = !done;
      noteReq.textContent = state.rating && state.rating <= 2 ? '(required when overall is 1–2 stars)' : '(optional)';
      noteReq.style.color = state.rating && state.rating <= 2 ? '#d33' : '#888';
    };

    back.querySelectorAll('.rv-stars').forEach((wrap) => {
      if (wrap.dataset.name === 'overall') return; // auto, read-only
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('.rv-star');
        if (!b) return;
        const n = Number(b.dataset.v);
        const box = b.getBoundingClientRect();
        const v = e.clientX - box.left < box.width / 2 ? n - 0.5 : n; // left half = half star
        const name = wrap.dataset.name;
        state.answers[name] = v;
        paint(name, v);
        paintOverall();
        err.textContent = '';
        refresh();
      });
    });
    back.querySelectorAll('.rv-tag').forEach((t) => t.addEventListener('click', () => {
      ta.value = ta.value ? `${ta.value.trim()}. ${t.textContent}` : t.textContent;
    }));

    const close = (val) => { back.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    back.querySelector('[data-cancel]').addEventListener('click', () => close(null));
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    okBtn.addEventListener('click', () => {
      const note = ta.value.trim();
      if (state.rating <= 2 && !note) {
        err.textContent = 'Overall is 1–2 stars, so please write a note telling the employee what to improve.';
        ta.focus();
        return;
      }
      close({
        approved: true,
        rating: state.rating,
        rating_answers: { ...state.answers },
        rating_feedback: note,
        note,
        send_whatsapp: back.querySelector('[data-wa]').checked,
      });
    });
  });
}

// Plain-text stars (PDF / WhatsApp): ★★★½☆
export function ratingStarsText(n) {
  const v = Math.max(0, Math.min(5, snapHalf(n) || 0));
  const full = Math.floor(v);
  const half = v - full >= 0.5 ? 1 : 0;
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(5 - full - half);
}

// HTML stars with real half-star rendering (task cards, reports)
export function ratingStarsHtml(n) {
  const v = Math.max(0, Math.min(5, snapHalf(n) || 0));
  let out = '';
  for (let i = 1; i <= 5; i += 1) {
    if (v >= i) out += '<span style="color:#f5a623">★</span>';
    else if (v === i - 0.5) out += '<span style="position:relative;display:inline-block;color:#ccc">★<span style="position:absolute;left:0;top:0;width:50%;overflow:hidden;color:#f5a623">★</span></span>';
    else out += '<span style="color:#ccc">★</span>';
  }
  return `<span style="white-space:nowrap;letter-spacing:1px">${out}</span>`;
}
