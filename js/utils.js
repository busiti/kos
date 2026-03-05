import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ---------- Date helpers ----------
export function toDate(v){
  if (!v) return null;
  // Firestore Timestamp
  if (typeof v === "object" && typeof v.toDate === "function") return v.toDate();
  // ISO string / yyyy-mm-dd
  if (typeof v === "string") return new Date(v + (v.length === 10 ? "T00:00:00" : ""));
  // JS Date
  if (v instanceof Date) return v;
  return null;
}

export function toISODate(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth()+1).padStart(2,"0");
  const dd = String(x.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}

export function startOfDay(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}

export function daysDiff(a,b){
  // b - a in days
  const A = startOfDay(a).getTime();
  const B = startOfDay(b).getTime();
  return Math.round((B - A) / 86400000);
}

export function clampDay(year, monthIndex0, day){
  // monthIndex0: 0..11
  const last = new Date(year, monthIndex0+1, 0).getDate();
  return Math.min(day, last);
}

export function addMonthsKeepDay(date, months){
  const d = startOfDay(date);
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();

  const targetMonth = m + months;
  const ty = y + Math.floor(targetMonth / 12);
  const tm = ((targetMonth % 12) + 12) % 12;

  const cd = clampDay(ty, tm, day);
  return new Date(ty, tm, cd);
}

export function addDays(date, days){
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function endOfMonthlyPeriod(periodStart){
  // end = (start + 1 month) - 1 day
  return addDays(addMonthsKeepDay(periodStart, 1), -1);
}

export function endOfNMonthsPeriod(periodStart, nMonths){
  return addDays(addMonthsKeepDay(periodStart, nMonths), -1);
}

export function monthKey(d){
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`;
}

export function tsFromDate(d){
  return Timestamp.fromDate(startOfDay(d));
}

export function formatRupiah(n){
  return new Intl.NumberFormat("id-ID").format(n);
}

// ---------- Coverage helpers ----------
export function rangesMerge(ranges){
  // ranges: [{start:Date,end:Date}]
  const sorted = ranges
    .filter(r => r.start && r.end)
    .map(r => ({start:startOfDay(r.start), end:startOfDay(r.end)}))
    .sort((a,b) => a.start - b.start);

  const out = [];
  for (const r of sorted){
    if (!out.length){ out.push(r); continue; }
    const last = out[out.length-1];
    // if overlap/adjacent
    if (r.start.getTime() <= addDays(last.end, 1).getTime()){
      last.end = new Date(Math.max(last.end.getTime(), r.end.getTime()));
    }else out.push(r);
  }
  return out;
}

export function isDateCoveredByRanges(dateStart, dateEnd, mergedRanges){
  const s = startOfDay(dateStart).getTime();
  const e = startOfDay(dateEnd).getTime();
  return mergedRanges.some(r => r.start.getTime() <= s && r.end.getTime() >= e);
}

export function maxEndDate(mergedRanges){
  if (!mergedRanges.length) return null;
  let m = mergedRanges[0].end;
  for (const r of mergedRanges){
    if (r.end.getTime() > m.getTime()) m = r.end;
  }
  return m;
}

// ---------- Late calculation (bulan + hari) ----------
export function calcLate(nextDueDate, todayDate){
  const nextDue = startOfDay(nextDueDate);
  const today = startOfDay(todayDate);

  if (today.getTime() <= nextDue.getTime()){
    return { months:0, days:0 };
  }

  // Hitung bulan penuh yang terlewati
  let months = 0;
  let cursor = nextDue;

  while (true){
    const next = addMonthsKeepDay(cursor, 1);
    if (next.getTime() <= today.getTime()){
      months++;
      cursor = next;
    } else break;
  }

  // Sisa hari setelah bulan dihitung
  const days = daysDiff(cursor, today);

  return { months, days };
}
export function isRangeCovered(start, end, ranges){

const s = startOfDay(start).getTime();
const e = startOfDay(end).getTime();

return ranges.some(r => {

const rs = startOfDay(r.start).getTime();
const re = startOfDay(r.end).getTime();

return rs <= s && re >= e;

});

}
export function periodStartForYearMonth(tenantStartDate, year, month0){

  const day = startOfDay(tenantStartDate).getDate();

  const cd = clampDay(year, month0, day);

  return new Date(year, month0, cd);

}
