const SECTION_BACKGROUNDS = [
  '#f2f7ff',
  '#f5f2ff',
  '#eff9f5',
  '#fff6ee',
  '#fff2f5',
  '#f0f8fa',
  '#f8f7ed',
  '#f2f4fa',
];

export function checklistSectionStyle(index) {
  return { '--tfc-block-bg': SECTION_BACKGROUNDS[index % SECTION_BACKGROUNDS.length] };
}
