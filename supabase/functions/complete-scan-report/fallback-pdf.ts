import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "npm:pdf-lib@1.17.1";
import type { PillarInsight, ReportModel } from "./report-template.ts";

const PAGE = { width: 595.28, height: 841.89 };
const C = {
  forest: rgb(0.025, 0.105, 0.075),
  panel: rgb(0.045, 0.16, 0.115),
  panelSoft: rgb(0.075, 0.205, 0.145),
  gold: rgb(0.79, 0.63, 0.29),
  goldLight: rgb(0.93, 0.82, 0.52),
  white: rgb(0.97, 0.96, 0.91),
  muted: rgb(0.72, 0.75, 0.69),
  black: rgb(0.01, 0.02, 0.015),
};

type Fonts = {
  serif: PDFFont;
  serifBold: PDFFont;
  sans: PDFFont;
  sansBold: PDFFont;
};

function ascii(value: unknown): string {
  return String(value ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = ascii(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  options: {
    font: PDFFont;
    size: number;
    color?: ReturnType<typeof rgb>;
    maxWidth?: number;
    lineHeight?: number;
    maxLines?: number;
  },
): number {
  const lines = options.maxWidth
    ? wrap(text, options.font, options.size, options.maxWidth)
    : [ascii(text)];
  const visible = options.maxLines ? lines.slice(0, options.maxLines) : lines;
  const lineHeight = options.lineHeight ?? options.size * 1.35;
  visible.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - (index * lineHeight),
      font: options.font,
      size: options.size,
      color: options.color ?? C.white,
    });
  });
  return y - (visible.length * lineHeight);
}

function basePage(pdf: PDFDocument, fonts: Fonts, pageNumber: number): PDFPage {
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: C.forest });
  page.drawRectangle({
    x: 18,
    y: 18,
    width: PAGE.width - 36,
    height: PAGE.height - 36,
    borderColor: C.gold,
    borderWidth: 0.55,
    opacity: 0.55,
  });
  page.drawText("GODHEALTH - VITALITY FOR THE KINGDOM", {
    x: 42,
    y: 27,
    font: fonts.sans,
    size: 7,
    color: C.muted,
  });
  page.drawText(String(pageNumber), {
    x: PAGE.width - 50,
    y: 27,
    font: fonts.sans,
    size: 7,
    color: C.muted,
  });
  return page;
}

function sectionTitle(page: PDFPage, fonts: Fonts, eyebrow: string, title: string, y: number): number {
  page.drawText(ascii(eyebrow).toUpperCase(), {
    x: 48,
    y,
    font: fonts.sansBold,
    size: 8,
    color: C.gold,
  });
  return drawText(page, title, 48, y - 28, {
    font: fonts.serifBold,
    size: 26,
    color: C.goldLight,
    maxWidth: PAGE.width - 96,
    lineHeight: 29,
  }) - 10;
}

function card(page: PDFPage, x: number, y: number, width: number, height: number, primary = false): void {
  page.drawRectangle({
    x,
    y: y - height,
    width,
    height,
    color: primary ? C.panelSoft : C.panel,
    borderColor: primary ? C.goldLight : C.gold,
    borderWidth: primary ? 1.1 : 0.55,
    opacity: 0.98,
  });
}

function pillarCard(
  page: PDFPage,
  fonts: Fonts,
  insight: PillarInsight,
  y: number,
  primary: boolean,
): number {
  const height = 205;
  card(page, 48, y, PAGE.width - 96, height, primary);
  page.drawText(ascii(insight.rank).toUpperCase(), {
    x: 66,
    y: y - 25,
    font: fonts.sansBold,
    size: 7.5,
    color: C.gold,
  });
  page.drawText(ascii(insight.name), {
    x: 66,
    y: y - 53,
    font: fonts.serifBold,
    size: 22,
    color: C.white,
  });
  page.drawText(`${insight.score}/100`, {
    x: PAGE.width - 127,
    y: y - 51,
    font: fonts.serifBold,
    size: 19,
    color: C.goldLight,
  });
  page.drawLine({
    start: { x: 66, y: y - 70 },
    end: { x: PAGE.width - 66, y: y - 70 },
    color: C.gold,
    thickness: 0.45,
    opacity: 0.45,
  });
  page.drawText("WHAT IS SUPPORTING YOU", {
    x: 66,
    y: y - 92,
    font: fonts.sansBold,
    size: 7,
    color: C.goldLight,
  });
  drawText(page, insight.strength, 66, y - 110, {
    font: fonts.sans,
    size: 8.4,
    color: C.white,
    maxWidth: 205,
    lineHeight: 11.2,
    maxLines: 5,
  });
  page.drawText("WHERE YOU CAN GROW", {
    x: 305,
    y: y - 92,
    font: fonts.sansBold,
    size: 7,
    color: C.goldLight,
  });
  drawText(page, insight.growth, 305, y - 110, {
    font: fonts.sans,
    size: 8.4,
    color: C.white,
    maxWidth: 220,
    lineHeight: 11.2,
    maxLines: 5,
  });
  page.drawRectangle({
    x: 66,
    y: y - 186,
    width: PAGE.width - 132,
    height: 31,
    color: C.black,
    opacity: 0.28,
  });
  page.drawText("YOUR NEXT STEP", {
    x: 78,
    y: y - 175,
    font: fonts.sansBold,
    size: 7,
    color: C.goldLight,
  });
  drawText(page, insight.nextStep, 166, y - 175, {
    font: fonts.sans,
    size: 8.2,
    color: C.white,
    maxWidth: 345,
    lineHeight: 10,
    maxLines: 2,
  });
  return y - height - 18;
}

