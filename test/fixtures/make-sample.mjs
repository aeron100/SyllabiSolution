#!/usr/bin/env node
/**
 * A small synthetic Canvas-style Common Cartridge (CC 1.1) for the tests.
 * Nothing in the app depends on it: the shipped dist/index.html bundles no
 * course export and never fetches one (DESIGN.md §2, §15).
 *
 * The course is fictional ("Introduction to Widgets"); every string here
 * is neutral placeholder text. Two tiny PNGs are generated in code.
 *
 * Tests import buildSample(), which returns the zip bytes in memory, and
 * IDS, which lists the resource identifiers so entries can be addressed by
 * name. Run as a CLI it also writes the bytes to test/fixtures/sample.imscc
 * (git-ignored via *.imscc) for manual inspection or the dev-only ?load= aid:
 *
 *   node test/fixtures/make-sample.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { strToU8, zipSync, zlibSync } from 'fflate';

export const IDS = {
  pageWelcome: 'gpage0001welcome',
  pagePolicies: 'gpage0002policies',
  pageSchedule: 'gpage0003schedule',
  pageGrading: 'gpage0004grading',
  syllabus: 'gcourse0001_syllabus',
  settings: 'gcourse0001',
  assign1: 'gasg00001sketch',
  assign2: 'gasg00002report',
  discussion: 'gdisc0001intro',
  discussionMeta: 'gdisc0001meta',
  announcement: 'gann00001welcome',
  announcementMeta: 'gann00001meta',
  quiz: 'gquiz0001basics',
  quizMeta: 'gquiz0001meta',
  tool: 'gtool0001simulator',
  link: 'glink0001standards',
  imageDiagram: 'gfile0001diagram',
  imageLogo: 'gfile0002logo',
  pdf: 'gfile0003handbook',
  notes: 'gfile0004notes',
  module1: 'gmod00001',
  module2: 'gmod00002',
  groupAssignments: 'ggroup0001',
  groupParticipation: 'ggroup0002',
};

// ---------------------------------------------------------------------------
// Tiny PNG generator (RGB, no interlace, filter 0 on every row)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function be32(n) {
  return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
}

function concat(...arrays) {
  const out = new Uint8Array(arrays.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const a of arrays) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

function pngChunk(type, data) {
  const body = concat(strToU8(type), data);
  return concat(be32(data.length), body, be32(crc32(body)));
}

/** Solid-to-gradient RGB PNG of the given size. */
export function makePng(width, height, [r, g, b]) {
  const stride = width * 3 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < width; x++) {
      const o = y * stride + 1 + x * 3;
      const shade = Math.round((x / Math.max(1, width - 1)) * 60);
      raw[o] = Math.min(255, r + shade);
      raw[o + 1] = Math.min(255, g + shade);
      raw[o + 2] = Math.min(255, b + shade);
    }
  }
  const ihdr = concat(be32(width), be32(height), new Uint8Array([8, 2, 0, 0, 0]));
  return concat(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlibSync(raw, { level: 9 })),
    pngChunk('IEND', new Uint8Array(0)),
  );
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const CANVAS_NS = 'http://canvas.instructure.com/xsd/cccv1p0';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function page(id, title, body, workflowState = 'active') {
  return `<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<title>${esc(title)}</title>
<meta name="identifier" content="${id}"/>
<meta name="editing_roles" content="teachers"/>
<meta name="workflow_state" content="${workflowState}"/>
</head>
<body>
${body}
</body>
</html>
`;
}

