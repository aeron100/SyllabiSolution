// Copies the self-contained build to its distribution name.
// dist/index.html stays for static hosting (servers expect index.html);
// dist/SyllabiSolution.html is the file to email or share.
import { copyFileSync, statSync } from 'node:fs';

export const ARTIFACT_NAME = 'SyllabiSolution.html';
copyFileSync('dist/index.html', `dist/${ARTIFACT_NAME}`);
const kb = Math.round(statSync(`dist/${ARTIFACT_NAME}`).size / 1024);
console.log(`dist/${ARTIFACT_NAME}  ${kb} kB (copy of dist/index.html)`);