function planCard(
  page: PDFPage,
  fonts: Fonts,
  day: ReportModel["plan"][number],
  y: number,
): number {
  const height = 135;
  card(page, 48, y, PAGE.width - 96, height);
  page.drawRectangle({ x: 63, y: y - 52, width: 47, height: 38, color: C.gold, opacity: 0.18 });
  page.drawText(`DAY ${day.day}`, {
    x: 73,
    y: y - 37,
    font: fonts.sansBold,
    size: 9,
    color: C.goldLight,
  });
  page.drawText(ascii(day.title), {
    x: 126,
    y: y - 31,
    font: fonts.serifBold,
    size: 16,
    color: C.white,
  });
  drawText(page, day.intro, 126, y - 48, {
    font: fonts.sans,
    size: 7.8,
    color: C.muted,
    maxWidth: 390,
    maxLines: 2,
  });
  const keys = ["spiritual", "mental", "physical"] as const;
  const labels = { spiritual: "SPIRIT", mental: "SOUL", physical: "BODY" };
  keys.forEach((key, index) => {
    const lineY = y - 75 - (index * 18);
    page.drawText(labels[key], {
      x: 126,
      y: lineY,
      font: fonts.sansBold,
      size: 6.8,
      color: C.goldLight,
    });
    drawText(page, day.actions[key], 177, lineY, {
      font: fonts.sans,
      size: 7.5,
      color: C.white,
      maxWidth: 340,
      maxLines: 1,
    });
  });
  return y - height - 15;
}