const WELCOME_BODY = `<h2 style="background-color: #003764; color: #ffffff;">Welcome</h2>
<p><span style="font-size: 14pt;">This course introduces the design, assembly, and evaluation of widgets. Each week pairs a short reading with a hands-on activity.</span></p>
<p><strong>What you will learn</strong></p>
<p>- How widgets are specified</p>
<p>- How widgets are assembled from parts</p>
<p>- How finished widgets are tested</p>
<p><img src="$IMS-CC-FILEBASE$/Uploaded%20Media/widget-diagram.png" alt="Diagram of a widget with its three parts labelled" width="320" height="240" data-api-endpoint="https://example.instructure.com/api/v1/courses/1/files/2" data-api-returntype="File" loading="lazy" /></p>
<p>Read the <a title="Course Policies" href="$WIKI_REFERENCE$/pages/course-policies" data-api-endpoint="https://example.instructure.com/api/v1/courses/1/pages/course-policies" data-api-returntype="Page">Course Policies</a> page and the <a href="$WIKI_REFERENCE$/pages/${IDS.pageSchedule}">Weekly Schedule</a> before the first meeting.</p>
<p><iframe src="https://www.youtube.com/embed/aaaaaaaaaaa?si=placeholder" width="560" height="315" title="Course introduction video" allowfullscreen="allowfullscreen"></iframe></p>
<p>Further reading: <a class="external" href="https://example.org/widgets" target="_blank"><span>Widget Reference Site</span><span class="screenreader-only">&nbsp;(Links to an external site.)</span></a></p>
<p>See also <a href="$CANVAS_OBJECT_REFERENCE$/assignments/${IDS.assign1}">Assignment 1</a> and the <a href="https://example.instructure.com/courses/1/modules">course modules</a>.</p>`;

const POLICIES_BODY = `<h2>Course Policies</h2>
<h3>Attendance</h3>
<p>Attend every session. If you must miss one, review the recording and the posted notes.</p>
<h3>Late Work</h3>
<p>Late submissions lose ten percent per day for up to three days.</p>
<h3>Academic Honesty</h3>
<p>Work you submit must be your own. Cite any reference you use, including software documentation.</p>
<p><em>Questions about these policies are welcome during office hours.</em></p>`;

const SCHEDULE_BODY = `<p>The schedule below may shift by a day or two; announcements will note any change.</p>
<table border="1" style="border-collapse: collapse;">
<tbody>
<tr><td><strong>Week</strong></td><td><strong>Topic</strong></td><td><strong>Due</strong></td></tr>
<tr><td>1</td><td>What is a widget?</td><td>Introduce yourself</td></tr>
<tr><td>2</td><td>Widget parts and specifications</td><td>Assignment 1</td></tr>
<tr><td>3</td><td>Assembly techniques</td><td>Quiz 1</td></tr>
<tr><td>4</td><td>Testing and evaluation</td><td>Assignment 2</td></tr>
</tbody>
</table>`;

const GRADING_BODY = `<h2>Grading Scale</h2>
<ol>
<li>A: 90 to 100 percent</li>
<li>B: 80 to 89 percent</li>
<li>C: 70 to 79 percent</li>
<li>D: 60 to 69 percent</li>
</ol>
<p>Grades are weighted by assignment group; see the syllabus for the breakdown.</p>`;

const SYLLABUS_HTML = `<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<title>Syllabus</title>
</head>
<body>
<h2><strong>Welcome to Introduction to Widgets</strong></h2>
<p><img role="presentation" src="$IMS-CC-FILEBASE$/logo.png" alt="" width="64" height="64" loading="lazy" /></p>
<p><strong>Course Description</strong></p>
<p>An introductory survey of widgets: what they are, how they are built, and how to judge whether one works. No prior experience with widgets is required.</p>
<p><strong>Materials</strong></p>
<p>Download the <a href="$IMS-CC-FILEBASE$/Readings/widget-handbook.pdf?canvas_=1&amp;canvas_qs_wrap=1">Widget Handbook</a> from the course files.</p>
<p><strong>Grading</strong></p>
<ul>
<li>Assignments: 70 percent</li>
<li>Participation: 30 percent</li>
</ul>
<p>To begin, visit the <a href="$CANVAS_COURSE_REFERENCE$/modules">Modules</a> page.</p>
</body>
</html>
`;

