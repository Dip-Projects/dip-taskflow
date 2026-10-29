const svg = (body) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/** One unique line icon per sidebar menu key (used by makeNavButton). */
export const NAV_ICONS = {
  // Tasks
  add: svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  taskbank: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  all: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
  overdue: svg('<circle cx="12" cy="13" r="7"/><path d="M12 10v3l2 2M5 4 2 7M19 4l3 3"/>'),
  my: svg('<circle cx="10" cy="8" r="4"/><path d="M3 21c0-3.9 3.1-7 7-7s7 3.1 7 7M16 11l2 2 4-4"/>'),
  recurring: svg('<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>'),
  'task-history': svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/>'),

  // Verification / tickets / corrections
  verifications: svg('<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z"/><path d="m9 12 2 2 4-4"/>'),
  'tickets-open': svg('<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7z"/><path d="M14 7v10"/>'),
  'tickets-resolved': svg('<path d="M3 13l2-8h14l2 8v6H3v-6z"/><path d="M3 13h5l1 2h6l1-2h5"/>'),
  corrections: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  updations: svg('<path d="M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
  'reschedule-requests': svg('<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><circle cx="12" cy="15.5" r="2.5"/>'),

  // Administration
  employees: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14c2 .8 3.5 2.9 3.5 6"/>'),
  hierarchy: svg('<rect x="9" y="2.5" width="6" height="5" rx="1"/><rect x="2.5" y="16.5" width="6" height="5" rx="1"/><rect x="15.5" y="16.5" width="6" height="5" rx="1"/><path d="M12 7.5v4M5.5 16.5V12h13v4.5"/>'),
  'project-mgmt': svg('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>'),
  sites: svg('<path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h2M8 12h2M8 16h2"/>'),
  clients: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'),
  masterdata: svg('<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  'task-checklist': svg('<rect x="3.5" y="4" width="7" height="7" rx="1.5"/><path d="m5.5 7.5 1.2 1.2 2.3-2.4M14 7.5h6.5M14 16.5h6.5"/><rect x="3.5" y="13" width="7" height="7" rx="1.5"/>'),
  permissions: svg('<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3M17 6l3 3M14 9l2 2"/>'),
  'daily-report': svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
  'mis-report': svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  'time-dashboard': svg('<path d="M3.5 16a8.5 8.5 0 1 1 17 0"/><path d="M12 16l4-4M7 20h10"/>'),
  'delay-report': svg('<path d="M10.3 4.2 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 10v4M12 17.5v.01"/>'),
  'emp-report': svg('<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16c.6-1.5 1.9-2.3 3.5-2.3s2.9.8 3.5 2.3M15 10h3M15 14h3"/>'),
  fms: svg('<rect x="2.5" y="3.5" width="7" height="5" rx="1"/><rect x="14.5" y="3.5" width="7" height="5" rx="1"/><rect x="8.5" y="15.5" width="7" height="5" rx="1"/><path d="M6 8.5V12h6v3.5M18 8.5V12h-6"/>'),

  // MIS support
  visibility: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),

  // Drawings
  'drawings-add': svg('<path d="m3 17 14-14 4 4L7 21H3z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>'),
  'drawings-all': svg('<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>'),

  // Reports
  'site-report': svg('<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  'my-reports': svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>'),
  'monthly-report': svg('<rect x="2.5" y="3.5" width="19" height="5" rx="1"/><path d="M4 8.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5M10 13h4"/>'),

  // Leave / HR
  applyleave: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  buddyrequests: svg('<path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.5 1.5M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.5-1.5"/>'),
  leaveapprovals: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>'),
  'new-recruitment': svg('<circle cx="9" cy="8" r="4"/><path d="M2 21c0-3.9 3.1-7 7-7s7 3.1 7 7M19 8v6M16 11h6"/>'),
};

/** Inline icons for table cells, pills and empty states (replace emoji). */
export const TF_ICONS = {
  mic: svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  clip: svg('<path d="M21 11.5 12.5 20a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2L10 17.6a1.8 1.8 0 0 1-2.6-2.6L15 7"/>'),
  pause: svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>'),
  pencil: svg('<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
  ticket: svg('<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7z"/><path d="M14 7v10"/>'),
  hourglass: svg('<path d="M6 3h12M6 21h12M7 3c0 4 5 5 5 9s-5 5-5 9M17 3c0 4-5 5-5 9s5 5 5 9"/>'),
  done: svg('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>'),
  clipboard: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13h6M9 17h4"/>'),
  inbox: svg('<path d="M3 13l2-8h14l2 8v6H3v-6z"/><path d="M3 13h5l1 2h6l1-2h5"/>'),
  dot: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/></svg>',
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  repeat: svg('<path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/>'),
};

/** Returns an inline icon span: tfIcon('mic') → <span class="tf-ico">…svg…</span> */
export function tfIcon(name, extraClass = '') {
  return `<span class="tf-ico ${extraClass}" aria-hidden="true">${TF_ICONS[name] || ''}</span>`;
}