export async function buildFallbackPdf(model: ReportModel): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Kingdom Vitality Report");
  pdf.setAuthor("GodHealth");
  pdf.setSubject("Personal Body, Soul and Spirit Alignment Report");
  const fonts: Fonts = {
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    sans: await pdf.embedFont(StandardFonts.Helvetica),
    sansBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const cover = basePage(pdf, fonts, 1);
  cover.drawText("GODHEALTH", {
    x: 220,
    y: 770,
    font: fonts.serifBold,
    size: 17,
    color: C.goldLight,
  });
  cover.drawText("PERSONAL ALIGNMENT REPORT", {
    x: 202,
    y: 724,
    font: fonts.sansBold,
    size: 8,
    color: C.gold,
  });
  drawText(cover, "Your Kingdom Vitality Results", 82, 685, {
    font: fonts.serifBold,
    size: 31,
    color: C.goldLight,
    maxWidth: PAGE.width - 164,
    lineHeight: 34,
  });
  drawText(cover, `Prepared for ${model.lead.first_name} from their personal scan responses.`, 125, 642, {
    font: fonts.sans,
    size: 9,
    color: C.muted,
    maxWidth: PAGE.width - 250,
  });
  cover.drawCircle({
    x: PAGE.width / 2,
    y: 520,
    size: 77,
    borderColor: C.goldLight,
    borderWidth: 9,
    color: C.panel,
  });
  const overallText = `${model.overall}%`;
  cover.drawText(overallText, {
    x: (PAGE.width / 2) - (fonts.serifBold.widthOfTextAtSize(overallText, 32) / 2),
    y: 513,
    font: fonts.serifBold,
    size: 32,
    color: C.goldLight,
  });
  cover.drawText("OVERALL ALIGNMENT", {
    x: 244,
    y: 493,
    font: fonts.sansBold,
    size: 6.8,
    color: C.white,
  });
  drawText(cover, `${model.lead.first_name}, here is your starting point.`, 92, 404, {
    font: fonts.serifBold,
    size: 23,
    color: C.white,
    maxWidth: PAGE.width - 184,
  });
  drawText(cover, model.summary, 110, 372, {
    font: fonts.sans,
    size: 9,
    color: C.muted,
    maxWidth: PAGE.width - 220,
    lineHeight: 13,
    maxLines: 3,
  });
  card(cover, 72, 315, PAGE.width - 144, 105);
  (["physical", "mental", "spiritual"] as const).forEach((key, index) => {
    const label = { physical: "Body", mental: "Soul", spiritual: "Spirit" }[key];
    const score = model.scores[key];
    const y = 284 - (index * 28);
    cover.drawText(label, { x: 92, y, font: fonts.sansBold, size: 9, color: C.white });
    cover.drawRectangle({ x: 155, y: y + 1, width: 280, height: 5, color: C.black });
    cover.drawRectangle({ x: 155, y: y + 1, width: 2.8 * score, height: 5, color: C.goldLight });
    cover.drawText(String(score), { x: 452, y, font: fonts.sansBold, size: 9, color: C.goldLight });
  });
  card(cover, 72, 185, PAGE.width - 144, 75, true);
  cover.drawText("PRIMARY ALIGNMENT GAP", {
    x: 92,
    y: 159,
    font: fonts.sansBold,
    size: 7.5,
    color: C.gold,
  });
  cover.drawText(ascii(model.primaryName), {
    x: 92,
    y: 130,
    font: fonts.serifBold,
    size: 21,
    color: C.goldLight,
  });

  const pillarsOne = basePage(pdf, fonts, 2);
  let y = sectionTitle(pillarsOne, fonts, "Your three pillars", "Where you stand - and where to grow", 775);
  y = pillarCard(pillarsOne, fonts, model.pillars[0], y, true);
  pillarCard(pillarsOne, fonts, model.pillars[1], y, false);

  const pillarsTwo = basePage(pdf, fonts, 3);
  y = sectionTitle(pillarsTwo, fonts, "Your supporting pillar", "Complete your alignment overview", 775);
  y = pillarCard(pillarsTwo, fonts, model.pillars[2], y, false);
  y -= 8;
  pageScripture(pillarsTwo, fonts, model, y);

  const planOne = basePage(pdf, fonts, 4);
  y = sectionTitle(planOne, fonts, "Body - Soul - Spirit", "Your Personal 7-Day Alignment Plan", 775);
  drawText(planOne, "Each day brings all three pillars together. Completion over perfection.", 48, y, {
    font: fonts.sans,
    size: 9,
    color: C.muted,
    maxWidth: PAGE.width - 96,
  });
  y -= 34;
  model.plan.slice(0, 3).forEach((day) => {
    y = planCard(planOne, fonts, day, y);
  });

  const planTwo = basePage(pdf, fonts, 5);
  y = sectionTitle(planTwo, fonts, "Continue the rhythm", "Days 4-7", 775);
  model.plan.slice(3).forEach((day) => {
    y = planCard(planTwo, fonts, day, y);
  });
  drawText(
    planTwo,
    "This report is educational, Biblical and science-informed. It does not diagnose, treat or replace medical care. Choose actions appropriate for your circumstances and seek qualified professional guidance when needed.",
    58,
    75,
    { font: fonts.sans, size: 7.5, color: C.muted, maxWidth: PAGE.width - 116, lineHeight: 10 },
  );

  return await pdf.save({ useObjectStreams: true });
}

function pageScripture(page: PDFPage, fonts: Fonts, model: ReportModel, y: number): void {
  card(page, 48, y, PAGE.width - 96, 215, true);
  page.drawText("A KJV SCRIPTURE FOR YOUR RESULT", {
    x: 68,
    y: y - 28,
    font: fonts.sansBold,
    size: 7.5,
    color: C.gold,
  });
  drawText(page, `"${model.verse.text}"`, 68, y - 60, {
    font: fonts.serif,
    size: 14,
    color: C.white,
    maxWidth: PAGE.width - 136,
    lineHeight: 18,
    maxLines: 6,
  });
  page.drawText(`${ascii(model.verse.ref)} - KJV`, {
    x: 68,
    y: y - 151,
    font: fonts.sansBold,
    size: 8,
    color: C.goldLight,
  });
  drawText(page, `Put it into practice: ${model.versePractice}`, 68, y - 176, {
    font: fonts.sans,
    size: 8,
    color: C.muted,
    maxWidth: PAGE.width - 136,
    lineHeight: 11,
    maxLines: 3,
  });
}
