import { MONTH_NAMES } from "./constants.js";
import { getUnits, getTenants, getPaymentsByTenant, paymentsToRanges, updateTenant, addTenant } from "./repo.js";
import {
  toDate, startOfDay, endOfMonthlyPeriod, isRangeCovered,
  addDays, maxEndDate, calcLate, toISODate, periodStartForYearMonth,
  formatRupiah
} from "./utils.js";

function fmtDMY(d){
  const x = new Date(d); x.setHours(0,0,0,0);
  const dd = String(x.getDate()).padStart(2,"0");
  const mm = String(x.getMonth()+1).padStart(2,"0");
  const yy = x.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function lateText(nextDue, today){
  const { months, days } = calcLate(nextDue, today);
  if (months === 0 && days === 0) return "";
  const parts = [];
  if (months > 0) parts.push(`${months} bulan`);
  if (days > 0) parts.push(`${days} hari`);
  return `Telat ${parts.join(" ")}`;
}

let state = {
  units: [],
  tenants: [],
  unitById: new Map(),
  paymentsCache: new Map(),
};

async function getMergedRanges(tenantId){
  if (state.paymentsCache.has(tenantId)) return state.paymentsCache.get(tenantId);
  const payments = await getPaymentsByTenant(tenantId);
  const merged = paymentsToRanges(payments);
  state.paymentsCache.set(tenantId, merged);
  return merged;
}

/* =========================
   RINGKASAN BULAN INI
========================= */
async function buildSummary(tenants){
  const today = new Date();
  const year = today.getFullYear();
  const month0 = today.getMonth();

  let total = tenants.length;
  let paid = 0;
  let income = 0;

  for (const t of tenants){
    const startDate = toDate(t.tanggal_mulai);
    const merged = await getMergedRanges(t.id);

    const pStart = periodStartForYearMonth(startDate, year, month0);
    const pEnd = endOfMonthlyPeriod(pStart);

    const covered = isRangeCovered(pStart, pEnd, merged);

    if (covered){
      paid++;

      const payments = await getPaymentsByTenant(t.id);
      const payThisMonth = payments.find(p =>
        toDate(p.periode_mulai).getTime() === pStart.getTime()
      );

      if (payThisMonth){
        income += payThisMonth.jumlah || 0;
      }
    }
  }

  const unpaid = total - paid;

  document.getElementById("sumTotal").innerText = total;
  document.getElementById("sumPaid").innerText = paid;
  document.getElementById("sumUnpaid").innerText = unpaid;
  document.getElementById("sumIncome").innerText = formatRupiah(income);
}

/* =========================
   BUILD TABEL REKAP
========================= */
async function build(){
  state.paymentsCache.clear();

  const [units, tenants] = await Promise.all([getUnits(), getTenants()]);
  state.units = units;
  state.tenants = tenants;
  state.unitById = new Map(units.map(u=>[u.id,u]));

  const year = new Date().getFullYear();
  const today = startOfDay(new Date());

  // dropdown unit kosong (tambah penyewa)
  const addUnit = document.getElementById("addUnit");
  const usedUnitIds = new Set(tenants.map(t=>t.unit_id));
  const availableUnits = units.filter(u => !usedUnitIds.has(u.id));

  addUnit.innerHTML = availableUnits.length
    ? availableUnits.map(u=>`<option value="${u.id}">${u.nama_unit}</option>`).join("")
    : `<option value="">Semua unit terisi</option>`;

  // header tabel
  const thead = document.getElementById("thead");
  thead.innerHTML = `
    <tr>
      <th>Penyewa</th>
      <th>Unit</th>
      ${MONTH_NAMES.map(m=>`<th>${m}</th>`).join("")}
      <th>Tunggakan</th>
      <th>Aksi</th>
    </tr>
  `;

  const tbody = document.getElementById("tbody");
  tbody.innerHTML = `<tr><td colspan="16" class="muted">Memuat...</td></tr>`;

  const rows = [];

  for (const t of tenants){
    const u = state.unitById.get(t.unit_id);
    const startDate = toDate(t.tanggal_mulai);
    const merged = await getMergedRanges(t.id);

    const lastEnd = maxEndDate(merged);
    const nextDue = lastEnd ? addDays(lastEnd, 1) : startDate;
    const late = lateText(nextDue, today);

    const cells = [];

    for (let m=0;m<12;m++){
      const periodStart = periodStartForYearMonth(startDate, year, m);
      const periodEnd = endOfMonthlyPeriod(periodStart);

      const covered = isRangeCovered(periodStart, periodEnd, merged);

      const isPastDue = today.getTime() > startOfDay(periodStart).getTime();

      let cls = "cell-empty";
      if (covered) cls = "cell-ok";
      else if (isPastDue) cls = "cell-bad";

      cells.push(`<td class="${cls}"></td>`);
    }

    rows.push(`
      <tr>
        <td style="text-align:left">
          <b>${t.nama}</b><br/>
          <span class="muted">${t.no_hp || "—"}</span>
        </td>
        <td style="text-align:left">${u?.nama_unit || "—"}</td>
        ${cells.join("")}
        <td style="text-align:left">
          ${late ? `<span class="badge">${late}</span><br/>` : ""}
          <span class="muted">Next due: ${fmtDMY(nextDue)}</span>
        </td>
        <td>
          <button class="small" data-edit="${t.id}">Edit</button>
        </td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join("") || `<tr><td colspan="16" class="muted">Tidak ada data.</td></tr>`;

  // jalankan ringkasan
  await buildSummary(tenants);

  // bind edit
  document.querySelectorAll("button[data-edit]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-edit");
      openEditModal(id);
    });
  });
}

/* =========================
   MODAL EDIT TENANT
========================= */

const backdrop = document.getElementById("modalBackdrop");
document.getElementById("btnClose").addEventListener("click", ()=> backdrop.classList.remove("show"));
backdrop.addEventListener("click", (e)=>{ if (e.target === backdrop) backdrop.classList.remove("show"); });

let editingTenantId = null;

function openEditModal(tenantId){
  editingTenantId = tenantId;
  const t = state.tenants.find(x=>x.id===tenantId);

  const mUnit = document.getElementById("mUnit");
  const usedUnitIds = new Set(state.tenants.filter(x=>x.id!==tenantId).map(x=>x.unit_id));

  mUnit.innerHTML = state.units.map(u=>{
    const disabled = usedUnitIds.has(u.id) ? "disabled" : "";
    const selected = (u.id === t.unit_id) ? "selected" : "";
    return `<option value="${u.id}" ${selected} ${disabled}>${u.nama_unit}${disabled ? " (terisi)" : ""}</option>`;
  }).join("");

  document.getElementById("mNama").value = t.nama || "";
  document.getElementById("mHp").value = t.no_hp || "";
  document.getElementById("mMulai").value = toISODate(toDate(t.tanggal_mulai));
  document.getElementById("mInfo").textContent = `ID: ${tenantId}`;

  backdrop.classList.add("show");
}

document.getElementById("btnSaveTenant").addEventListener("click", async ()=>{
  if (!editingTenantId) return;

  const nama = document.getElementById("mNama").value.trim();
  const no_hp = document.getElementById("mHp").value.trim();
  const unit_id = document.getElementById("mUnit").value;
  const tanggal_mulai = document.getElementById("mMulai").value;

  if (!nama || !unit_id || !tanggal_mulai){
    alert("Nama, Unit, dan Tanggal Mulai wajib diisi.");
    return;
  }

  await updateTenant(editingTenantId, { nama, no_hp, unit_id, tanggal_mulai });
  backdrop.classList.remove("show");
  await build();
});

/* =========================
   TAMBAH TENANT
========================= */

document.getElementById("btnAddTenant").addEventListener("click", async ()=>{
  const nama = document.getElementById("addNama").value.trim();
  const no_hp = document.getElementById("addHp").value.trim();
  const unit_id = document.getElementById("addUnit").value;
  const tanggal_mulai = document.getElementById("addMulai").value;
  const info = document.getElementById("addInfo");

  if (!nama || !unit_id || !tanggal_mulai){
    alert("Nama, Unit, dan Tanggal Mulai wajib diisi.");
    return;
  }

  const usedUnitIds = new Set(state.tenants.map(t=>t.unit_id));
  if (usedUnitIds.has(unit_id)){
    alert("Unit ini sudah terisi. Pilih unit lain.");
    return;
  }

  await addTenant({ nama, no_hp, unit_id, tanggal_mulai });

  info.innerHTML = `<b>✅ Penyewa berhasil ditambahkan.</b>`;
  document.getElementById("addNama").value = "";
  document.getElementById("addHp").value = "";
  document.getElementById("addMulai").value = "";

  await build();
});

document.getElementById("btnReload").addEventListener("click", build);

build();