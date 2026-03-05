import { MONTHLY_FEE } from "./constants.js";
import { getUnits, getTenants, getPaymentsByTenant, paymentsToRanges, addPayment } from "./repo.js";
import {
  toDate, startOfDay, addMonthsKeepDay, endOfMonthlyPeriod,
  endOfNMonthsPeriod, isRangeCovered, formatRupiah
} from "./utils.js";

function fmtDMY(d){
  const x = new Date(d); x.setHours(0,0,0,0);
  const dd = String(x.getDate()).padStart(2,"0");
  const mm = String(x.getMonth()+1).padStart(2,"0");
  const yy = x.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function waLink(phone, text){
  const p = String(phone||"").replace(/[^\d]/g,"");
  const msg = encodeURIComponent(text);
  return `https://wa.me/${p}?text=${msg}`;
}

function waThanks({tenantName, unitName}){
  const title = `*INFO KOS BU SITI*`;
  const sign = `_Admin Kos Bu Siti_`;
  return `${title}\n\nTerima kasih, Bapak/Ibu *${tenantName}* ( ${unitName} ).\nPembayaran sudah kami catat.\n\n${sign}`;
}

function findOldestUnpaidStart(tanggalMulai, mergedRanges){
  let cursor = startOfDay(tanggalMulai);
  for (let i=0;i<240;i++){
    const s = cursor;
    const e = endOfMonthlyPeriod(s);
    if (!isRangeCovered(s, e, mergedRanges)) return s;
    cursor = addMonthsKeepDay(cursor, 1);
  }
  return startOfDay(tanggalMulai);
}

async function build(){
  const tenantSelect = document.getElementById("tenantSelect");
  const payDate = document.getElementById("payDate");
  const monthsEl = document.getElementById("months");
  const preview = document.getElementById("preview");
  const hint = document.getElementById("hint");
  const after = document.getElementById("after");

  const [units, tenants] = await Promise.all([getUnits(), getTenants()]);
  const unitById = new Map(units.map(u => [u.id, u]));

  tenantSelect.innerHTML = tenants.map(t=>{
    const u = unitById.get(t.unit_id);
    return `<option value="${t.id}">${t.nama} — ${u?.nama_unit || "Unit?"}</option>`;
  }).join("");

  payDate.valueAsDate = new Date();

  async function refreshPreview(){
    after.style.display = "none";
    const tenantId = tenantSelect.value;
    const months = Math.max(1, parseInt(monthsEl.value||"1",10));
    const t = tenants.find(x=>x.id===tenantId);
    const u = unitById.get(t.unit_id);

    const payments = await getPaymentsByTenant(tenantId);
    const merged = paymentsToRanges(payments);
    const oldest = findOldestUnpaidStart(toDate(t.tanggal_mulai), merged);
    const end = endOfNMonthsPeriod(oldest, months);

    preview.value = `${fmtDMY(oldest)} s/d ${fmtDMY(end)} (${months} bln)`;
    hint.innerHTML = `Mencatat tunggakan mulai <b class="text-white">${fmtDMY(oldest)}</b>. Total: <b class="text-emerald-400 text-lg">Rp ${formatRupiah(months*MONTHLY_FEE)}</b>`;
  }

  [tenantSelect, monthsEl, payDate].forEach(el => el.addEventListener("change", refreshPreview));

  document.getElementById("btnSave").onclick = async ()=>{
    const btn = document.getElementById("btnSave");
    btn.disabled = true; btn.innerText = "Menyimpan...";

    const tenantId = tenantSelect.value;
    const months = Math.max(1, parseInt(monthsEl.value||"1",10));
    const payD = payDate.value ? new Date(payDate.value + "T00:00:00") : new Date();

    const t = tenants.find(x=>x.id===tenantId);
    const u = unitById.get(t.unit_id);

    const payments = await getPaymentsByTenant(tenantId);
    const merged = paymentsToRanges(payments);
    const startDate = toDate(t.tanggal_mulai);

    const pMulai = findOldestUnpaidStart(startDate, merged);
    const pSelesai = endOfNMonthsPeriod(pMulai, months);
    const jumlah = months * MONTHLY_FEE;

    await addPayment({ tenant_id: tenantId, periode_mulai: pMulai, periode_selesai: pSelesai, tanggal_bayar: payD, jumlah });
    
    await refreshPreview();
    const thanksText = waThanks({ tenantName: t.nama, unitName: u?.nama_unit || "" });

    after.style.display = "block";
    after.className = "mt-6 p-6 bg-emerald-900/20 border border-emerald-500/20 rounded-2xl text-center shadow-inner animate-pulse";
    after.innerHTML = `
      <div class="text-emerald-400 font-bold mb-2">✅ PEMBAYARAN BERHASIL DISIMPAN</div>
      <div class="text-sm text-[#8aa0c6] mb-4">Periode: <b>${fmtDMY(pMulai)}</b> - <b>${fmtDMY(pSelesai)}</b> (${months} bln)</div>
      <a class="inline-block bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-2 rounded-xl text-sm font-bold transition" href="${waLink(t.no_hp, thanksText)}" target="_blank">
        Kirim WA Bukti Bayar
      </a>
    `;

    btn.disabled = false; btn.innerText = "Simpan Pembayaran";
  };

  await refreshPreview();
}

build();
