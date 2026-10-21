import type { HistoricalAnalysis } from "./historical.ts";

const BLUE = "#17638a";
const ORANGE = "#b85f1a";
const INK = "#20343e";
const xml = (value: string) => value.replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[c]!));
const coordinate = (value: number) => {
  if (!Number.isFinite(value)) throw new RangeError("SVG coordinates and data must be finite");
  return value.toFixed(5);
};
const text = (x: number, y: number, label: string, extra = "") =>
  `<text x="${coordinate(x)}" y="${coordinate(y)}" ${extra}>${xml(label)}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, extra = "") =>
  `<line x1="${coordinate(x1)}" y1="${coordinate(y1)}" x2="${coordinate(x2)}" y2="${coordinate(y2)}" ${extra}/>`;

function frame(title: string, description: string, sha: string, body: string) {
  if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error("Expected SHA-256 for the source table");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="620" viewBox="0 0 1000 620" role="img" aria-labelledby="title description">
<title id="title">${xml(title)}</title><desc id="description">${xml(description)}</desc>
<metadata>${xml(JSON.stringify({ evidenceCategory: "historical-reported-unverified", inputSha256: sha, units: ["L/min", "W", "%"], differenceDirection: "TAPH minus fixed-42" }))}</metadata>
<rect width="1000" height="620" fill="white"/>
<style>text{font-family:Arial,Helvetica,sans-serif;fill:${INK};font-size:17px} .tick{font-size:15px} .note{font-size:15px} .grid{stroke:#d9e1e5;stroke-width:1} .axis{stroke:#8a9ba3;stroke-width:1.4}</style>
${text(90, 38, title, 'font-weight="bold" style="font-size:23px"')}
${body}
${text(90, 590, "Source: supplied reported-power table. Physical or simulated provenance is unverified.", 'class="note"')}
</svg>\n`;
}

