// Rasterizes a Recharts <svg> (found inside a wrapping DOM node) to a PNG
// data URL, so it can be embedded as a real image in a react-pdf document.
// This sidesteps react-pdf entirely for charts — it's plain browser
// SVG->canvas->PNG, so Hebrew labels render via the browser's own text
// engine (no font-registration or bidi concerns here).
//
// Text legibility note: the text is baked into the image at the chart's
// on-screen proportions, so a wide on-screen chart shrunk onto a PDF page
// yields tiny text. Don't try to enlarge font-size in the cloned SVG —
// positions don't move with it, so labels collide and clip at the edges.
// Instead the caller narrows the chart's container before capturing
// (see exportPdf in Dashboard.jsx), letting Recharts itself re-lay out
// with a larger text-to-chart ratio.
export async function captureChartAsPng(containerEl, scale = 2) {
  if (!containerEl) return null;
  const svg = containerEl.querySelector("svg");
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  const clone = svg.cloneNode(true);
  clone.setAttribute("width", rect.width);
  clone.setAttribute("height", rect.height);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  const svgString = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = rect.width * scale;
    canvas.height = rect.height * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, rect.width, rect.height);

    return { dataUrl: canvas.toDataURL("image/png"), width: rect.width, height: rect.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
