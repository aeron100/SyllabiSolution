/**
 * vite.config.ts only collects `test/**\/*.test.ts`, so the UI suites
 * (written as .tsx) are pulled in here to run under `npm test`.
 */
import './upload.test.tsx';
import './choose.test.tsx';
import './arrange.test.tsx';
import './download.test.tsx';
import './app.test.tsx';
import './hook.test.tsx';
