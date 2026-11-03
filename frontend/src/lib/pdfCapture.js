// Runs an html2canvas capture with the seasonal (festive) theme switched off.
// Every festive rule starts with `html.festive-diwali`, so removing that class
// for the duration of the capture keeps sparkles and gold sweeps out of PDFs.
// The on-screen theme is restored as soon as the capture finishes.
export async function captureWithoutTheme(capture) {
  const root = document.documentElement;
  const festive = root.classList.contains("festive-diwali");
  if (festive) root.classList.remove("festive-diwali");
  try {
    return await capture();
  } finally {
    if (festive) root.classList.add("festive-diwali");
  }
}
