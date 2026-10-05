/** Designation-wise experience certificate body (ported from Apps Script). */
export function getExpCertContent(designation, empName, gender = 'Male') {
  const pronoun = gender === 'Female' ? 'she' : 'he';
  const possessive = gender === 'Female' ? 'Her' : 'His';
  const objective = gender === 'Female' ? 'her' : 'him';
  const d = String(designation || '').toLowerCase();
  const firstName = String(empName || '').trim().split(/\s+/)[0] || 'Employee';

  let bullets;
  let closingQuality;

  if (d.includes('office head')) {
    bullets = [
      'Managing day-to-day office administration and operations',
      'Supervising administrative staff and ensuring smooth workflow',
      'Coordinating between different departments and project teams',
      'Handling office budgets, expenses, and resource planning',
      'Maintaining records, documentation, and compliance requirements',
      'Ensuring proper implementation of company policies and procedures',
      'Supporting management in operational planning and decision-making',
    ];
    closingQuality =
      `${possessive} leadership skills, responsibility, and proactive approach towards work have been commendable. ` +
      `${possessive} ability to manage office operations efficiently and maintain team discipline is noteworthy.`;
  } else if (d.includes('office boy') || d.includes('peon') || d.includes('helper')) {
    bullets = [
      'Maintaining cleanliness and organization of the office premises',
      'Assisting staff with basic office tasks and requirements',
      'Handling documents, files, and deliveries within and outside the office',
      'Serving refreshments to staff and visitors',
      'Supporting administrative work as assigned',
      'Managing office supplies and ensuring availability of required items',
    ];
    closingQuality =
      `${firstName} has shown sincerity, discipline, and a responsible attitude towards duties. ` +
      `${pronoun.charAt(0).toUpperCase()}${pronoun.slice(1)} has been punctual and cooperative with all team members.`;
  } else if (d.includes('coordinator')) {
    bullets = [
      'Coordinating with clients, consultants, and site teams for project execution',
      'Monitoring project schedules and ensuring timely completion of tasks',
      'Assisting in planning, documentation, and reporting of project activities',
      'Tracking project progress and preparing daily/weekly reports',
      'Coordinating with vendors and suppliers for materials and services',
      'Ensuring proper communication between office and site teams',
      'Supporting project managers in achieving project goals',
    ];
    closingQuality =
      `${possessive} sincerity, dedication, and strong organizational skills have been consistent throughout the tenure. ` +
      `${possessive} ability to manage coordination tasks and maintain effective communication has been commendable.`;
  } else if (d.includes('team lead')) {
    bullets = [
      'Leading and supervising team members to achieve project goals',
      'Assigning tasks and monitoring team performance',
      'Coordinating with management, clients, and internal teams',
      'Ensuring timely execution of work as per project requirements',
      'Maintaining team discipline and resolving operational issues',
      'Preparing reports and updating progress to management',
      'Supporting team members and ensuring effective communication',
    ];
    closingQuality =
      `${possessive} strong leadership skills, responsibility, and proactive approach towards work have been commendable. ` +
      `${possessive} ability to manage teams efficiently and maintain productivity is noteworthy.`;
  } else if (d.includes('site executive') || d.includes('site incharge') || d.includes('site in-charge')) {
    bullets = [
      'Supervising day-to-day site operations and workforce activities',
      'Coordinating with contractors, vendors, and site teams',
      'Ensuring work execution as per approved drawings and specifications',
      'Monitoring project progress and maintaining timelines',
      'Maintaining site records, reports, and documentation',
      'Ensuring quality control and adherence to safety standards',
      'Assisting in material planning and site management',
    ];
    closingQuality =
      `${possessive} dedication, responsibility, and good coordination skills have been evident throughout the tenure. ` +
      `${possessive} ability to manage site operations efficiently has been commendable.`;
  } else if (d.includes('mis') || (d.includes('data') && d.includes('executive'))) {
    bullets = [
      'Preparing and maintaining daily, weekly, and monthly MIS reports',
      'Managing and analyzing data related to projects, operations, and employees',
      'Ensuring accuracy and consistency of data across records',
      'Coordinating with different departments for data collection and reporting',
      'Maintaining Excel sheets, databases, and documentation',
      'Assisting management with data analysis and performance tracking',
      'Generating reports for project progress, attendance, and operational activities',
    ];
    closingQuality =
      `${possessive} good analytical skills, attention to detail, and responsible approach towards work have been commendable. ` +
      `${possessive} ability to manage data efficiently and support organizational requirements is noteworthy.`;
  } else if (
    d.includes('site engineer') ||
    d.includes('civil engineer') ||
    d.includes('jr site') ||
    d.includes('sr site')
  ) {
    bullets = [
      'Supervising and monitoring day-to-day site construction activities',
      'Ensuring execution of work as per approved drawings and specifications',
      'Coordinating with contractors, consultants, and vendors',
      'Monitoring project progress and reporting to senior management',
      'Maintaining site records, quality checklists, and daily progress reports',
      'Ensuring safety standards and compliance at site',
      'Assisting in material procurement, testing, and quality control',
    ];
    closingQuality =
      `${possessive} technical competence, dedication, and strong sense of responsibility at site have been commendable. ` +
      `${possessive} performance has been consistently satisfactory throughout the tenure.`;
  } else if (d.includes('estimat') || d.includes('quantity') || d.includes('boq')) {
    bullets = [
      'Quantity take-offs from structural and architectural drawings',
      'Cost estimation and budgeting for civil construction projects',
      'Rate analysis and preparation of tender documents',
      'Preparation of detailed Bill of Quantities (BOQ)',
      'Evaluation of subcontractor quotations and comparative statements',
      'Coordination with project managers, site engineers, and vendors',
      'Monitoring project costs and assisting in cost control',
    ];
    closingQuality =
      `${possessive} strong technical skills, accuracy in estimation, and clear understanding of construction practices have been commendable. ` +
      `${firstName} is sincere, hardworking, and maintains a professional approach in all tasks.`;
  } else if (d.includes('account') || d.includes('finance') || d.includes('tally')) {
    bullets = [
      'Maintaining day-to-day accounting records and ledgers',
      'Preparing invoices, payment vouchers, and financial statements',
      'Managing petty cash, bank reconciliation, and expense tracking',
      'Coordinating with vendors and clients for billing and payments',
      'Assisting in tax compliance, TDS, and GST filings',
      'Maintaining project-wise financial records and reports',
      'Supporting management with financial analysis and audit requirements',
    ];
    closingQuality =
      `${possessive} accuracy, integrity, and professional attitude in handling financial responsibilities have been commendable. ` +
      `${possessive} contribution to the finance function has been valuable to the organization.`;
  } else if (d.includes('hr') || d.includes('human resource') || d.includes('admin')) {
    bullets = [
      'Managing employee records, attendance, and leave administration',
      'Handling recruitment, onboarding, and documentation processes',
      'Coordinating with department heads for HR requirements',
      'Processing payroll inputs and maintaining salary records',
      'Ensuring compliance with company policies and labor regulations',
      'Organizing training sessions and employee engagement activities',
      'Supporting management in performance review and appraisal processes',
    ];
    closingQuality =
      `${possessive} dedication, discretion, and professional approach in all HR and administrative responsibilities have been commendable. ` +
      `${possessive} contribution has been valuable to the organization.`;
  } else {
    bullets = [
      'Handling assigned responsibilities diligently and professionally',
      'Coordinating with team members and management as required',
      'Maintaining documentation and records relevant to the role',
      'Ensuring timely completion of tasks and deliverables',
      'Supporting project activities and organizational objectives',
      'Maintaining discipline and adhering to company policies',
    ];
    closingQuality =
      `${possessive} sincerity, dedication, and responsible approach towards work have been consistent throughout the tenure. ` +
      `${possessive} contribution to the organization has been commendable.`;
  }

  return {
    bullets,
    closing: [
      `Throughout the employment, ${closingQuality}`,
      `We found ${objective} to be a hardworking and dependable professional during ${objective === 'her' ? 'her' : 'his'} tenure with us.`,
      `We wish ${objective} all the best in ${objective === 'her' ? 'her' : 'his'} future endeavors.`,
      `This certificate is being issued upon ${objective === 'her' ? 'her' : 'his'} request for whatever purpose it may serve.`,
    ],
  };
}

export function formatDateLong(d = new Date()) {
  const mo = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${d.getDate()} ${mo[d.getMonth()]}, ${d.getFullYear()}`;
}

export function safeFileName(name) {
  return String(name || '')
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '_');
}
