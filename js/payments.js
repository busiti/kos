import { MONTHLY_FEE, MONTH_NAMES } from "./constants.js";
import {
  getUnits,
  getTenants,
  getAllPayments,
  groupPaymentsByTenant,
  paymentsToRanges,
  addPayment,
} from "./repo.js";
import {
  toDate,
  startOfDay,
  addMonthsKeepDay,
  endOfMonthlyPeriod,
  endOfNMonthsPeriod,
  isRangeCovered,
  formatRupiah,
  addDays,
  maxEndDate,
  calcLate,
  periodStartForYearMonth,
} from "./utils.js";

function fmtDMY(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const yy = x.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function waLink(phone, text) {
  const p = String(phone || "").replace(/[^\d]/g, "");
  const msg = encodeURIComponent(text);
  return `https://wa.me/${p}?text=${msg}`;
}

function waThanks({ tenantName, unitName }) {
  const title = `*INFO KOS BU SITI*`;
  const sign = `_Admin Kos Bu Siti_`;
  return `${title}\n\nTerima kasih, Bapak/Ibu *${tenantName}* ( ${unitName} ).\nPembayaran sudah kami catat.\n\n${sign}`;
}

function findOldestUnpaidStart(tanggalMulai, mergedRanges) {
  let cursor = startOfDay(tanggalMulai);

  for (let i = 0; i < 240; i++) {
    const s = cursor;
    const e = endOfMonthlyPeriod(s);

    if (!isRangeCovered(s, e, mergedRanges)) return s;
    cursor = addMonthsKeepDay(cursor, 1);
  }

  return startOfDay(tanggalMulai);
}

function lateText(nextDue, today) {
  const { months, days } = calcLate(nextDue, today);
  if (months === 0 && days === 0) return "";

  const parts = [];
  if (months > 0) parts.push(`${months} bln`);
  if (days > 0) parts.push(`${days} hr`);
  return `Telat ${parts.join(" ")}`;
}

function getTenantPaymentsMap(payments) {
  return groupPaymentsByTenant(payments);
}

async function buildSummaryAndTable(tenants, unitById, paymentsByTenant) {
  const today = startOfDay(new Date());
  const year = today.getFullYear();
  const month0 = today.getMonth();

  let paid = 0;
  let income = 0;
  const rows = [];

  document.getElementById("thead").innerHTML = `
    <tr class="bg-white/5 text-[#8aa0c6] text-[10px] uppercase font-bold tracking-widest">
      <th class="p-4 border border-white/10">Penyewa</th>
      <th class="p-4 border border-white/10">Unit</th>
      ${MONTH_NAMES.map((m) => `<th class="p-2 border border-white/10">${m}</th>`).join("")}
      <th class="p-4 border border-white/10">Next Due</th>
    </tr>
  `;

  for (const t of tenants) {
    const u = unitById.get(t.unit_id);
    const payments = paymentsByTenant.get(t.id) || [];
    const merged = paymentsToRanges(payments);

    const startDate = toDate(t.tanggal_mulai);
    const currentStart = periodStartForYearMonth(startDate, year, month0);
    const currentEnd = endOfMonthlyPeriod(currentStart);

    if (isRangeCovered(currentStart, currentEnd, merged)) {
      paid++;

      const row = payments.find(
        (p) => toDate(p.periode_mulai).getTime() === currentStart.getTime()
      );

      if (row) income += row.jumlah || 0;
    }

    const lastEnd = maxEndDate(merged);
    const nextDue = lastEnd ? addDays(lastEnd, 1) : startDate;
    const late = lateText(nextDue, today);

    const cells = [];

    for (let m = 0; m < 12; m++) {
      const pS = periodStartForYearMonth(startDate, year, m);
      const covered = isRangeCovered(pS, endOfMonthlyPeriod(pS), merged);
      const isPast = today.getTime() > pS.getTime();

      let cls = "bg-white/5";
      if (covered) cls = "bg-emerald-500/40";
      else if (isPast) cls = "bg-red-500/30";

      cells.push(`
        <td class="p-1 border border-white/10">
          <div class="w-full h-4 rounded-sm ${cls}"></div>
        </td>
      `);
    }

    rows.push(`
      <tr class="hover:bg-white/5 transition">
        <td class="p-3 border border-white/10 text-left font-bold text-xs">
          ${t.nama}<br/>
          <span class="text-[10px] text-[#8aa0c6] font-normal">${t.no_hp || "—"}</span>
        </td>

        <td class="p-3 border border-white/10 text-xs font-mono">
          ${u?.nama_unit || "—"}
        </td>

        ${cells.join("")}

        <td class="p-3 border border-white/10 text-[10px] text-left">
          ${late ? `<span class="text-red-400 font-bold">${late}</span><br/>` : ""}
          <span class="text-[#8aa0c6] font-mono">${fmtDMY(nextDue)}</span>
        </td>
      </tr>
    `);
  }

  document.getElementById("tbodyRekap").innerHTML =
    rows.join("") ||
    `<tr><td colspan="15" class="p-6 text-[#8aa0c6] italic text-center">Data kosong.</td></tr>`;

  document.getElementById("sumTotal").innerText = tenants.length;
  document.getElementById("sumPaid").innerText = paid;
  document.getElementById("sumUnpaid").innerText = tenants.length - paid;
  document.getElementById("sumIncome").innerText = formatRupiah(income);
}

async function build() {
  const tenantSelect = document.getElementById("tenantSelect");
  const payDate = document.getElementById("payDate");
  const monthsEl = document.getElementById("months");
  const preview = document.getElementById("preview");
  const hint = document.getElementById("hint");
  const after = document.getElementById("after");
  const btnSave = document.getElementById("btnSave");

  const [units, tenants, allPayments] = await Promise.all([
    getUnits(),
    getTenants(),
    getAllPayments(),
  ]);

  const unitById = new Map(units.map((u) => [u.id, u]));
  const paymentsByTenant = getTenantPaymentsMap(allPayments);

  tenantSelect.innerHTML = tenants
    .map((t) => {
      const u = unitById.get(t.unit_id);
      return `<option value="${t.id}">${t.nama} — ${u?.nama_unit || "Unit?"}</option>`;
    })
    .join("");

  payDate.valueAsDate = new Date();

  async function refreshPreview() {
    after.style.display = "none";

    const tenantId = tenantSelect.value;
    const months = Math.max(1, parseInt(monthsEl.value || "1", 10));
    const t = tenants.find((x) => x.id === tenantId);

    if (!t) {
      preview.value = "";
      hint.innerHTML = "Data penyewa tidak ditemukan.";
      return;
    }

    const payments = paymentsByTenant.get(tenantId) || [];
    const merged = paymentsToRanges(payments);
    const oldest = findOldestUnpaidStart(toDate(t.tanggal_mulai), merged);
    const end = endOfNMonthsPeriod(oldest, months);

    preview.value = `${fmtDMY(oldest)} s/d ${fmtDMY(end)} (${months} bln)`;
    hint.innerHTML = `Mencatat tunggakan mulai <b class="text-white">${fmtDMY(oldest)}</b>. Total: <b class="text-emerald-400 text-lg">Rp ${formatRupiah(months * MONTHLY_FEE)}</b>`;
  }

  [tenantSelect, monthsEl, payDate].forEach((el) => {
    el.addEventListener("change", refreshPreview);
    el.addEventListener("input", refreshPreview);
  });

  btnSave.onclick = async () => {
    try {
      btnSave.disabled = true;
      btnSave.innerText = "Menyimpan...";

      const tenantId = tenantSelect.value;
      const months = Math.max(1, parseInt(monthsEl.value || "1", 10));
      const payD = payDate.value ? new Date(payDate.value + "T00:00:00") : new Date();

      const t = tenants.find((x) => x.id === tenantId);
      if (!t) throw new Error("Penyewa tidak ditemukan.");

      const u = unitById.get(t.unit_id);

      const existingPayments = paymentsByTenant.get(tenantId) || [];
      const merged = paymentsToRanges(existingPayments);
      const startDate = toDate(t.tanggal_mulai);

      const pMulai = findOldestUnpaidStart(startDate, merged);
      const pSelesai = endOfNMonthsPeriod(pMulai, months);
      const jumlah = months * MONTHLY_FEE;

      const newId = await addPayment({
        tenant_id: tenantId,
        periode_mulai: pMulai,
        periode_selesai: pSelesai,
        tanggal_bayar: payD,
        jumlah,
      });

      const inserted = {
        id: newId,
        tenant_id: tenantId,
        periode_mulai: pMulai,
        periode_selesai: pSelesai,
        tanggal_bayar: payD,
        jumlah,
      };

      if (!paymentsByTenant.has(tenantId)) paymentsByTenant.set(tenantId, []);
      paymentsByTenant.get(tenantId).push(inserted);
      paymentsByTenant.get(tenantId).sort(
        (a, b) => toDate(a.periode_mulai) - toDate(b.periode_mulai)
      );

      await refreshPreview();
      await buildSummaryAndTable(tenants, unitById, paymentsByTenant);

      const thanksText = waThanks({
        tenantName: t.nama,
        unitName: u?.nama_unit || "",
      });

      after.style.display = "block";
      after.className =
        "mt-6 p-6 bg-emerald-900/20 border border-emerald-500/20 rounded-2xl text-center shadow-inner animate-pulse";
      after.innerHTML = `
        <div class="text-emerald-400 font-bold mb-2">✅ PEMBAYARAN BERHASIL DISIMPAN</div>
        <div class="text-sm text-[#8aa0c6] mb-4">
          Periode: <b>${fmtDMY(pMulai)}</b> - <b>${fmtDMY(pSelesai)}</b> (${months} bln)
        </div>
        <a
          class="inline-block bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-bold transition"
          href="${waLink(t.no_hp, thanksText)}"
          target="_blank"
        >
          Kirim WA Bukti Bayar
        </a>
      `;
    } catch (err) {
      console.error(err);
      after.style.display = "block";
      after.className =
        "mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm text-center";
      after.innerHTML = `Gagal menyimpan pembayaran. ${err?.message || ""}`;
    } finally {
      btnSave.disabled = false;
      btnSave.innerText = "Simpan Pembayaran";
    }
  };

  await refreshPreview();
  await buildSummaryAndTable(tenants, unitById, paymentsByTenant);
}

build();
