import { beforeAll, describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { extractContent, makeAssetResolver, makeWikiResolver, openCartridge } from '../../src/lib/cartridge';
import { processContent } from '../../src/lib/process';
import type { Cartridge } from '../../src/lib/types';
import { IDS, buildSample } from '../fixtures/make-sample.mjs';
import { kindCounts } from './helpers';

let cart: Cartridge;
let bytes: Uint8Array;

beforeAll(async () => {
  bytes = buildSample();
  cart = await openCartridge(bytes);
});

describe('synthetic sample: opening', () => {
  it('stays small and builds deterministically', () => {
    expect(bytes.length).toBeLessThan(100 * 1024);
    expect(Buffer.from(buildSample()).equals(Buffer.from(bytes))).toBe(true);
  });

  it('reads course settings and the manifest', () => {
    expect(cart.version).toBe('1.1.0');
    expect(cart.source).toBe('canvas');
    expect(cart.title).toBe('Introduction to Widgets');
    expect(cart.courseCode).toBe('WID-101');
    expect(cart.startAt).toBe('2026-10-05T07:00:00');
    expect(cart.endAt).toBe('2026-12-18T07:59:00');
    expect(cart.language).toBe('en');
    expect(cart.zip.names().length).toBe(26);
  });

  it('orders assignment groups by position', () => {
    expect(cart.assignmentGroups.map((g) => [g.id, g.title, g.weight])).toEqual([
      [IDS.groupAssignments, 'Assignments', 70],
      [IDS.groupParticipation, 'Participation', 30],
    ]);
  });

  it('unwraps the LearningModules root and keeps header rows', () => {
    expect(cart.items.length).toBe(2);
    expect(cart.items[0].title).toBe('Getting Started');
    expect(cart.items[0].id).toBe(IDS.module1);
    const first = cart.items[0].children[0];
    expect(first.title).toBe('Overview');
    expect(first.resourceId).toBeUndefined();
    expect(cart.items[0].children[1].resourceId).toBe(IDS.pageWelcome);
    expect(cart.items[1].children.map((c) => c.resourceId)).toEqual([
      IDS.pageSchedule,
      IDS.pdf,
      IDS.imageDiagram,
      IDS.assign1,
      IDS.quiz,
      IDS.assign2,
    ]);
  });

  it('classifies every resource and folds meta helpers into their owners', () => {
    expect(kindCounts(cart)).toEqual({
      page: 4,
      syllabus: 1,
      assignment: 2,
      discussion: 1,
      announcement: 1,
      quiz: 1,
      link: 1,
      tool: 1,
      file: 4,
      other: 1,
    });
    expect(cart.resources.has(IDS.quizMeta)).toBe(false);
    expect(cart.resources.has(IDS.discussionMeta)).toBe(false);
    expect(cart.resources.has(IDS.announcementMeta)).toBe(false);
    expect(cart.resources.get(IDS.quiz)?.files).toContain(`${IDS.quiz}/assessment_meta.xml`);
    expect(cart.resources.get(IDS.discussion)?.files).toContain(`${IDS.discussionMeta}.xml`);
    expect(cart.unfiled).not.toContain(IDS.quizMeta);
  });

  it('prefers manifest item titles, then the file title, then the filename', () => {
    expect(cart.resources.get(IDS.pageWelcome)?.title).toBe('Start Here: Welcome');
    expect(cart.resources.get(IDS.pageGrading)?.title).toBe('Grading Scale');
    expect(cart.resources.get(IDS.imageLogo)?.title).toBe('logo.png');
    expect(cart.resources.get(IDS.announcement)?.title).toBe('Welcome to the course');
    expect(cart.resources.get(IDS.syllabus)?.title).toBe('Syllabus');
    expect(cart.resources.get(IDS.settings)?.title).toBe('Course settings');
  });

  it('lists unfiled resources sorted by kind then title', () => {
    expect(cart.unfiled).toEqual([
      IDS.pageGrading,
      IDS.syllabus,
      IDS.announcement,
      IDS.notes,
      IDS.imageLogo,
      IDS.settings,
    ]);
  });

  it('fills resource meta per kind', () => {
    const a1 = cart.resources.get(IDS.assign1)?.meta;
    expect(a1).toMatchObject({
      points: 20,
      dueAt: '2026-10-16T06:59:00',
      unlockAt: '2026-10-05T07:00:00',
      submissionTypes: 'online_upload',
      assignmentGroupId: IDS.groupAssignments,
      workflowState: 'published',
    });
    expect(a1?.lockAt).toBeUndefined();

    const quiz = cart.resources.get(IDS.quiz)?.meta;
    expect(quiz?.questionCount).toBe(3);
    expect(quiz?.points).toBe(30);
    expect(quiz?.dueAt).toBe('2026-10-30T06:59:00');
    expect(quiz?.description).toContain('<h2 style="background-color: #003764; color: #ffffff;">Quiz Info</h2>');

    const disc = cart.resources.get(IDS.discussion)?.meta;
    expect(disc).toMatchObject({ points: 10, dueAt: '2026-10-23T06:59:00', topicType: 'topic', workflowState: 'active' });

    const ann = cart.resources.get(IDS.announcement);
    expect(ann?.kind).toBe('announcement');
    expect(ann?.meta.topicType).toBe('announcement');
    expect(ann?.meta.points).toBeUndefined();

    const tool = cart.resources.get(IDS.tool)?.meta;
    expect(tool?.url).toBe('https://tools.example.com/widget-simulator/launch');
    expect(tool?.description).toBe('<p>Practice assembling widgets in a browser-based simulator.</p>');

    expect(cart.resources.get(IDS.link)?.meta.url).toBe('https://example.org/standards/widgets');

    expect(cart.resources.get(IDS.imageDiagram)?.meta).toMatchObject({
      filename: 'widget-diagram.png',
      mime: 'image/png',
    });
    expect(cart.resources.get(IDS.pdf)?.meta.mime).toBe('application/pdf');
    expect(cart.resources.get(IDS.notes)?.meta.intendedRole).toBe('Instructor');
    expect(cart.resources.get(IDS.pageWelcome)?.meta.workflowState).toBe('active');
    expect(cart.resources.get(IDS.pageGrading)?.meta.workflowState).toBe('unpublished');
  });
});

describe('synthetic sample: extractContent', () => {
  it('page: body children only, wrapper removed', async () => {
    const c = await extractContent(cart, IDS.pageWelcome);
    expect(c.kind).toBe('page');
    expect(c.title).toBe('Start Here: Welcome');
    expect(c.html.startsWith('<h2 style="background-color: #003764; color: #ffffff;">Welcome</h2>')).toBe(true);
    expect(c.html).not.toMatch(/<html|<head|<body|<\/body>/i);
    expect(c.html).toContain('$WIKI_REFERENCE$/pages/course-policies');
    expect(c.html).toContain('$IMS-CC-FILEBASE$/Uploaded%20Media/widget-diagram.png');
  });

  it('syllabus: body only', async () => {
    const c = await extractContent(cart, IDS.syllabus);
    expect(c.kind).toBe('syllabus');
    expect(c.html.startsWith('<h2><strong>Welcome to Introduction to Widgets</strong></h2>')).toBe(true);
    expect(c.html).not.toMatch(/<title>/i);
  });

  it('assignment: description plus a points/due line using the local all-day date', async () => {
    const c = await extractContent(cart, IDS.assign1);
    expect(c.html).toContain('<p>Sketch a widget of your own design.');
    expect(c.html.endsWith('<p class="sg-meta">20 points · Due Oct 15, 2026</p>')).toBe(true);
  });

  it('assignment: a timed due date is rendered in the course time zone', async () => {
    const c = await extractContent(cart, IDS.assign2);
    expect(c.html.endsWith('<p class="sg-meta">50 points · Due Nov 6, 2026</p>')).toBe(true);
  });

  it('discussion: unescaped topic body plus meta line; announcement has no meta line', async () => {
    const d = await extractContent(cart, IDS.discussion);
    expect(d.html).toBe(
      '<p>Tell the class who you are and what you hope to build. Reply to at least two classmates.</p>\n' +
        '<p class="sg-meta">10 points · Due Oct 22, 2026</p>',
    );
    const a = await extractContent(cart, IDS.announcement);
    expect(a.kind).toBe('announcement');
    expect(a.html).toBe(
      '<p>Welcome! The first module is open. Start with the welcome page and the course policies.</p>',
    );
  });

  it('quiz: description plus a summary line', async () => {
    const c = await extractContent(cart, IDS.quiz);
    expect(c.html).toContain('Quiz Info</h2>');
    expect(c.html.endsWith('<p class="sg-meta">3 questions · 30 points · Due Oct 29, 2026</p>')).toBe(true);
  });

  it('link: title linked to the URL', async () => {
    const c = await extractContent(cart, IDS.link);
    expect(c.html).toBe('<p><a href="https://example.org/standards/widgets">Widget Standards Body</a></p>');
  });

  it('tool: description only (the title is the section heading), never the launch URL', async () => {
    const c = await extractContent(cart, IDS.tool);
    expect(c.html).toBe('<p>Practice assembling widgets in a browser-based simulator.</p>');
    expect(c.html).not.toContain('Widget Simulator');
    expect(c.html).not.toContain('tools.example.com');
  });

  it('file: image becomes a figure with the title as alt and caption; other files a filename line', async () => {
    const img = await extractContent(cart, IDS.imageDiagram);
    expect(img.html).toBe(
      '<figure><img src="$IMS-CC-FILEBASE$/Uploaded%20Media/widget-diagram.png" alt="Widget Diagram"><figcaption>Widget Diagram</figcaption></figure>',
    );
    // The title is already the heading, so only the filename is added, and only when it differs.
    const pdf = await extractContent(cart, IDS.pdf);
    expect(pdf.html).toBe('<p>File: widget-handbook.pdf</p>');
    const logo = await extractContent(cart, IDS.imageLogo);
    expect(logo.html).toBe('<figure><img src="$IMS-CC-FILEBASE$/logo.png" alt="logo.png"><figcaption>logo.png</figcaption></figure>');
    const notes = await extractContent(cart, IDS.notes);
    expect(notes.html).toBe('');
  });

  it('other: empty html, and processing flags the section as title-only', async () => {
    const c = await extractContent(cart, IDS.settings);
    expect(c.kind).toBe('other');
    expect(c.html).toBe('');
    const page = await processContent(c, {
      sectionId: 'sec-other',
      sectionTitle: c.title,
      selectedSections: new Map(),
      resolveAsset: async () => null,
    });
    expect(page.original).toBe('');
    expect(page.neutral).toBe('');
    const flag = page.report.find((e) => e.code === 'title-only');
    expect(flag?.severity).toBe('info');
    expect(flag?.detail).toBe('Course settings');
    expect(flag?.message).toMatch(/only its title appears/);
  });

  it('unknown resource id throws; missing files never do', async () => {
    await expect(extractContent(cart, 'nope')).rejects.toThrow(/Unknown resource/);
    const entries = unzipSync(bytes);
    delete entries['wiki_content/welcome-to-introduction-to-widgets.html'];
    delete entries[`${IDS.quiz}/assessment_meta.xml`];
    delete entries['web_resources/logo.png'];
    const broken = await openCartridge(zipSync(entries));
    const page = await extractContent(broken, IDS.pageWelcome);
    expect(page.html).toBe('');
    expect(page.title).toBe('Start Here: Welcome');
    const quiz = await extractContent(broken, IDS.quiz);
    expect(quiz.html).toBe('<p class="sg-meta">3 questions</p>');
    expect(quiz.meta.description).toBeUndefined();
    const logo = await extractContent(broken, IDS.imageLogo);
    expect(logo.html).toBe('');
  });

  it('is deterministic', async () => {
    const a = await extractContent(cart, IDS.assign1);
    const b = await extractContent(cart, IDS.assign1);
    expect(a).toEqual(b);
  });
});

describe('synthetic sample: resolvers', () => {
  it('resolves every $IMS-CC-FILEBASE$ spelling and relative paths to data URIs', async () => {
    const resolve = makeAssetResolver(cart);
    const a = await resolve('$IMS-CC-FILEBASE$/Uploaded%20Media/widget-diagram.png?canvas_=1&canvas_qs_wrap=1');
    expect(a?.mime).toBe('image/png');
    expect(a?.dataUri.startsWith('data:image/png;base64,iVBORw0KGgo')).toBe(true);
    expect(a?.bytes).toBe(cart.zip.size('web_resources/Uploaded Media/widget-diagram.png'));
    expect((await resolve('$IMS_CC_FILEBASE$/logo.png'))?.mime).toBe('image/png');
    expect((await resolve('%24IMS-CC-FILEBASE%24/logo.png'))?.mime).toBe('image/png');
    expect((await resolve('logo.png'))?.mime).toBe('image/png');
    expect((await resolve('./web_resources/logo.png'))?.mime).toBe('image/png');
    expect((await resolve('Readings/widget-handbook.pdf?canvas_=1'))?.mime).toBe('application/pdf');
    expect(await resolve('$IMS-CC-FILEBASE$/missing.png')).toBeNull();
    expect(await resolve('https://example.org/x.png')).toBeNull();
    expect(await resolve('data:image/png;base64,AAAA')).toBeNull();
    expect(await resolve('#top')).toBeNull();
  });

  it('memoises per entry and applies downscale to images only', async () => {
    const calls: string[] = [];
    const resolve = makeAssetResolver(cart, {
      downscale: async (bytes, mime) => {
        calls.push(mime);
        return { bytes: bytes.subarray(0, 8), mime: 'image/webp' };
      },
    });
    const first = resolve('$IMS-CC-FILEBASE$/logo.png');
    const second = resolve('logo.png');
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(a?.mime).toBe('image/webp');
    expect(a?.bytes).toBe(8);
    expect(resolve('$IMS-CC-FILEBASE$/logo.png')).toBe(first);
    await resolve('Readings/widget-handbook.pdf');
    expect(calls).toEqual(['image/png']);
  });

  it('resolves $WIKI_REFERENCE$ by id, slug, and title', () => {
    const wiki = makeWikiResolver(cart);
    expect(wiki(`$WIKI_REFERENCE$/pages/${IDS.pageSchedule}`)).toBe(IDS.pageSchedule);
    expect(wiki('$WIKI_REFERENCE$/pages/course-policies')).toBe(IDS.pagePolicies);
    expect(wiki('$WIKI_REFERENCE$/pages/course-policies?module_item_id=3')).toBe(IDS.pagePolicies);
    expect(wiki('%24WIKI_REFERENCE%24/pages/weekly-schedule')).toBe(IDS.pageSchedule);
    expect(wiki('course-policies')).toBe(IDS.pagePolicies);
    expect(wiki('Course Policies')).toBe(IDS.pagePolicies);
    expect(wiki('Start Here: Welcome')).toBe(IDS.pageWelcome);
    expect(wiki('$WIKI_REFERENCE$/pages/no-such-page')).toBeNull();
    expect(wiki('')).toBeNull();
  });
});

describe('generic CC 1.1 variants', () => {
  it('reads a CC 1.3-style manifest with intendeduse and imswl description', async () => {
    const manifest = `<?xml version="1.0"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imscp_v1p1">
  <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.3.0</schemaversion>
    <lomimscc:lom xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p3/LOM/manifest"><lomimscc:general>
      <lomimscc:title><lomimscc:string>Generic Course</lomimscc:string></lomimscc:title>
      <lomimscc:language>fr</lomimscc:language>
    </lomimscc:general></lomimscc:lom></metadata>
  <organizations>
    <organization identifier="o1" structure="rooted-hierarchy">
      <item identifier="root"><item identifier="m1"><title>Unit 1</title>
        <item identifier="i1" identifierref="syl"><title>Syllabus</title></item>
        <item identifier="i2" identifierref="wl"><title>A link</title></item>
        <item identifier="i3" identifierref="asg"><title>Essay</title></item>
        <item identifier="i4" identifierref="missing"><title>Dangling</title></item>
      </item></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="syl" type="webcontent" intendeduse="syllabus" href="syllabus.html"><file href="syllabus.html"/></resource>
    <resource identifier="wl" type="imswl_xmlv1p3"><file href="wl.xml"/></resource>
    <resource identifier="asg" type="assignment_xmlv1p0"><file href="asg.xml"/></resource>
    <resource identifier="bank" type="imsqti_xmlv1p2/imscc_xmlv1p3/question-bank"><file href="bank.xml"/></resource>
  </resources>
</manifest>`;
    const zip = zipSync({
      'imsmanifest.xml': strToU8(manifest),
      'syllabus.html': strToU8('<p>Course overview</p>'),
      'wl.xml': strToU8(
        '<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p3/imswl_v1p3"><title>Site</title><url href="https://example.org/"/><description>A &amp; B</description></webLink>',
      ),
      'asg.xml': strToU8(
        '<assignment xmlns="http://www.imsglobal.org/xsd/imscc_extensions/assignment" identifier="asg"><title>Essay</title><text texttype="text/html">&lt;p&gt;Write an essay.&lt;/p&gt;</text><gradable points_possible="15">true</gradable></assignment>',
      ),
      'bank.xml': strToU8('<questestinterop><objectbank ident="b"><item ident="q1"/></objectbank></questestinterop>'),
    });
    const cart = await openCartridge(zip);
    expect(cart.version).toBe('1.3.0');
    expect(cart.source).toBe('generic');
    expect(cart.title).toBe('Generic Course');
    expect(cart.language).toBe('fr');
    expect(cart.items[0].children.map((c) => [c.title, c.resourceId])).toEqual([
      ['Syllabus', 'syl'],
      ['A link', 'wl'],
      ['Essay', 'asg'],
      ['Dangling', undefined],
    ]);
    expect(kindCounts(cart)).toMatchObject({ syllabus: 1, link: 1, assignment: 1, other: 1 });
    expect((await extractContent(cart, 'syl')).html).toBe('<p>Course overview</p>');
    expect((await extractContent(cart, 'wl')).html).toBe('<p><a href="https://example.org/">A link</a></p>\n<p>A &amp; B</p>');
    expect(cart.resources.get('asg')?.meta.points).toBe(15);
    expect((await extractContent(cart, 'asg')).html).toBe('<p>Write an essay.</p>\n<p class="sg-meta">15 points</p>');
    expect(cart.resources.get('bank')?.meta.questionCount).toBe(1);
  });
});
