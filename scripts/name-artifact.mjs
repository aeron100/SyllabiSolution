// Copies the self-contained build to its distribution name.
// dist/index.html stays for static hosting (servers expect index.html);
// dist/cc_ie_syllabus_generator.html is the file to email or share.
import { copyFileSync, statSync } from 'node:fs';

export const ARTIFACT_NAME = 'cc_ie_syllabus_generator.html';
copyFileSync('dist/index.html', `dist/${ARTIFACT_NAME}`);
const kb = Math.round(statSync(`dist/${ARTIFACT_NAME}`).size / 1024);
console.log(`dist/${ARTIFACT_NAME}  ${kb} kB (copy of dist/index.html)`);
