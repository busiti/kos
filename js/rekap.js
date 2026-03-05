import { MONTH_NAMES } from "./constants.js";
import { getUnits, getTenants, getPaymentsByTenant, paymentsToRanges, updateTenant, addTenant } from "./repo.js";
import { toDate, startOfDay, endOfMonthlyPeriod, isRangeCovered, addDays, maxEndDate, calcLate, toISODate, periodStartForYearMonth, formatRupiah } from "./utils.js";

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
  if (months > 0) parts.push(`${months} bln`);
  if (days > 0) parts.push(`${days} hr`);
  return `Telat ${parts.join(" ")}`;
}

let state = { units: [], tenants: [], unitById: new Map(), paymentsCache: new Map() };

async function getMergedRanges(tenantId){
  if (state.paymentsCache.has(tenantId)) return state.paymentsCache.get(tenantId);
  const p = await getPaymentsByTenant(tenantId);
  const m = paymentsToRanges(p);
  state.paymentsCache.set(tenantId, m);
  return m;
}

async function buildSummary(tenants){
  const today = new Date(); const year = today.getFullYear(); const month0 = today.getMonth();
  let paid = 0; let income = 0;

  for (const t of tenants){
    const startDate = toDate(t.tanggal_mulai);
    const merged = await getMergedRanges(t.id);
    const pStart = periodStartForYearMonth(startDate, year, month0);
    const pEnd = endOfMonthlyPeriod(pStart);
    if (isRangeCovered(pStart, pEnd, merged)){
      paid++;
      const payments = await getPaymentsByTenant(t.id);
      const row = payments.find(p => toDate(p.periode_mulai).getTime() === pStart.getTime());
      if (row) income += row.jumlah || 0;
    }
  }

  document.getElementById("sumTotal").innerText = tenants.length;
  document.getElementById("sumPaid").innerText = paid;
  document.getElementById("sumUnpaid").innerText = tenants.length - paid;
  document.getElementById("sumIncome").innerText = formatRupiah(income);
}

async function build(){
  state.paymentsCache.clear();
  const [units, tenants] = await Promise.all([getUnits(), getTenants()]);
  state.units = units; state.tenants = tenants; state.unitById = new Map(units.map(u=>[u.id,u]));

  const year = new Date().getFullYear();
  const today = startOfDay(new Date());

  // Dropdown unit kosong
  const usedIds = new Set(tenants.map(t=>t.unit_id));
  const avail = units.filter(u => !usedIds.has(u.id));
  document.getElementById("addUnit").innerHTML = avail.length ? avail.map(u=>`<option value="${u.id}">${u.nama_unit}</option>`).join("") : `<option value="">Penuh</option>`;

  // Header
  document.getElementById("thead").innerHTML = `
    <tr class="bg-white/5 text-[#8aa0c6] text-[10px] uppercase font-bold tracking-widest">
      <th class="p-4 border border-white/10">Penyewa</th>
      <th class="p-4 border border-white/10">Unit</th>
      ${MONTH_NAMES.map(m=>`<th class="p-2 border border-white/10">${m}</th>`).join("")}
      <th class="p-4 border border-white/10">Next Due</th>
      <th class="p-4 border border-white/10">Aksi</th>
    </tr>
  `;

  const rows = [];
  for (const t of tenants){
    const u = state.unitById.get(t.unit_id);
    const merged = await getMergedRanges(t.id);
    const lastEnd = maxEndDate(merged);
    const nextDue = lastEnd ? addDays(lastEnd, 1) : toDate(t.tanggal_mulai);
    const late = lateText(nextDue, today);

    const cells = [];
    for (let m=0; m<12; m++){
      const pS = periodStartForYearMonth(toDate(t.tanggal_mulai), year, m);
      const covered = isRangeCovered(pS, endOfMonthlyPeriod(pS), merged);
      const isPast = today.getTime() > pS.getTime();
      
      let cls = "bg-white/5"; 
      if (covered) cls = "bg-emerald-500/40"; 
      else if (isPast) cls = "bg-red-500/30";

      cells.push(`<td class="p-1 border border-white/10"><div class="w-full h-4 rounded-sm ${cls}"></div></td>`);
    }

    rows.push(`
      <tr class="hover:bg-white/5 transition">
        <td class="p-3 border border-white/10 text-left font-bold text-xs">${t.nama}<br/><span class="text-[10px] text-[#8aa0c6] font-normal">${t.no_hp || "—"}</span></td>
        <td class="p-3 border border-white/10 text-xs font-mono">${u?.nama_unit || "—"}</td>
        ${cells.join("")}
        <td class="p-3 border border-white/10 text-[10px] text-left">
          ${late ? `<span class="text-red-400 font-bold">${late}</span><br/>` : ""}
          <span class="text-[#8aa0c6] font-mono">${fmtDMY(nextDue)}</span>
        </td>
        <td class="p-3 border border-white/10">
          <button class="bg-white/5 border border-white/10 px-3 py-1 rounded text-[10px] font-bold hover:bg-emerald-500/20 transition" data-edit="${t.id}">Edit</button>
        </td>
      </tr>
    `);
  }

  document.getElementById("tbody").innerHTML = rows.join("") || `<tr><td colspan="16" class="p-6 text-[#8aa0c6] italic text-center">Data kosong.</td></tr>`;
  await buildSummary(tenants);

  document.querySelectorAll("button[data-edit]").forEach(btn => btn.onclick = () => openEditModal(btn.getAttribute("data-edit")));
}