const COURSE_SETTINGS_XML = `${XML_HEAD}<course identifier="${IDS.settings}" xmlns="${CANVAS_NS}">
  <title>Introduction to Widgets</title>
  <course_code>WID-101</course_code>
  <start_at>2026-10-05T07:00:00</start_at>
  <conclude_at>2026-12-18T07:59:00</conclude_at>
  <group_weighting_scheme>percent</group_weighting_scheme>
  <default_view>syllabus</default_view>
  <locale>en</locale>
  <license>private</license>
</course>
`;

const ASSIGNMENT_GROUPS_XML = `${XML_HEAD}<assignmentGroups xmlns="${CANVAS_NS}">
  <assignmentGroup identifier="${IDS.groupParticipation}">
    <title>Participation</title>
    <position>2</position>
    <group_weight>30.0</group_weight>
  </assignmentGroup>
  <assignmentGroup identifier="${IDS.groupAssignments}">
    <title>Assignments</title>
    <position>1</position>
    <group_weight>70.0</group_weight>
  </assignmentGroup>
</assignmentGroups>
`;

const MODULE_META_XML = `${XML_HEAD}<modules xmlns="${CANVAS_NS}">
  <module identifier="${IDS.module1}"><title>Getting Started</title><workflow_state>active</workflow_state><position>1</position></module>
  <module identifier="${IDS.module2}"><title>Widget Fundamentals</title><workflow_state>active</workflow_state><position>2</position></module>
</modules>
`;

function assignmentHtml(title, body) {
  return `<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<title>Assignment: ${esc(title)}</title>
</head>
<body>
${body}
</body>
</html>
`;
}

function assignmentSettings(id, title, opts) {
  return `${XML_HEAD}<assignment identifier="${id}" xmlns="${CANVAS_NS}">
  <title>${esc(title)}</title>
  <time_zone_edited>Pacific Time (US &amp; Canada)</time_zone_edited>
  <due_at>${opts.dueAt ?? ''}</due_at>
  <lock_at/>
  <unlock_at>${opts.unlockAt ?? ''}</unlock_at>
  <module_locked>false</module_locked>
  ${opts.allDayDate ? `<all_day_date>${opts.allDayDate}</all_day_date>` : ''}
  <assignment_group_identifierref>${IDS.groupAssignments}</assignment_group_identifierref>
  <workflow_state>published</workflow_state>
  <assignment_overrides>
  </assignment_overrides>
  <allowed_extensions>pdf,png</allowed_extensions>
  <points_possible>${opts.points}</points_possible>
  <grading_type>points</grading_type>
  <all_day>${opts.allDayDate ? 'true' : 'false'}</all_day>
  <submission_types>online_upload</submission_types>
  <position>${opts.position}</position>
</assignment>
`;
}

const ASSIGN1_BODY = `<h2 style="background-color: #003764; color: #ffffff;">Assignment Description</h2>
<p>Sketch a widget of your own design. Label each of its parts and write one sentence about what each part does.</p>
<ul>
<li>Use any drawing tool you like.</li>
<li>Export your sketch as a PDF or PNG.</li>
<li>Upload it here before the due date.</li>
</ul>`;

const ASSIGN2_BODY = `<p>Assemble the widget described in the <a href="$IMS-CC-FILEBASE$/Readings/widget-handbook.pdf?canvas_=1&amp;canvas_qs_wrap=1">Widget Handbook</a> and write a two-page report on what went well and what you would change.</p>
<p><strong>Report sections</strong></p>
<p>1. Parts list</p>
<p>2. Assembly steps</p>
<p>3. Test results</p>`;

function topicXml(title, bodyHtml) {
  return `${XML_HEAD}<topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1">
  <title>${esc(title)}</title>
  <text texttype="text/html">${esc(bodyHtml)}</text>
</topic>
`;
}

