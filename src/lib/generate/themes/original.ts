/**
 * Original presentation: the instructor's inline formatting is kept, so this
 * stylesheet is base (frame + max-width caps) plus a light-mode lock. It
 * never sets a colour or font on body content, and it does not follow the
 * viewer's dark-mode preference, because the inline colours in the content
 * were chosen against a light page.
 */
export const ORIGINAL_CSS = `/* ---- original: keep inline formatting; stay light ---- */
:root {
  color-scheme: light;
  background: #ffffff;
}
/* explicit sizes on images and tables survive, but never wider than the page */
.sg-section img[width], .sg-section table[width] {
  max-width: 100%;
}
`;