/* MODAL LOGIC */
const backdrop = document.getElementById("modalBackdrop");
const closeModal = () => { backdrop.classList.add("hidden"); backdrop.classList.remove("flex"); };
document.getElementById("btnClose").onclick = closeModal;
backdrop.onclick = (e) => { if(e.target === backdrop) closeModal(); };

let editingId = null;
function openEditModal(id){
  editingId = id;
  const t = state.tenants.find(x=>x.id===id);
  const used = new Set(state.tenants.filter(x=>x.id!==id).map(x=>x.unit_id));
  
  document.getElementById("mUnit").innerHTML = state.units.map(u => {
    const dis = used.has(u.id) ? "disabled" : "";
    const sel = u.id === t.unit_id ? "selected" : "";
    return `<option value="${u.id}" ${sel} ${dis}>${u.nama_unit} ${dis ? "(isi)" : ""}</option>`;
  }).join("");

  document.getElementById("mNama").value = t.nama;
  document.getElementById("mHp").value = t.no_hp;
  document.getElementById("mMulai").value = toISODate(toDate(t.tanggal_mulai));
  document.getElementById("mInfo").textContent = `UID: ${id}`;
  
  backdrop.classList.remove("hidden");
  backdrop.classList.add("flex");
}

document.getElementById("btnSaveTenant").onclick = async () => {
  const payload = { 
    nama: document.getElementById("mNama").value.trim(), 
    no_hp: document.getElementById("mHp").value.trim(), 
    unit_id: document.getElementById("mUnit").value, 
    tanggal_mulai: document.getElementById("mMulai").value 
  };
  if(!payload.nama || !payload.unit_id || !payload.tanggal_mulai) return alert("Data wajib diisi!");
  await updateTenant(editingId, payload);
  closeModal();
  await build();
};

document.getElementById("btnAddTenant").onclick = async () => {
  const payload = { 
    nama: document.getElementById("addNama").value.trim(), 
    no_hp: document.getElementById("addHp").value.trim(), 
    unit_id: document.getElementById("addUnit").value, 
    tanggal_mulai: document.getElementById("addMulai").value 
  };
  if(!payload.nama || !payload.unit_id || !payload.tanggal_mulai) return alert("Data wajib diisi!");
  await addTenant(payload);
  document.getElementById("addNama").value = ""; 
  document.getElementById("addHp").value = "";
  document.getElementById("addMulai").value = "";
  await build();
};

document.getElementById("btnReload").onclick = build;
build();