function topicMetaXml(metaId, topicId, title, type, assignment) {
  return `${XML_HEAD}<topicMeta identifier="${metaId}" xmlns="${CANVAS_NS}">
  <topic_id>${topicId}</topic_id>
  <title>${esc(title)}</title>
  <position>1</position>
  <type>${type}</type>
  <discussion_type>threaded</discussion_type>
  <workflow_state>active</workflow_state>
  <module_locked>false</module_locked>
  <allow_rating>false</allow_rating>
${assignment ?? ''}</topicMeta>
`;
}

const DISCUSSION_ASSIGNMENT = `  <assignment identifier="gdisc0001asg">
    <title>Introduce Yourself</title>
    <time_zone_edited>Pacific Time (US &amp; Canada)</time_zone_edited>
    <due_at>2026-10-23T06:59:00</due_at>
    <all_day_date>2026-10-22</all_day_date>
    <assignment_group_identifierref>${IDS.groupParticipation}</assignment_group_identifierref>
    <workflow_state>published</workflow_state>
    <points_possible>10.0</points_possible>
    <grading_type>points</grading_type>
    <all_day>true</all_day>
    <submission_types>discussion_topic</submission_types>
  </assignment>
`;

const QUIZ_QTI = `${XML_HEAD}<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="${IDS.quiz}" title="Quiz 1: Widget Basics">
    <qtimetadata>
      <qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.exam.v0p1</fieldentry></qtimetadatafield>
      <qtimetadatafield><fieldlabel>cc_maxattempts</fieldlabel><fieldentry>2</fieldentry></qtimetadatafield>
    </qtimetadata>
    <section ident="root_section">
${[
  ['q1', 'How many parts does a basic widget have?'],
  ['q2', 'Which part of a widget is assembled first?'],
  ['q3', 'What is the purpose of a widget test?'],
]
  .map(
    ([ident, prompt]) => `      <item ident="${ident}" title="Question">
        <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_choice_question</fieldentry></qtimetadatafield><qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>10.0</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
        <presentation>
          <material><mattext texttype="text/html">&lt;p&gt;${esc(prompt)}&lt;/p&gt;</mattext></material>
          <response_lid ident="response1" rcardinality="Single">
            <render_choice>
              <response_label ident="a"><material><mattext texttype="text/plain">Option A</mattext></material></response_label>
              <response_label ident="b"><material><mattext texttype="text/plain">Option B</mattext></material></response_label>
            </render_choice>
          </response_lid>
        </presentation>
        <resprocessing>
          <outcomes><decvar maxvalue="100" minvalue="0" varname="SCORE" vartype="Decimal"/></outcomes>
          <respcondition continue="No"><conditionvar><varequal respident="response1">a</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>
        </resprocessing>
      </item>`,
  )
  .join('\n')}
    </section>
  </assessment>
</questestinterop>
`;

const QUIZ_META = `${XML_HEAD}<quiz identifier="${IDS.quiz}" xmlns="${CANVAS_NS}">
  <title>Quiz 1: Widget Basics</title>
  <description>${esc('<h2 style="background-color: #003764; color: #ffffff;">Quiz Info</h2>\n<p>This short quiz covers the first three readings. You may take it twice; the higher score counts.</p>')}</description>
  <unlock_at>2026-10-19T07:00:00</unlock_at>
  <due_at>2026-10-30T06:59:00</due_at>
  <shuffle_answers>true</shuffle_answers>
  <scoring_policy>keep_highest</scoring_policy>
  <quiz_type>assignment</quiz_type>
  <points_possible>30.0</points_possible>
  <time_limit>20</time_limit>
  <allowed_attempts>2</allowed_attempts>
  <available>true</available>
  <assignment identifier="gquiz0001asg">
    <title>Quiz 1: Widget Basics</title>
    <time_zone_edited>Pacific Time (US &amp; Canada)</time_zone_edited>
    <due_at>2026-10-30T06:59:00</due_at>
    <all_day_date>2026-10-29</all_day_date>
    <assignment_group_identifierref>${IDS.groupAssignments}</assignment_group_identifierref>
    <workflow_state>published</workflow_state>
    <points_possible>30.0</points_possible>
    <all_day>true</all_day>
    <submission_types>online_quiz</submission_types>
  </assignment>
</quiz>
`;

