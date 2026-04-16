import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReportDocument,
  formatReportJson,
  formatReportMarkdown,
  writeReport,
} from "../reporter.js";

test("buildReportDocument normalizes and sorts report data deterministically", () => {
  const generatedAt = new Date("2026-04-15T12:00:00.000Z");
  const summary = {
    status: "passed" as const,
    checksTotal: 2.4,
    checksPassed: 1.6,
    checksFailed: -10,
    durationMs: 27.8,
  };

  const checks = [
    {
      name: "  ",
      type: "network",
      status: "failed",
      durationMs: 9.2,
      issues: [
        { title: "Timeout", message: "  request took too long ", severity: "high" },
        { title: "", message: "", severity: "bogus", target: "  /api " },
      ],
    },
    {
      name: "Accessibility Audit",
      type: "accessibility",
      status: "passed",
      durationMs: 3.3,
      issues: [],
    },
  ];

  const document = buildReportDocument(summary, checks, generatedAt);

  assert.deepEqual(document.summary, {
    status: "passed",
    checksTotal: 2,
    checksPassed: 2,
    checksFailed: 0,
    durationMs: 28,
  });
  assert.equal(document.checks[0].type, "accessibility");
  assert.equal(document.checks[1].name, "Unnamed Check");
  assert.equal(document.checks[1].issues[0].severity, "high");
  assert.equal(document.checks[1].issues[1].severity, "unknown");
});

test("formatters produce stable markdown and json output", () => {
  const generatedAt = new Date("2026-04-15T12:00:00.000Z");
  const document = buildReportDocument(
    {
      status: "failed" as const,
      checksTotal: 1,
      checksPassed: 0,
      checksFailed: 1,
      durationMs: 42,
    },
    [
      {
        name: "Console Error Scan",
        type: "console",
        status: "failed",
        durationMs: 42,
        issues: [
          {
            title: "Unhandled Error",
            message: "ReferenceError: x is not defined",
            target: "/home",
            severity: "medium",
          },
        ],
      },
    ],
    generatedAt,
  );

  const markdownA = formatReportMarkdown(document);
  const markdownB = formatReportMarkdown(document);
  const jsonA = formatReportJson(document);
  const jsonB = formatReportJson(document);

  assert.equal(markdownA, markdownB);
  assert.equal(jsonA, jsonB);
  assert.match(markdownA, /# Preships QA Report/);
  assert.match(markdownA, /- Type: console/);
  assert.match(markdownA, /\[medium\]/);
  assert.equal(JSON.parse(jsonA).schemaVersion, "1");
});

test("writeReport writes markdown and json report files", () => {
  const tempRepo = mkdtempSync(join(tmpdir(), "preships-report-test-"));

  try {
    const reportPath = writeReport(
      tempRepo,
      {
        status: "passed" as const,
        checksTotal: 1,
        checksPassed: 1,
        checksFailed: 0,
        durationMs: 5,
      },
      [
        {
          name: "Lighthouse Audit",
          type: "lighthouse",
          status: "passed",
          durationMs: 5,
          issues: [],
        },
      ],
      { generatedAt: new Date("2026-04-15T12:00:00.000Z") },
    );

    const expectedMdPath = join(tempRepo, ".preships", "report.md");
    const expectedJsonPath = join(tempRepo, ".preships", "report.json");

    assert.equal(reportPath, expectedMdPath);
    assert.equal(existsSync(expectedMdPath), true);
    assert.equal(existsSync(expectedJsonPath), true);

    const markdown = readFileSync(expectedMdPath, "utf8");
    const json = readFileSync(expectedJsonPath, "utf8");

    assert.match(markdown, /Generated: 2026-04-15T12:00:00.000Z/);
    assert.equal(JSON.parse(json).checks[0].type, "lighthouse");
  } finally {
    rmSync(tempRepo, { recursive: true, force: true });
  }
});
