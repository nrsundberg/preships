import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

// Row types

export interface Repo {
  id: number;
  path: string;
  name: string;
  url: string | null;
  last_checked_commit: string | null;
  created_at: string;
}

export interface Run {
  id: number;
  repo_id: number;
  commit_hash: string;
  trigger: string;
  status: string;
  checks_total: number;
  checks_passed: number;
  checks_failed: number;
  duration_ms: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface CheckResult {
  id: number;
  run_id: number;
  check_type: string;
  target: string | null;
  status: string;
  message: string | null;
  details: string | null;
  model_used: string | null;
  tokens_used: number;
  cost_cents: number;
  created_at: string;
}

export interface LearnedPattern {
  id: number;
  repo_id: number | null;
  pattern_type: string;
  description: string;
  frequency: number;
  last_seen: string;
  created_at: string;
}

export interface Feedback {
  id: number;
  run_id: number;
  type: string;
  value: string;
  submitted_to_cloud: number;
  created_at: string;
}

export interface TokenUsage {
  id: number;
  run_id: number;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  created_at: string;
}

const DEFAULT_DB_PATH = join(homedir(), ".preships", "state.db");

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS repos (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    last_checked_commit TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY,
    repo_id INTEGER REFERENCES repos(id),
    commit_hash TEXT,
    trigger TEXT,
    status TEXT,
    checks_total INTEGER DEFAULT 0,
    checks_passed INTEGER DEFAULT 0,
    checks_failed INTEGER DEFAULT 0,
    duration_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS check_results (
    id INTEGER PRIMARY KEY,
    run_id INTEGER REFERENCES runs(id),
    check_type TEXT NOT NULL,
    target TEXT,
    status TEXT,
    message TEXT,
    details TEXT,
    model_used TEXT,
    tokens_used INTEGER DEFAULT 0,
    cost_cents INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS learned_patterns (
    id INTEGER PRIMARY KEY,
    repo_id INTEGER,
    pattern_type TEXT,
    description TEXT NOT NULL,
    frequency INTEGER DEFAULT 1,
    last_seen TEXT DEFAULT (datetime('now')),
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY,
    run_id INTEGER REFERENCES runs(id),
    type TEXT,
    value TEXT,
    submitted_to_cloud BOOLEAN DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY,
    run_id INTEGER REFERENCES runs(id),
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost_cents INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`;

export class Storage {
  private db: Database.Database;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
  }

  // --- Repos ---

  registerRepo(path: string, name: string, url?: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO repos (path, name, url) VALUES (?, ?, ?)
      ON CONFLICT(path) DO UPDATE SET name = excluded.name, url = excluded.url
    `);
    return Number(stmt.run(path, name, url ?? null).lastInsertRowid);
  }

  getRepo(path: string): Repo | undefined {
    return this.db.prepare("SELECT * FROM repos WHERE path = ?").get(path) as
      | Repo
      | undefined;
  }

  getRepos(): Repo[] {
    return this.db.prepare("SELECT * FROM repos ORDER BY created_at DESC").all() as Repo[];
  }

  updateLastCheckedCommit(repoId: number, commit: string): void {
    this.db
      .prepare("UPDATE repos SET last_checked_commit = ? WHERE id = ?")
      .run(commit, repoId);
  }

  // --- Runs ---

  createRun(repoId: number, commitHash: string, trigger: string): number {
    const stmt = this.db.prepare(
      "INSERT INTO runs (repo_id, commit_hash, trigger, status) VALUES (?, ?, ?, 'running')",
    );
    return Number(stmt.run(repoId, commitHash, trigger).lastInsertRowid);
  }

  completeRun(
    runId: number,
    status: string,
    checksTotal: number,
    checksPassed: number,
    checksFailed: number,
    durationMs: number,
  ): void {
    this.db
      .prepare(
        `UPDATE runs
         SET status = ?, checks_total = ?, checks_passed = ?, checks_failed = ?,
             duration_ms = ?, completed_at = datetime('now')
         WHERE id = ?`,
      )
      .run(status, checksTotal, checksPassed, checksFailed, durationMs, runId);
  }

  getRun(runId: number): Run | undefined {
    return this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as
      | Run
      | undefined;
  }

  getRecentRuns(repoId: number, limit: number = 20): Run[] {
    return this.db
      .prepare(
        "SELECT * FROM runs WHERE repo_id = ? ORDER BY created_at DESC LIMIT ?",
      )
      .all(repoId, limit) as Run[];
  }

  // --- Check Results ---

  addCheckResult(result: {
    runId: number;
    checkType: string;
    target: string;
    status: string;
    message?: string;
    details?: any;
    modelUsed?: string;
    tokensUsed?: number;
    costCents?: number;
  }): number {
    const stmt = this.db.prepare(
      `INSERT INTO check_results (run_id, check_type, target, status, message, details, model_used, tokens_used, cost_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const details =
      result.details != null ? JSON.stringify(result.details) : null;
    return Number(
      stmt.run(
        result.runId,
        result.checkType,
        result.target,
        result.status,
        result.message ?? null,
        details,
        result.modelUsed ?? null,
        result.tokensUsed ?? 0,
        result.costCents ?? 0,
      ).lastInsertRowid,
    );
  }

  getCheckResults(runId: number): CheckResult[] {
    return this.db
      .prepare("SELECT * FROM check_results WHERE run_id = ? ORDER BY id")
      .all(runId) as CheckResult[];
  }

  // --- Learned Patterns ---

  addPattern(
    repoId: number | null,
    type: string,
    description: string,
  ): number {
    const stmt = this.db.prepare(
      "INSERT INTO learned_patterns (repo_id, pattern_type, description) VALUES (?, ?, ?)",
    );
    return Number(stmt.run(repoId, type, description).lastInsertRowid);
  }

  incrementPattern(patternId: number): void {
    this.db
      .prepare(
        "UPDATE learned_patterns SET frequency = frequency + 1, last_seen = datetime('now') WHERE id = ?",
      )
      .run(patternId);
  }

  getPatterns(repoId?: number | null): LearnedPattern[] {
    if (repoId === undefined || repoId === null) {
      return this.db
        .prepare(
          "SELECT * FROM learned_patterns ORDER BY frequency DESC, last_seen DESC",
        )
        .all() as LearnedPattern[];
    }
    return this.db
      .prepare(
        `SELECT * FROM learned_patterns
         WHERE repo_id = ? OR repo_id IS NULL
         ORDER BY frequency DESC, last_seen DESC`,
      )
      .all(repoId) as LearnedPattern[];
  }

  // --- Feedback ---

  addFeedback(runId: number, type: string, value: string): number {
    const stmt = this.db.prepare(
      "INSERT INTO feedback (run_id, type, value) VALUES (?, ?, ?)",
    );
    return Number(stmt.run(runId, type, value).lastInsertRowid);
  }

  getUnsubmittedFeedback(): Feedback[] {
    return this.db
      .prepare(
        "SELECT * FROM feedback WHERE submitted_to_cloud = 0 ORDER BY created_at",
      )
      .all() as Feedback[];
  }

  markFeedbackSubmitted(feedbackId: number): void {
    this.db
      .prepare("UPDATE feedback SET submitted_to_cloud = 1 WHERE id = ?")
      .run(feedbackId);
  }

  // --- Token Usage ---

  trackTokenUsage(usage: {
    runId: number;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costCents: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO token_usage (run_id, model, provider, input_tokens, output_tokens, cost_cents)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        usage.runId,
        usage.model,
        usage.provider,
        usage.inputTokens,
        usage.outputTokens,
        usage.costCents,
      );
  }

  getTokenUsage(repoId?: number, since?: string): TokenUsage[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (repoId !== undefined) {
      conditions.push("r.repo_id = ?");
      params.push(repoId);
    }
    if (since !== undefined) {
      conditions.push("t.created_at >= ?");
      params.push(since);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    return this.db
      .prepare(
        `SELECT t.* FROM token_usage t
         JOIN runs r ON r.id = t.run_id
         ${where}
         ORDER BY t.created_at DESC`,
      )
      .all(...params) as TokenUsage[];
  }

  getTotalCost(repoId?: number, since?: string): number {
    const conditions: string[] = [];
    const params: any[] = [];

    if (repoId !== undefined) {
      conditions.push("r.repo_id = ?");
      params.push(repoId);
    }
    if (since !== undefined) {
      conditions.push("t.created_at >= ?");
      params.push(since);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(t.cost_cents), 0) AS total FROM token_usage t
         JOIN runs r ON r.id = t.run_id
         ${where}`,
      )
      .get(...params) as { total: number };

    return row.total;
  }

  // --- Interaction counting (metadata table) ---

  getInteractionCount(): number {
    const row = this.db
      .prepare("SELECT value FROM metadata WHERE key = 'interaction_count'")
      .get() as { value: string } | undefined;
    return row ? parseInt(row.value, 10) : 0;
  }

  incrementInteractionCount(): void {
    this.db
      .prepare(
        `INSERT INTO metadata (key, value) VALUES ('interaction_count', '1')
         ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
      )
      .run();
  }

  // --- Lifecycle ---

  close(): void {
    this.db.close();
  }
}