const TOOL_XML = `${XML_HEAD}<cartridge_basiclti_link xmlns="http://www.imsglobal.org/xsd/imslticc_v1p0" xmlns:blti="http://www.imsglobal.org/xsd/imsbasiclti_v1p0" xmlns:lticm="http://www.imsglobal.org/xsd/imslticm_v1p0" xmlns:lticp="http://www.imsglobal.org/xsd/imslticp_v1p0">
  <blti:title>Widget Simulator</blti:title>
  <blti:description>Practice assembling widgets in a browser-based simulator.</blti:description>
  <blti:launch_url>https://tools.example.com/widget-simulator/launch</blti:launch_url>
  <blti:secure_launch_url>https://tools.example.com/widget-simulator/launch</blti:secure_launch_url>
  <blti:vendor>
    <lticp:code>example</lticp:code>
    <lticp:name>Example Tools</lticp:name>
  </blti:vendor>
  <blti:extensions platform="canvas.instructure.com">
    <lticm:property name="privacy_level">anonymous</lticm:property>
  </blti:extensions>
</cartridge_basiclti_link>
`;

const LINK_XML = `${XML_HEAD}<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imswl_v1p1">
  <title>Widget Standards Body</title>
  <url href="https://example.org/standards/widgets" target="_blank"/>
</webLink>
`;

const PDF_PLACEHOLDER = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
trailer << /Root 1 0 R >>
%%EOF
`;

const NOTES_TXT = 'Instructor notes (placeholder). Not shown to students.\n';

function manifest() {
  const res = (id, type, href, files, { attrs = '', children = '' } = {}) =>
    `    <resource identifier="${id}" type="${type}"${href ? ` href="${esc(href)}"` : ''}${attrs}>
${files.map((f) => `      <file href="${esc(f)}"/>`).join('\n')}${children}
    </resource>`;
  const dep = (id) => ({ children: `\n      <dependency identifierref="${id}"/>` });
  const LAR = 'associatedcontent/imscc_xmlv1p1/learning-application-resource';
  const item = (id, title, ref) =>
    `          <item identifier="${id}"${ref ? ` identifierref="${ref}"` : ''}>
            <title>${esc(title)}</title>
          </item>`;

  return `${XML_HEAD}<manifest identifier="gmanifest0001widgets" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1 http://www.imsglobal.org/profile/cc/ccv1p1/ccv1p1_imscp_v1p2_v1p0.xsd">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title>
          <lomimscc:string>Introduction to Widgets</lomimscc:string>
        </lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="LearningModules">
        <item identifier="${IDS.module1}">
          <title>Getting Started</title>
${item('gitem0001', 'Overview')}
${item('gitem0002', 'Start Here: Welcome', IDS.pageWelcome)}
${item('gitem0003', 'Course Policies', IDS.pagePolicies)}
${item('gitem0004', 'Introduce Yourself', IDS.discussion)}
${item('gitem0005', 'Widget Standards Body', IDS.link)}
${item('gitem0006', 'Widget Simulator', IDS.tool)}
        </item>
        <item identifier="${IDS.module2}">
          <title>Widget Fundamentals</title>
${item('gitem0007', 'Weekly Schedule', IDS.pageSchedule)}
${item('gitem0008', 'Reading: Widget Handbook', IDS.pdf)}
${item('gitem0009', 'Widget Diagram', IDS.imageDiagram)}
${item('gitem0010', 'Assignment 1: Widget Sketch', IDS.assign1)}
${item('gitem0011', 'Quiz 1: Widget Basics', IDS.quiz)}
${item('gitem0012', 'Assignment 2: Widget Assembly Report', IDS.assign2)}
        </item>
      </item>
    </organization>
  </organizations>
  <resources>
