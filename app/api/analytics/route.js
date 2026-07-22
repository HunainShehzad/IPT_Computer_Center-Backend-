import { connectDB } from "@/lib/db";
import Fee from "@/models/Fee";
import Student from "@/models/Student";
import Batch from "@/models/Batch";
import { NextResponse } from "next/server";
import { withCors, optionsResponse } from "@/lib/cors";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return optionsResponse();
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

const MONTH_FULL = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a month label like "Jan 2025" → { year: 2025, month: 1 }
 */
function parseMonthLabel(label) {
  if (!label) return null;
  const parts = label.trim().split(" ");
  if (parts.length < 2) return null;
  const monthIdx = MONTH_NAMES.indexOf(parts[0]);
  const year = parseInt(parts[1], 10);
  if (monthIdx === -1 || isNaN(year)) return null;
  return { year, month: monthIdx + 1 }; // 1-based
}

/**
 * Build the list of month labels a student owes fees for.
 * Starts at admissionDate, ends at the cap (today for active; leave-month for left).
 * e.g. admitted "May 2025", cap = Jul 2026 → ["May 2025", "Jun 2025", …, "Jul 2026"]
 */
function buildExpectedMonths(admissionDateStr, capYear, capMonth) {
  // capYear/capMonth of 0 means "no months at all" (student left with unknown date)
  if (!capYear || !capMonth) return [];
  if (!admissionDateStr) return [];
  const d = new Date(admissionDateStr);
  if (isNaN(d.getTime())) return [];

  const fromYear  = d.getFullYear();
  const fromMonth = d.getMonth() + 1; // 1-based

  const months = [];
  let y = fromYear;
  let m = fromMonth;
  while (y < capYear || (y === capYear && m <= capMonth)) {
    months.push(`${MONTH_NAMES[m - 1]} ${y}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

/**
 * Get the start-of-day Date for a given Date object.
 */
function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/**
 * Get the start of the ISO week (Monday) for a given Date.
 */
function startOfWeek(d) {
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analytics — admin only
//
// Returns a single JSON object with ALL financial KPIs computed server-side.
//
// Response shape:
// {
//   year, prevYear,
//
//   // All-time totals
//   totalRevenue, totalExpected, totalPending,
//
//   // Current year
//   yearlyRevenue, yearlyExpected, yearlyPending,
//   prevYearRevenue,
//
//   // Short-window revenue (uses paidAt for accuracy)
//   todayCollected, thisWeekCollected, thisMonthCollected,
//
//   // Rates & growth
//   collectionRate,   // % collected vs expected for current year
//   yoyGrowth,        // % growth vs previous year
//
//   // Monthly breakdown Jan–Dec (current year)
//   monthlyBreakdown: [
//     { label, shortLabel, month,
//       expected, collected, pending,
//       paidCount, unpaidCount, collectionRate }
//   ],
//
//   // Per-batch totals (all-time)
//   batchBreakdown: [
//     { batchId, batchName, batchStatus,
//       expected, collected, pending,
//       paidCount, unpaidCount, studentCount, collectionRate }
//   ],
//
//   // Top-level student payment health
//   totalStudents, activeStudents,
//   totalPaidThisMonth, totalUnpaidThisMonth,
// }
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  await connectDB();

  // ── Time anchors ────────────────────────────────────────────────────────
  const now       = new Date();
  const curYear   = now.getFullYear();
  const curMonth  = now.getMonth() + 1; // 1-based
  const prevYear  = curYear - 1;

  const todayStart     = startOfDay(now);
  const weekStart      = startOfWeek(now);
  const monthStart     = new Date(curYear, curMonth - 1, 1, 0, 0, 0, 0);
  const yearStart      = new Date(curYear, 0, 1, 0, 0, 0, 0);
  const prevYearStart  = new Date(prevYear, 0, 1, 0, 0, 0, 0);
  const prevYearEnd    = new Date(curYear, 0, 1, 0, 0, 0, 0); // exclusive

  // ── Load data ───────────────────────────────────────────────────────────
  const [allStudents, allBatches, allFees] = await Promise.all([
    Student.find({}).lean(),
    Batch.find({}).lean(),
    Fee.find({}).lean(),
  ]);

  // Quick lookup maps
  const batchMap    = Object.fromEntries(allBatches.map((b) => [String(b._id), b]));
  const studentMap  = Object.fromEntries(allStudents.map((s) => [String(s._id), s]));

  // Index paid fees: "studentId|month" → paidAt (Date | null)
  // Also build a general status index for quick lookup
  const paidIndex  = {};   // key → paidAt Date (only for Paid records)
  const feeStatus  = {};   // key → "Paid" | "Unpaid"

  for (const f of allFees) {
    const key = `${f.studentId}|${f.month}`;
    feeStatus[key] = f.status;
    if (f.status === "Paid") {
      // Prefer explicit paidAt; fall back to ObjectId creation timestamp for
      // records that existed before the paidAt field was added.
      paidIndex[key] = f.paidAt
        ? new Date(f.paidAt)
        : (f._id?.getTimestamp?.() ?? new Date(parseInt(String(f._id).slice(0, 8), 16) * 1000));
    }
  }

  // ── Aggregation buckets ─────────────────────────────────────────────────
  // monthlyMap[year][month] = { expected, collected, pending, paidCount, unpaidCount }
  const monthlyMap = {};

  // batchAgg[batchId] = { batchId, batchName, batchStatus, expected, collected,
  //                       pending, paidCount, unpaidCount, studentCount }
  const batchAgg = {};

  // All-time totals
  let totalExpected   = 0;
  let totalCollected  = 0;

  // Current-year totals
  let yearlyExpected  = 0;
  let yearlyCollected = 0;

  // Previous-year collected (for YoY)
  let prevYearCollected = 0;

  // Short-window revenue (based on paidAt)
  let todayCollected     = 0;
  let thisWeekCollected  = 0;
  let thisMonthCollected = 0;

  // Current-month paid/unpaid student counts
  let paidThisMonth   = 0;
  let unpaidThisMonth = 0;

  // Helpers to lazily initialise map entries
  const ensureMonth = (y, m) => {
    if (!monthlyMap[y])    monthlyMap[y]    = {};
    if (!monthlyMap[y][m]) monthlyMap[y][m] = {
      expected: 0, collected: 0, pending: 0,
      paidCount: 0, unpaidCount: 0,
      pendingStudents: [], // [{ studentId, name, batchName, feeAmount }]
    };
  };

  const ensureBatch = (bId) => {
    if (!batchAgg[bId]) {
      const b = batchMap[bId];
      batchAgg[bId] = {
        batchId:     bId,
        batchName:   b?.name        || "Unknown Batch",
        batchStatus: b?.status      || "unknown",
        expected:    0,
        collected:   0,
        pending:     0,
        paidCount:   0,
        unpaidCount: 0,
        studentCount: 0,
      };
    }
  };

  // ── Per-student fee expectation loop ────────────────────────────────────
  for (const student of allStudents) {
    const feeAmt = student.decidedFee || 0;
    const bId    = String(student.batchId);

    ensureBatch(bId);
    batchAgg[bId].studentCount++;

    // Determine the last month this student owes fees for.
    //
    // Rule: a student who has LEFT never owes fees for the month they were
    // marked as left or any month after that.  Their last expected month is
    // the month BEFORE their leftDate.
    //
    //   - active → current month (inclusive)
    //   - left   → (leftDate month - 1), capped to never exceed current month
    //
    // Example: student marked left on any day in June 2026
    //   → leftDate = June 2026
    //   → last expected month = May 2026
    //   → June, July, … never appear as expected or pending
    let capYear  = curYear;
    let capMonth = curMonth;

    if (student.status === "left") {
      // Prefer explicit leftDate; fall back to updatedAt for legacy records
      const leaveStamp = student.leftDate
        ? new Date(student.leftDate)
        : student.updatedAt
          ? new Date(student.updatedAt)
          : null;

      if (leaveStamp) {
        // Step back one month from the leave month
        let lYear  = leaveStamp.getFullYear();
        let lMonth = leaveStamp.getMonth() + 1; // 1-based leave month

        // Go one month back → that is the last month the student owes fees
        lMonth -= 1;
        if (lMonth === 0) { lMonth = 12; lYear -= 1; }

        // Never exceed the current month (safety guard)
        if (lYear > curYear || (lYear === curYear && lMonth > curMonth)) {
          capYear  = curYear;
          capMonth = curMonth;
        } else {
          capYear  = lYear;
          capMonth = lMonth;
        }
      } else {
        // No leave date at all — exclude this student entirely from expected
        // (we have no idea when they left, so don't guess)
        capYear  = 0;
        capMonth = 0;
      }
    }

    const expectedMonths = buildExpectedMonths(student.admissionDate, capYear, capMonth);

    for (const monthLabel of expectedMonths) {
      const parsed = parseMonthLabel(monthLabel);
      if (!parsed) continue;
      const { year: mYear, month: mMonth } = parsed;

      ensureMonth(mYear, mMonth);

      const key    = `${student._id}|${monthLabel}`;
      const isPaid = feeStatus[key] === "Paid";

      // ── Expected ──
      monthlyMap[mYear][mMonth].expected += feeAmt;
      batchAgg[bId].expected             += feeAmt;
      totalExpected                       += feeAmt;
      if (mYear === curYear)  yearlyExpected += feeAmt;

      // ── Collected vs Pending ──
      if (isPaid) {
        monthlyMap[mYear][mMonth].collected += feeAmt;
        monthlyMap[mYear][mMonth].paidCount++;
        batchAgg[bId].collected             += feeAmt;
        batchAgg[bId].paidCount++;
        totalCollected                       += feeAmt;

        if (mYear === curYear)  yearlyCollected   += feeAmt;
        if (mYear === prevYear) prevYearCollected  += feeAmt;

        // Short-window: use paidAt timestamp
        const pAt = paidIndex[key];
        if (pAt) {
          if (pAt >= todayStart)     todayCollected     += feeAmt;
          if (pAt >= weekStart)      thisWeekCollected  += feeAmt;
          if (pAt >= monthStart)     thisMonthCollected += feeAmt;
        }

        // Current-month paid/unpaid counts
        if (mYear === curYear && mMonth === curMonth) paidThisMonth++;

      } else {
        monthlyMap[mYear][mMonth].pending += feeAmt;
        monthlyMap[mYear][mMonth].unpaidCount++;
        // Track which student is pending for this month (for the popup list)
        monthlyMap[mYear][mMonth].pendingStudents.push({
          studentId: String(student._id),
          name:      student.name,
          batchName: batchMap[bId]?.name || "Unknown Batch",
          feeAmount: feeAmt,
        });
        batchAgg[bId].pending             += feeAmt;
        batchAgg[bId].unpaidCount++;

        if (mYear === curYear && mMonth === curMonth) unpaidThisMonth++;
      }
    }
  }

  // ── Monthly breakdown: all 12 months of current year ───────────────────
  const monthlyBreakdown = MONTH_NAMES.map((short, i) => {
    const m      = i + 1;
    const bucket = monthlyMap[curYear]?.[m] || {
      expected: 0, collected: 0, pending: 0, paidCount: 0, unpaidCount: 0,
      pendingStudents: [],
    };
    const rate = bucket.expected > 0
      ? Math.round((bucket.collected / bucket.expected) * 100)
      : 0;
    return {
      label:           `${MONTH_FULL[i]} ${curYear}`,
      shortLabel:      short,
      fullLabel:       MONTH_FULL[i],
      month:           m,
      expected:        bucket.expected,
      collected:       bucket.collected,
      pending:         bucket.pending,
      paidCount:       bucket.paidCount,
      unpaidCount:     bucket.unpaidCount,
      collectionRate:  rate,
      // Sorted by feeAmount desc so highest dues appear first in the popup
      pendingStudents: [...(bucket.pendingStudents || [])].sort(
        (a, b) => b.feeAmount - a.feeAmount
      ),
    };
  });

  // ── Batch breakdown: sorted by collected desc ───────────────────────────
  const batchBreakdown = Object.values(batchAgg)
    .map((b) => ({
      ...b,
      collectionRate: b.expected > 0 ? Math.round((b.collected / b.expected) * 100) : 0,
    }))
    .sort((a, b) => b.collected - a.collected);

  // ── Rates & growth ──────────────────────────────────────────────────────
  const collectionRate = yearlyExpected > 0
    ? Math.round((yearlyCollected / yearlyExpected) * 100)
    : 0;

  const yoyGrowth = prevYearCollected > 0
    ? Math.round(((yearlyCollected - prevYearCollected) / prevYearCollected) * 100)
    : (yearlyCollected > 0 ? 100 : 0);

  // ── Student counts ──────────────────────────────────────────────────────
  const totalStudents  = allStudents.length;
  const activeStudents = allStudents.filter((s) => s.status === "active").length;

  // ── Compose response ────────────────────────────────────────────────────
  return withCors(
    NextResponse.json({
      // Meta
      year:     curYear,
      prevYear,

      // All-time
      totalRevenue:  totalCollected,
      totalExpected,
      totalPending:  totalExpected - totalCollected,

      // Current year
      yearlyRevenue:  yearlyCollected,
      yearlyExpected,
      yearlyPending:  yearlyExpected - yearlyCollected,

      // Previous year (for YoY display)
      prevYearRevenue: prevYearCollected,

      // Short-window (paidAt-based)
      todayCollected,
      thisWeekCollected,
      thisMonthCollected,

      // Rates
      collectionRate,
      yoyGrowth,

      // Breakdowns
      monthlyBreakdown,
      batchBreakdown,

      // Student health
      totalStudents,
      activeStudents,
      totalPaidThisMonth:   paidThisMonth,
      totalUnpaidThisMonth: unpaidThisMonth,
    })
  );
}
