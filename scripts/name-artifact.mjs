// Copies the self-contained build to its distribution name.
// docs/index.html stays for static hosting (servers expect index.html);
// docs/SyllabiSolution.html is the file to email or share.
import { copyFileSync, statSync } from 'node:fs';

export const ARTIFACT_NAME = 'SyllabiSolution.html';
copyFileSync('docs/index.html', `docs/${ARTIFACT_NAME}`);
const kb = Math.round(statSync(`docs/${ARTIFACT_NAME}`).size / 1024);
console.log(`docs/${ARTIFACT_NAME}  ${kb} kB (copy of docs/index.html)`);
