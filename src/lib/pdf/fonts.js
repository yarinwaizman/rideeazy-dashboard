import { Font } from "@react-pdf/renderer";
import { Buffer } from "buffer";
import rubikRegular from "../../assets/fonts/Rubik-Regular.ttf";
import rubikMedium from "../../assets/fonts/Rubik-Medium.ttf";
import rubikBold from "../../assets/fonts/Rubik-Bold.ttf";

// @react-pdf/renderer's PDF-writing internals (pdfkit) assume a Node
// environment with a global Buffer; the browser has none, which silently
// breaks parts of the render (e.g. tables) instead of throwing.
if (typeof window !== "undefined" && !window.Buffer) {
  window.Buffer = Buffer;
}

// react-pdf's fontkit-based layout engine doesn't reliably handle variable
// fonts, so these are static-weight instances (see src/assets/fonts).
// Registration is global and idempotent — call before rendering any PDF.
let registered = false;
export function registerFonts() {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Rubik",
    fonts: [
      { src: rubikRegular, fontWeight: 400 },
      { src: rubikMedium, fontWeight: 500 },
      { src: rubikBold, fontWeight: 700 },
    ],
  });
  // react-pdf's default bidi/word-splitting can misplace punctuation
  // adjacent to Hebrew text; disabling hyphenation avoids it inserting
  // soft-break artifacts into RTL words.
  Font.registerHyphenationCallback((word) => [word]);
}
