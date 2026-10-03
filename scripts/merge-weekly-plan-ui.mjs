import fs from 'fs';

const studioRoot = String.raw`C:\Users\Admin\Downloads\dip-projects-studio-compare\dip-proejcts`;
const adminRoot = String.raw`C:\Users\Admin\Downloads\dip-taskflow-main (46)\dip-taskflow-main`;

function patchSitePortal() {
  const studio = fs.readFileSync(`${studioRoot}\\frontend\\src\\pages\\site\\SitePortal.jsx`, 'utf8');
  const adminPath = `${adminRoot}\\frontend\\src\\pages\\site\\SitePortal.jsx`;
  let admin = fs.readFileSync(adminPath, 'utf8');

  if (!admin.includes('WeeklyPlanAttachmentPreview')) {
    admin = admin.replace(
      /import\s+["']\.\/SitePortal\.css["'];/,
      `import "./SiteMyTasks.css";\nimport { WeeklyPlanAttachmentPreview } from '../../components/WeeklyPlanAttachmentPreview';\nimport "./SitePortal.css";`
    );
  }

  const m = studio.match(/function WeeklyPlanReport\(\{ user \}\) \{[\s\S]*?\n\}\n\/\/ Merge a new rejection/);
  if (!m) throw new Error('WeeklyPlanReport not found in studio SitePortal');
  const fn = m[0].replace(/\n\/\/ Merge a new rejection$/, '');

  if (!admin.includes('function WeeklyPlanReport')) {
    let idx = admin.indexOf('export function mergeRejectionReason');
    if (idx < 0) idx = admin.indexOf('function mergeRejectionReason');
    if (idx < 0) throw new Error('no insert point for WeeklyPlanReport');
    admin = admin.slice(0, idx) + fn + '\n\n' + admin.slice(idx);
  }

  if (!admin.includes('key: "weekly-plan"')) {
    admin = admin.replace(
      '{ key: "my-reports", label: "My Reports", icon: Ico.myRpt },',
      '{ key: "my-reports", label: "My Reports", icon: Ico.myRpt },\n    { key: "weekly-plan", label: "Weekly Plan", icon: Ico.weeklyPlan },'
    );
  }

  if (!admin.includes('"weekly-plan": "#16a34a"')) {
    admin = admin.replace(
      '"my-reports": "#16a34a",',
      '"my-reports": "#16a34a",\n  "weekly-plan": "#16a34a",'
    );
  }

  if (!admin.includes('case "weekly-plan"')) {
    admin = admin.replace(
      'case "my-reports":\n        return <MyReports user={user} />;',
      'case "my-reports":\n        return <MyReports user={user} />;\n      case "weekly-plan":\n        return <WeeklyPlanReport user={user} />;'
    );
  }

  fs.writeFileSync(adminPath, admin);
  console.log('SitePortal OK', {
    import: admin.includes('WeeklyPlanAttachmentPreview'),
    fn: admin.includes('function WeeklyPlanReport'),
    nav: admin.includes('key: "weekly-plan"'),
    color: admin.includes('"weekly-plan": "#16a34a"'),
    cas: admin.includes('case "weekly-plan"'),
  });
}

function patchMdoPortal() {
  const studio = fs.readFileSync(`${studioRoot}\\frontend\\src\\pages\\mdo\\MDOPortal.jsx`, 'utf8');
  const adminPath = `${adminRoot}\\frontend\\src\\pages\\mdo\\MDOPortal.jsx`;
  let admin = fs.readFileSync(adminPath, 'utf8');

  if (!admin.includes('WeeklyPlanAttachmentPreview')) {
    admin = admin.replace(
      /import\s+["']\.\.\/site\/SitePortal\.css["'];/,
      `import "../site/SitePortal.css";\nimport "../site/SiteMyTasks.css";\nimport { WeeklyPlanAttachmentPreview } from "../../components/WeeklyPlanAttachmentPreview";`
    );
  }

  if (!admin.includes('weeklyPlan:')) {
    const iconMatch = studio.match(/weeklyPlan:\s*\(\s*\n\s*<svg[\s\S]*?<\/svg>\s*\n\s*\),/);
    if (!iconMatch) throw new Error('weeklyPlan icon missing in studio');
    admin = admin.replace(
      /(dpr:\s*\(\s*\n\s*<svg[\s\S]*?<\/svg>\s*\n\s*\),)/,
      `$1\n  ${iconMatch[0]}`
    );
  }

  const m = studio.match(/function WeeklyPlanReportMdo\(\{ user, sites \}\) \{[\s\S]*?\n\}\n\nfunction EngineerExcelReport/);
  if (!m) throw new Error('WeeklyPlanReportMdo not found');
  const fn = m[0].replace(/\nfunction EngineerExcelReport$/, '');

  if (!admin.includes('function WeeklyPlanReportMdo')) {
    const idx = admin.indexOf('// MAIN MDO PORTAL');
    if (idx < 0) throw new Error('no insert point for WeeklyPlanReportMdo');
    admin = admin.slice(0, idx) + fn + '\n\n' + admin.slice(idx);
  }

  if (!admin.includes('key: "weekly-plan"')) {
    admin = admin.replace(
      '{ key: "dpr", label: "Daily Report (DPR)", icon: Ico.dpr },',
      '{ key: "dpr", label: "Daily Report (DPR)", icon: Ico.dpr },\n  { key: "weekly-plan", label: "Weekly Plan", icon: Ico.weeklyPlan },'
    );
  }

  if (!admin.includes('"weekly-plan": "#0f766e"') && !admin.includes('weekly-plan: "#0f766e"')) {
    admin = admin.replace(
      'dpr: "#16a34a",',
      'dpr: "#16a34a",\n  "weekly-plan": "#0f766e",'
    );
  }

  if (!admin.includes('activeTab === "weekly-plan"')) {
    admin = admin.replace(
      ') : activeTab === "dpr" ? (\n              <DprSheetReport sites={sites} />\n            ) : activeTab === "add-drawings" ? (',
      ') : activeTab === "dpr" ? (\n              <DprSheetReport sites={sites} />\n            ) : activeTab === "weekly-plan" ? (\n              <WeeklyPlanReportMdo user={user} sites={sites} />\n            ) : activeTab === "add-drawings" ? ('
    );
  }

  fs.writeFileSync(adminPath, admin);
  console.log('MDOPortal OK', {
    import: admin.includes('WeeklyPlanAttachmentPreview'),
    icon: admin.includes('weeklyPlan:'),
    fn: admin.includes('function WeeklyPlanReportMdo'),
    nav: admin.includes('key: "weekly-plan"'),
    color: admin.includes('"weekly-plan": "#0f766e"'),
    render: admin.includes('activeTab === "weekly-plan"'),
  });
}

patchSitePortal();
patchMdoPortal();