${res(IDS.pageWelcome, 'webcontent', 'wiki_content/welcome-to-introduction-to-widgets.html', ['wiki_content/welcome-to-introduction-to-widgets.html'])}
${res(IDS.pagePolicies, 'webcontent', 'wiki_content/course-policies.html', ['wiki_content/course-policies.html'])}
${res(IDS.pageSchedule, 'webcontent', 'wiki_content/weekly-schedule.html', ['wiki_content/weekly-schedule.html'])}
${res(IDS.pageGrading, 'webcontent', 'wiki_content/grading-scale.html', ['wiki_content/grading-scale.html'])}
${res(IDS.syllabus, LAR, 'course_settings/syllabus.html', ['course_settings/syllabus.html'], { attrs: ' intendeduse="syllabus"' })}
${res(IDS.settings, LAR, 'course_settings/canvas_export.txt', [
  'course_settings/course_settings.xml',
  'course_settings/module_meta.xml',
  'course_settings/assignment_groups.xml',
  'course_settings/canvas_export.txt',
])}
${res(IDS.assign1, LAR, `${IDS.assign1}/assignment-1-widget-sketch.html`, [
  `${IDS.assign1}/assignment-1-widget-sketch.html`,
  `${IDS.assign1}/assignment_settings.xml`,
])}
${res(IDS.assign2, LAR, `${IDS.assign2}/assignment-2-widget-assembly-report.html`, [
  `${IDS.assign2}/assignment-2-widget-assembly-report.html`,
  `${IDS.assign2}/assignment_settings.xml`,
])}
${res(IDS.discussion, 'imsdt_xmlv1p1', undefined, [`${IDS.discussion}.xml`], dep(IDS.discussionMeta))}
${res(IDS.discussionMeta, LAR, `${IDS.discussionMeta}.xml`, [`${IDS.discussionMeta}.xml`])}
${res(IDS.announcement, 'imsdt_xmlv1p1', undefined, [`${IDS.announcement}.xml`], dep(IDS.announcementMeta))}
${res(IDS.announcementMeta, LAR, `${IDS.announcementMeta}.xml`, [`${IDS.announcementMeta}.xml`])}
${res(IDS.quiz, 'imsqti_xmlv1p2/imscc_xmlv1p1/assessment', undefined, [`${IDS.quiz}/assessment_qti.xml`], dep(IDS.quizMeta))}
${res(IDS.quizMeta, LAR, `${IDS.quiz}/assessment_meta.xml`, [`${IDS.quiz}/assessment_meta.xml`])}
${res(IDS.tool, 'imsbasiclti_xmlv1p0', undefined, [`${IDS.tool}.xml`])}
${res(IDS.link, 'imswl_xmlv1p1', undefined, [`${IDS.link}.xml`])}
${res(IDS.imageDiagram, 'webcontent', 'web_resources/Uploaded Media/widget-diagram.png', ['web_resources/Uploaded Media/widget-diagram.png'])}
${res(IDS.imageLogo, 'webcontent', 'web_resources/logo.png', ['web_resources/logo.png'])}
${res(IDS.pdf, 'webcontent', 'web_resources/Readings/widget-handbook.pdf', ['web_resources/Readings/widget-handbook.pdf'])}
    <resource identifier="${IDS.notes}" type="webcontent" href="web_resources/instructor-notes.txt">
      <metadata>
        <lom:lom>
          <lom:educational>
            <lom:intendedEndUserRole>
              <lom:source>IMSGLC_CC_Rolesv1p1</lom:source>
              <lom:value>Instructor</lom:value>
            </lom:intendedEndUserRole>
          </lom:educational>
        </lom:lom>
      </metadata>
      <file href="web_resources/instructor-notes.txt"/>
    </resource>
  </resources>
