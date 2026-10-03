import assert from "node:assert/strict";
import test from "node:test";
import * as attendance from "../lib/attendance.ts";
import { safeLoginRedirect } from "../lib/auth-redirect.ts";

test("overall attendance weights periods and keeps subject totals separate", () => {
  const records = [
    { subjectId: "a", periods: 1, attended: 1 },
    { subjectId: "b", periods: 9, attended: 6 },
  ];
  assert.equal(attendance.getTotals(records).percentage, 70);
  assert.equal(attendance.getSubjectTotals(records, "a").percentage, 100);
  assert.equal(attendance.getHealth(75, 75), "watch");
  assert.equal(attendance.getHealth(79.99, 80), "critical");
  assert.equal(attendance.getHealth(null, 75), "empty");
});

test("planner required attendance and safe absences match integer period arithmetic", () => {
  for (let conducted = 0; conducted <= 40; conducted++) {
    for (let attended = 0; attended <= conducted; attended++) {
      const totals = { attended, conducted, percentage: conducted ? attended / conducted * 100 : null };
      for (const target of [75, 80, 100]) {
        let consecutive = null;
        for (let count = 0; count <= 160; count++) {
          if (conducted + count > 0 && (attended + count) * 100 >= target * (conducted + count)) { consecutive = count; break; }
        }
        assert.equal(attendance.classesNeeded(totals, target), consecutive);
        let missed = 0;
        while (conducted + missed + 1 > 0 && attended * 100 >= target * (conducted + missed + 1)) missed++;
        assert.equal(attendance.classesThatCanBeMissed(totals, target), missed);
        for (let upcoming = 1; upcoming <= 15; upcoming++) {
          let required = null;
          for (let count = 0; count <= upcoming; count++) {
            if ((attended + count) * 100 >= target * (conducted + upcoming)) { required = count; break; }
          }
          const result = attendance.classesToAttendWithinUpcoming(totals, target, upcoming);
          if (required === null) assert.ok(result > upcoming);
          else assert.equal(result, required);
        }
      }
    }
  }
});

test("login redirects stay inside Attendly, including backslash URL variants", () => {
  const origin = "https://attendance-management-beta-flax.vercel.app";
  for (const path of [null, "", "https://example.com", "//example.com", "/\\example.com", "javascript:alert(1)", "/\n/example.com"]) {
    assert.equal(safeLoginRedirect(path, origin), "/dashboard");
  }
  assert.equal(safeLoginRedirect("/dashboard?view=planner#forecast", origin), "/dashboard?view=planner#forecast");
});
