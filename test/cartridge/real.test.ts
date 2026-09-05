/**
 * Tests against the real Canvas export in the project root. Skipped when
 * the file is missing (it is not committed).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { extractContent, makeAssetResolver, makeWikiResolver, openCartridge } from '../../src/lib/cartridge';
import type { Cartridge } from '../../src/lib/types';
import { firstOfKind, hasRealExport, kindCounts, readRealExport } from './helpers';

describe.skipIf(!hasRealExport)('real Canvas export', () => {
  let cart: Cartridge;

  beforeAll(async () => {
    cart = await openCartridge(readRealExport());
  });

  it('indexes every file entry without extracting the archive', () => {
    expect(cart.zip.names().length).toBe(488);
    expect(cart.zip.has('imsmanifest.xml')).toBe(true);
    expect(cart.zip.size('imsmanifest.xml')).toBeGreaterThan(10_000);
  });

  it('reads version, title, code, dates, and language', () => {
    expect(cart.version).toBe('1.1.0');
    expect(cart.source).toBe('canvas');
    expect(cart.title).toBe('ICS123-24142 (ONL) Fund Data Structures');
    expect(cart.courseCode).toBe('ICS123-24142 (ONL)');
    expect(cart.startAt).toBe('2026-10-19T07:00:00');
    expect(cart.endAt).toBe('2027-12-13T07:59:00');
    expect(cart.language).toBe('en');
    expect(cart.term).toBeUndefined();
  });

  it('builds the module tree with header rows', () => {
    expect(cart.items.length).toBe(12);
    expect(cart.items[0].title).toBe('Student Learning Outcomes Reporting');
    const orientation = cart.items[1];
    expect(orientation.title).toBe('Course Orientation');
    expect(orientation.children[0].title).toBe('Welcome to Coastline College!');
    expect(orientation.children[0].resourceId).toBeUndefined();
    expect(orientation.children[1].resourceId).toBe('g1d72c3fdeca127ffb9893748b3a4bec6');
    // 75 items carry an identifierref; one (an LTI tool not exported) dangles
    // and becomes a header row that keeps its title.
    expect(referencedIds(cart).size).toBe(74);
    const dangling = cart.items[0].children[0];
    expect(dangling.title).toBe('The SLO Cloud Reporting Tool - DO NOT PUBLISH or DELETE');
    expect(dangling.resourceId).toBeUndefined();
  });

  it('classifies resources into the expected kind counts', () => {
    expect(kindCounts(cart)).toEqual({
      page: 33,
      syllabus: 1,
      assignment: 17,
      discussion: 11,
      announcement: 13,
      quiz: 16,
      link: 0,
      tool: 2,
      file: 293,
      other: 18,
    });
    expect(cart.resources.size).toBe(444 - 16 - 24);
  });

  it('folds quiz and discussion meta into the owning resource', () => {
    for (const r of cart.resources.values()) {
      expect(r.href ?? '').not.toMatch(/assessment_meta\.xml$/);
      if (r.kind === 'quiz') {
        expect(r.files.some((f) => f.endsWith('assessment_meta.xml'))).toBe(true);
        for (const dep of r.dependencies) expect(cart.resources.has(dep)).toBe(false);
      }
      if (r.kind === 'discussion' || r.kind === 'announcement') {
        expect(r.files.length).toBe(2);
        for (const dep of r.dependencies) expect(cart.resources.has(dep)).toBe(false);
      }
    }
    // Every "other" row is a question bank or the course settings bundle.
    for (const r of cart.resources.values()) {
      if (r.kind !== 'other') continue;
      expect(r.href?.includes('non_cc_assessments/') || r.title === 'Course settings').toBe(true);
    }
  });

  it('fills meta from Canvas settings files', () => {
    const a1 = cart.resources.get('g2ec9acea76dc958987d943c60fc31714');
    expect(a1?.kind).toBe('assignment');
    expect(a1?.title).toBe('M01 - Assignment 1: Setup Eclipse');
    expect(a1?.meta).toMatchObject({
      points: 25,
      dueAt: '2026-10-26T06:59:00',
      unlockAt: '2026-10-19T07:00:00',
      submissionTypes: 'online_upload',
      assignmentGroupId: 'g13cbd788eb9e5ec0db01ab2cd5eb4b84',
      workflowState: 'published',
    });

    const quiz = cart.resources.get('gd0161b0eaeae5ec41cd417272ddc9c37');
    expect(quiz?.kind).toBe('quiz');
    expect(quiz?.title).toBe('M01 - Quiz 1: Chapter 1');
    expect(quiz?.meta.points).toBe(10);
    expect(quiz?.meta.questionCount).toBe(10);
    expect(quiz?.meta.dueAt).toBe('2026-10-26T06:59:00');
    expect(quiz?.meta.description).toContain('Quiz Info</h2>');

    const ann = cart.resources.get('g0b6b94872e4be09ede5ab81f6286ae51');
    expect(ann?.kind).toBe('announcement');
    expect(ann?.meta.topicType).toBe('announcement');
    expect(ann?.meta.workflowState).toBe('active');

    const disc = cart.resources.get('g17f8ce453c092639a59e73ad89b7bceb');
    expect(disc?.kind).toBe('discussion');
    expect(disc?.meta.points).toBe(15);
    expect(disc?.meta.dueAt).toBe('2026-11-28T07:59:00');

    const tool = cart.resources.get('g1f17fb8ac958a4c5bee125c61feb24d8');
    expect(tool?.kind).toBe('tool');
    expect(tool?.title).toBe('Respondus LockDown Browser');
    expect(tool?.meta.url).toBe('https://smc-service-cloud.respondus2.com/MONServer/canvas/dashboard.do');

    const udoit = cart.resources.get('g17e54c9451752a1fbc8424c03aa796d5');
    expect(udoit?.kind).toBe('file');
    expect(udoit?.meta.intendedRole).toBe('Instructor');
    expect(udoit?.meta.mime).toBe('application/json');

    expect(cart.assignmentGroups.map((g) => g.title)).toEqual([
      'Discussions',
      'Quizzes',
      'Assignments',
      'Midterm Exam',
      'Final Exam',
    ]);
    expect(cart.assignmentGroups[0].weight).toBe(20);
  });

  it('gives unreferenced resources a title from their own file', () => {
    const bank = cart.resources.get('g0b1ef66b769ea4b34b4bb3e6af7d4959');
    expect(bank?.kind).toBe('other');
    expect(bank?.title).toBe('ICS123ch02');
    expect(cart.unfiled).toContain('g0b1ef66b769ea4b34b4bb3e6af7d4959');
    const syllabus = cart.resources.get('g9a81d6c38a0ac656b28110753a24e634_syllabus');
    expect(syllabus?.kind).toBe('syllabus');
    expect(syllabus?.title).toBe('Syllabus');
    expect(cart.unfiled[0]).toBe(cart.unfiled.find((id) => cart.resources.get(id)?.kind === 'page'));
    expect(cart.unfiled.length).toBe(cart.resources.size - referencedIds(cart).size);
    for (const id of cart.unfiled) expect(referencedIds(cart).has(id)).toBe(false);
  });

  it('resolves a Canvas placeholder path to a real entry', () => {
    expect(cart.zip.resolve('web_resources/Uploaded%20Media/Canvas-Logo.png?canvas_=1')).toBe(
      'web_resources/Uploaded Media/Canvas-Logo.png',
    );
  });

  it('extracts content for one resource of each kind', async () => {
    const syllabus = await extractContent(cart, 'g9a81d6c38a0ac656b28110753a24e634_syllabus');
    expect(syllabus.html.startsWith('<h2><strong>Welcome to ICS C123')).toBe(true);
    expect(syllabus.html).not.toMatch(/<html|<head|<\/body>/i);

    const page = await extractContent(cart, 'ga29b3064de2fcf0c5c6f043a4373041c');
    expect(page.kind).toBe('page');
    expect(page.title).toBe('Academic Integrity - Avoiding Plagiarism');
    expect(page.html.startsWith('<h2 style="background-color: #003764; color: #ffffff;">Code of Conduct</h2>')).toBe(true);

    const assignment = await extractContent(cart, 'g2ec9acea76dc958987d943c60fc31714');
    expect(assignment.html).toContain('Assignment Description</h2>');
    expect(assignment.html.endsWith('<p class="sg-meta">25 points · Due Oct 25, 2026</p>')).toBe(true);

    const quiz = await extractContent(cart, 'gd0161b0eaeae5ec41cd417272ddc9c37');
    expect(quiz.html).toContain('Quiz Info</h2>');
    expect(quiz.html.endsWith('<p class="sg-meta">10 questions · 10 points · Due Oct 25, 2026</p>')).toBe(true);

    const discussion = await extractContent(cart, 'g17f8ce453c092639a59e73ad89b7bceb');
    expect(discussion.html.startsWith('<h2 style="background-color: #003764; color: #ffffff;">Discussion Topic</h2>')).toBe(true);
    expect(discussion.html).toContain('<strong>Discussion Prompt:</strong>');
    expect(discussion.html.endsWith('<p class="sg-meta">15 points · Due Nov 27, 2026</p>')).toBe(true);

    const announcement = await extractContent(cart, 'g0b6b94872e4be09ede5ab81f6286ae51');
    expect(announcement.html.startsWith('<p data-path-to-node="12">Good morning everyone,</p>')).toBe(true);
    expect(announcement.html).not.toContain('sg-meta');

    // Description only: the title is the section heading, and the launch URL never appears.
    const tool = await extractContent(cart, 'g1f17fb8ac958a4c5bee125c61feb24d8');
    expect(tool.html).toBe('<p>Displays the LockDown Browser and Monitor Dashboard</p>');
    expect(tool.html).not.toContain('respondus2.com');

    const image = await extractContent(cart, firstOfKind(cart, 'file'));
    expect(image.html).toMatch(/^<figure><img src="\$IMS-CC-FILEBASE\$\/[^"]+" alt="[^"]+"><figcaption>.+<\/figcaption><\/figure>$|^<p>.+<\/p>$|^$/);
    if (image.html.startsWith('<figure>')) {
      const alt = /alt="([^"]*)"/.exec(image.html)?.[1];
      const caption = /<figcaption>(.*)<\/figcaption>/.exec(image.html)?.[1];
      expect(alt).toBe(caption);
    }

    // A non-image file is a filename line, added only when the title is not already the filename.
    const pdfs = Array.from(cart.resources.values()).filter((r) => r.meta.mime === 'application/pdf');
    expect(pdfs.length).toBeGreaterThan(0);
    for (const r of pdfs.slice(0, 5)) {
      const pdf = await extractContent(cart, r.id);
      const filename = r.meta.filename ?? '';
      expect(filename).toMatch(/\.pdf$/i);
      if (r.title === filename) expect(pdf.html).toBe('');
      else expect(pdf.html).toBe(`<p>File: ${filename.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`);
    }

    const other = await extractContent(cart, 'g0b1ef66b769ea4b34b4bb3e6af7d4959');
    expect(other.html).toBe('');
  });

  it('embeds a png as a data URI and memoises', async () => {
    const resolve = makeAssetResolver(cart);
    const href = '$IMS-CC-FILEBASE$/Uploaded%20Media/Canvas-Logo.png?canvas_=1';
    const a = await resolve(href);
    expect(a?.mime).toBe('image/png');
    expect(a?.dataUri.startsWith('data:image/png;base64,iVBORw0KGgo')).toBe(true);
    expect(a?.bytes).toBe(cart.zip.size('web_resources/Uploaded Media/Canvas-Logo.png'));
    expect(await resolve('Uploaded Media/Canvas-Logo.png')).toBe(a);
    expect(await resolve('https://coastdistrict.instructure.com/courses/1/files/2')).toBeNull();
  });

  it('resolves $WIKI_REFERENCE$ links found in real pages', async () => {
    const wiki = makeWikiResolver(cart);
    expect(wiki('$WIKI_REFERENCE$/pages/gfa5c1ee70c5ec9ca6b32df39d2d44f9a')).toBe('gfa5c1ee70c5ec9ca6b32df39d2d44f9a');
    expect(wiki('$WIKI_REFERENCE$/pages/academic-integrity-avoiding-plagiarism')).toBe('ga29b3064de2fcf0c5c6f043a4373041c');
    expect(wiki('$WIKI_REFERENCE$/pages/course-materials-software-and-technology-requirements')).toBe(
      'gfa5c1ee70c5ec9ca6b32df39d2d44f9a',
    );
    const page = await extractContent(cart, 'gc0612f7c0ecd15093b27027c241a2b5f'); // M01 - Task List
    const refs = Array.from(page.html.matchAll(/\$WIKI_REFERENCE\$\/pages\/[^"'\s]+/g), (m) => m[0]);
    expect(refs.length).toBeGreaterThan(0);
    const resolved = refs.map((r) => wiki(r));
    expect(resolved.some((id) => id !== null)).toBe(true);
    for (const id of resolved) if (id !== null) expect(cart.resources.get(id)?.kind).toBe('page');
  });
});

/** Distinct resource ids referenced anywhere in the organization tree. */
function referencedIds(cart: Cartridge): Set<string> {
  const seen = new Set<string>();
  const walk = (items: Cartridge['items']) => {
    for (const it of items) {
      if (it.resourceId) seen.add(it.resourceId);
      walk(it.children);
    }
  };
  walk(cart.items);
  return seen;
}