</manifest>
`;
}

/** Zip entry name → bytes, in a stable order. */
export function sampleEntries() {
  const u = strToU8;
  return {
    'imsmanifest.xml': u(manifest()),
    'course_settings/course_settings.xml': u(COURSE_SETTINGS_XML),
    'course_settings/assignment_groups.xml': u(ASSIGNMENT_GROUPS_XML),
    'course_settings/module_meta.xml': u(MODULE_META_XML),
    'course_settings/canvas_export.txt': u('Sample export generated for the Syllabus Generator test fixture.\n'),
    'course_settings/syllabus.html': u(SYLLABUS_HTML),
    'wiki_content/welcome-to-introduction-to-widgets.html': u(
      page(IDS.pageWelcome, 'Welcome to Introduction to Widgets', WELCOME_BODY),
    ),
    'wiki_content/course-policies.html': u(page(IDS.pagePolicies, 'Course Policies', POLICIES_BODY)),
    'wiki_content/weekly-schedule.html': u(page(IDS.pageSchedule, 'Weekly Schedule', SCHEDULE_BODY)),
    'wiki_content/grading-scale.html': u(page(IDS.pageGrading, 'Grading Scale', GRADING_BODY, 'unpublished')),
    [`${IDS.assign1}/assignment-1-widget-sketch.html`]: u(assignmentHtml('Assignment 1: Widget Sketch', ASSIGN1_BODY)),
    [`${IDS.assign1}/assignment_settings.xml`]: u(
      assignmentSettings(IDS.assign1, 'Assignment 1: Widget Sketch', {
        dueAt: '2026-10-16T06:59:00',
        unlockAt: '2026-10-05T07:00:00',
        allDayDate: '2026-10-15',
        points: '20.0',
        position: 1,
      }),
    ),
    [`${IDS.assign2}/assignment-2-widget-assembly-report.html`]: u(
      assignmentHtml('Assignment 2: Widget Assembly Report', ASSIGN2_BODY),
    ),
    [`${IDS.assign2}/assignment_settings.xml`]: u(
      assignmentSettings(IDS.assign2, 'Assignment 2: Widget Assembly Report', {
        dueAt: '2026-11-07T01:00:00',
        points: '50.0',
        position: 2,
      }),
    ),
    [`${IDS.discussion}.xml`]: u(
      topicXml(
        'Introduce Yourself',
        '<p>Tell the class who you are and what you hope to build. Reply to at least two classmates.</p>',
      ),
    ),
    [`${IDS.discussionMeta}.xml`]: u(
      topicMetaXml(IDS.discussionMeta, IDS.discussion, 'Introduce Yourself', 'topic', DISCUSSION_ASSIGNMENT),
    ),
    [`${IDS.announcement}.xml`]: u(
      topicXml(
        'Welcome to the course',
        '<p>Welcome! The first module is open. Start with the welcome page and the course policies.</p>',
      ),
    ),
    [`${IDS.announcementMeta}.xml`]: u(
      topicMetaXml(IDS.announcementMeta, IDS.announcement, 'Welcome to the course', 'announcement'),
    ),
    [`${IDS.quiz}/assessment_qti.xml`]: u(QUIZ_QTI),
    [`${IDS.quiz}/assessment_meta.xml`]: u(QUIZ_META),
    [`${IDS.tool}.xml`]: u(TOOL_XML),
    [`${IDS.link}.xml`]: u(LINK_XML),
    'web_resources/Uploaded Media/widget-diagram.png': makePng(32, 24, [30, 90, 160]),
    'web_resources/logo.png': makePng(16, 16, [200, 110, 20]),
    'web_resources/Readings/widget-handbook.pdf': u(PDF_PLACEHOLDER),
    'web_resources/instructor-notes.txt': u(NOTES_TXT),
  };
}

/** Build the sample cartridge; same bytes on every call in a process. */
export function buildSample() {
  return zipSync(sampleEntries(), { level: 6, mtime: new Date(Date.UTC(2026, 0, 1, 12, 0, 0)) });
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = resolve(here, 'sample.imscc');
  mkdirSync(dirname(out), { recursive: true });
  const bytes = buildSample();
  writeFileSync(out, bytes);
  console.log(`wrote ${out} (${bytes.length} bytes, ${Object.keys(sampleEntries()).length} entries)`);
}
