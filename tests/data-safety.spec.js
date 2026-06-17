const { execFileSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, expect } = require("@playwright/test");

test("local JSON writes keep a previous-file backup beside the active data file", () => {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "pressureflow-data-safety-"));
  const script = `
    const path = require("node:path");
    const { ensureDataFile, writeJobs } = require(process.cwd() + "/db");
    (async () => {
      await ensureDataFile();
      await writeJobs([{ id: "first-job", accountId: "owner", customerName: "First" }]);
      await writeJobs([{ id: "second-job", accountId: "owner", customerName: "Second" }]);
      process.stdout.write(path.join(process.env.PRESSUREFLOW_DATA_DIR, "jobs.json"));
    })().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;

  try {
    const jobsPath = execFileSync(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: "",
        PRESSUREFLOW_DATA_DIR: dataDir
      },
      encoding: "utf8"
    }).trim();

    const activeJobs = JSON.parse(readFileSync(jobsPath, "utf8"));
    const backupJobs = JSON.parse(readFileSync(`${jobsPath}.bak`, "utf8"));

    expect(activeJobs.map((job) => job.id)).toEqual(["second-job"]);
    expect(backupJobs.map((job) => job.id)).toEqual(["first-job"]);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