/** Deterministic, dependency-free SVG; no inferred RPM series or physical-error bars. */
export function renderHistoricalPlots(analysis: HistoricalAnalysis, sourceSha256: string) {
  if (analysis.evidenceCategory !== "historical-reported-unverified" || analysis.byFlow.length !== 5) {
    throw new Error("Historical plots require the five-flow reported-data analysis");
  }
  const points = analysis.byFlow;
  const x = (flow: number) => 90 + (flow - 1) * 166;
  const max = Math.max(1, Math.ceil(Math.max(...points.flatMap((p) => [p.fixedMeanW, p.taphMeanW]))));
  const y = (power: number) => 475 - power / (max * 1.08) * 375;
  let body = "";
  for (let tick = 0; tick <= 6; tick++) {
    const value = max * tick / 6;
    body += line(90, y(value), 920, y(value), 'class="grid"');
    body += text(78, y(value) + 5, value.toFixed(1), 'class="tick" text-anchor="end"');
  }
  body += line(90, 475, 920, 475, 'class="axis"') + line(90, 100, 90, 475, 'class="axis"');
  for (const point of points) body += text(x(point.nominalFlowLpm), 501, point.nominalFlowLpm.toFixed(2), 'class="tick" text-anchor="middle"');
  body += text(505, 532, "Nominal flow rate (L/min)", 'text-anchor="middle"');
  body += '<text transform="translate(28 290) rotate(-90)" text-anchor="middle">Mean listed power (W)</text>';
  for (const [field, label, color, dashed] of [
    ["fixedMeanW", "Fixed 42° comparison", BLUE, false], ["taphMeanW", "TAPH", ORANGE, true],
  ] as const) {
    body += `<polyline fill="none" stroke="${color}" stroke-width="2.5" ${dashed ? 'stroke-dasharray="8 5"' : ""} points="${points.map((p) => `${coordinate(x(p.nominalFlowLpm))},${coordinate(y(p[field]))}`).join(" ")}"/>`;
    for (const point of points) {
      const attrs = `data-condition="${field === "fixedMeanW" ? "fixed-42" : "taph"}" data-flow-lpm="${point.nominalFlowLpm}" data-power-w="${coordinate(point[field])}"`;
      body += dashed
        ? `<rect ${attrs} x="${coordinate(x(point.nominalFlowLpm) - 5)}" y="${coordinate(y(point[field]) - 5)}" width="10" height="10" fill="${color}"/>`
        : `<circle ${attrs} cx="${coordinate(x(point.nominalFlowLpm))}" cy="${coordinate(y(point[field]))}" r="5" fill="${color}"/>`;
    }
    const legendY = dashed ? 108 : 79;
    body += line(120, legendY - 5, 155, legendY - 5, `stroke="${color}" stroke-width="3" ${dashed ? 'stroke-dasharray="8 5"' : ""}`);
    body += text(168, legendY, label);
  }
  body += text(90, 562, "Five listed values per mean. Lines guide the eye; this is not a time-response trace.", 'class="note"');
  const meanPower = frame("Historical table: mean power by flow", "Ten mean power points at five nominal flows. No error bars: replicate provenance is unresolved; sample deviations are available in statistics.json.", sourceSha256, body);

  body = "";
  const panels = [
    { left: 90, field: "differenceTaphMinusFixedW" as const, label: "Mean difference (W)", letter: "A" },
    { left: 570, field: "relativeChangePercent" as const, label: "Relative change (%)", letter: "B" },
  ];
  for (const panel of panels) {
    const values = points.map((p) => p[panel.field]);
    const numbers = values.filter((value): value is number => value !== null);
    const lower = Math.min(0, ...numbers);
    const upper = Math.max(0, ...numbers);
    const span = Math.max(1, upper - lower);
    const powerOfTen = 10 ** Math.floor(Math.log10(span / 4));
    const normalizedStep = span / 4 / powerOfTen;
    const step = ([1, 2, 2.5, 5, 10].find((v) => v >= normalizedStep) ?? 10) * powerOfTen;
    const firstTick = Math.floor(lower / step) * step;
    const lastTick = Math.ceil(upper / step) * step;
    const low = firstTick - 0.16 * span;
    const high = lastTick + 0.08 * span;
    const sy = (v: number) => 475 - (v - low) / (high - low) * 340;
    const sx = (i: number) => panel.left + 40 + i * 70;
    body += text(panel.left, 92, panel.letter, 'font-weight="bold" style="font-size:23px"');
    for (let i = 0; i <= Math.round((lastTick - firstTick) / step); i++) {
      const v = firstTick + i * step;
      body += line(panel.left, sy(v), panel.left + 350, sy(v), 'class="grid"');
      body += text(panel.left - 10, sy(v) + 5, Number(v.toPrecision(12)).toString(), 'text-anchor="end" class="tick"');
    }
    body += line(panel.left, 130, panel.left, 475, 'class="axis"');
    body += line(panel.left, sy(0), panel.left + 350, sy(0), `stroke="${INK}" stroke-width="1.5"`);
    for (let i = 0; i < points.length; i++) {
      const value = values[i]!;
      if (value === null) {
        body += `<g data-panel="${panel.letter}" data-flow-lpm="${points[i]!.nominalFlowLpm}" data-unavailable="zero-baseline">${text(sx(i), sy(0) - 12, "N/A", 'text-anchor="middle" class="tick"')}</g>`;
        body += text(sx(i), 501, points[i]!.nominalFlowLpm.toFixed(2), 'text-anchor="middle" class="tick"');
        continue;
      }
      const barY = Math.min(sy(0), sy(value));
      body += `<rect data-panel="${panel.letter}" data-flow-lpm="${points[i]!.nominalFlowLpm}" data-value="${coordinate(value)}" x="${coordinate(sx(i) - 19)}" y="${coordinate(barY)}" width="38" height="${coordinate(Math.abs(sy(value) - sy(0)))}" fill="${ORANGE}"/>`;
      const numberLabel = panel.field === "relativeChangePercent" ? `${value.toFixed(2)}%` : value.toFixed(4);
      body += text(sx(i), sy(value) + (value <= 0 ? 23 : -12), numberLabel, 'text-anchor="middle" class="tick"');
      body += text(sx(i), 501, points[i]!.nominalFlowLpm.toFixed(2), 'text-anchor="middle" class="tick"');
    }
    body += text(panel.left + 175, 532, "Nominal flow rate (L/min)", 'text-anchor="middle"');
    body += `<text transform="translate(${panel.left - 62} 300) rotate(-90)" text-anchor="middle">${xml(panel.label)}</text>`;
  }
  body += text(90, 562, "Negative: lower listed TAPH power. N/A: zero fixed mean. No protection benefit is inferred.", 'class="note"');
  return {
    meanPower,
    differences: frame("Historical table: TAPH minus fixed 42°", "Absolute mean differences in watts and relative changes in percent, in separate panels. Historical numerical comparison only, not efficiency or verified hardware performance.", sourceSha256, body),
  };
}
