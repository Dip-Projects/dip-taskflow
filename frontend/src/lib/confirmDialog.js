// In-app Yes/No popup, used in place of window.confirm().
// Resolves to true for Yes, false for No, Cancel, Escape or a click outside.

const STYLE_ID = 'tf-confirm-style';

const CSS = `
.tf-confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(15, 17, 35, 0.45);
}
.tf-confirm-box {
  width: min(360px, 100%);
  padding: 22px 22px 18px;
  border-radius: 14px;
  background: #fff;
  color: #0f1117;
  box-shadow: 0 18px 50px rgba(15, 17, 35, 0.3);
  font-family: Inter, "Segoe UI", system-ui, sans-serif;
}
.tf-confirm-title {
  margin: 0 0 8px;
  font-size: 1.05rem;
  font-weight: 650;
}
.tf-confirm-msg {
  margin: 0 0 18px;
  color: #4b5563;
  font-size: 0.92rem;
  line-height: 1.5;
  white-space: pre-line;
}
.tf-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.tf-confirm-actions button {
  min-width: 88px;
  padding: 9px 16px;
  border-radius: 8px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.tf-confirm-no {
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
}
.tf-confirm-yes {
  border: 1px solid var(--primary, #dc6900);
  background: var(--primary, #dc6900);
  color: #fff;
}
.tf-confirm-actions button:focus-visible {
  outline: 3px solid rgba(220, 105, 0, 0.3);
  outline-offset: 2px;
}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export function showConfirm({ title = 'Please confirm', message = '', yesText = 'Yes', noText = 'No' } = {}) {
  ensureStyle();
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'tf-confirm-backdrop';

    const box = document.createElement('div');
    box.className = 'tf-confirm-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    const titleEl = document.createElement('div');
    titleEl.className = 'tf-confirm-title';
    titleEl.textContent = title;

    const msgEl = document.createElement('div');
    msgEl.className = 'tf-confirm-msg';
    msgEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'tf-confirm-actions';

    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'tf-confirm-no';
    noBtn.textContent = noText;

    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'tf-confirm-yes';
    yesBtn.textContent = yesText;

    actions.append(noBtn, yesBtn);
    box.append(titleEl, msgEl, actions);
    backdrop.appendChild(box);

    const close = (answer) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(answer);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };

    yesBtn.addEventListener('click', () => close(true));
    noBtn.addEventListener('click', () => close(false));
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
    });
    document.addEventListener('keydown', onKey);

    document.body.appendChild(backdrop);
    yesBtn.focus();
  });
}
