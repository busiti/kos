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

// cari bulan tertua yang belum tertutup (berdasarkan coverage)
function findOldestUnpaidStart(tanggalMulai, mergedRanges){
  let cursor = startOfDay(tanggalMulai);

  // safety 240 bulan
  for (let i=0;i<240;i++){
    const s = cursor;
    const e = endOfMonthlyPeriod(s);
    const covered = isRangeCovered(s, e, mergedRanges);
    if (!covered) return s;
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

  // default pay date today
  payDate.valueAsDate = new Date();

  async function refreshPreview(){
    after.style.display = "none";
    after.innerHTML = "";

    const tenantId = tenantSelect.value;
    const months = Math.max(1, parseInt(monthsEl.value||"1",10));
    const t = tenants.find(x=>x.id===tenantId);
    const u = unitById.get(t.unit_id);

    const payments = await getPaymentsByTenant(tenantId);
    const merged = paymentsToRanges(payments);
    const startDate = toDate(t.tanggal_mulai);

    const oldest = findOldestUnpaidStart(startDate, merged);
    const end = endOfNMonthsPeriod(oldest, months);

    preview.value = `${fmtDMY(oldest)} s/d ${fmtDMY(end)} (${months} bln)`;
    hint.innerHTML = `Akan menutup tunggakan tertua mulai <b>${fmtDMY(oldest)}</b>. Total: <b>Rp ${formatRupiah(months*MONTHLY_FEE)}</b> (${u?.nama_unit || ""})`;
  }

  tenantSelect.addEventListener("change", refreshPreview);
  monthsEl.addEventListener("input", refreshPreview);
  payDate.addEventListener("change", refreshPreview);

  document.getElementById("btnSave").addEventListener("click", async ()=>{
    const tenantId = tenantSelect.value;
    const months = Math.max(1, parseInt(monthsEl.value||"1",10));
    const payD = payDate.value ? new Date(payDate.value + "T00:00:00") : new Date();

    const t = tenants.find(x=>x.id===tenantId);
    const u = unitById.get(t.unit_id);

    // reload fresh
    const payments = await getPaymentsByTenant(tenantId);
    const merged = paymentsToRanges(payments);
    const startDate = toDate(t.tanggal_mulai);

    const periodeMulai = findOldestUnpaidStart(startDate, merged);
    const periodeSelesai = endOfNMonthsPeriod(periodeMulai, months);
    const jumlah = months * MONTHLY_FEE;

    await addPayment({
      tenant_id: tenantId,
      periode_mulai: periodeMulai,
      periode_selesai: periodeSelesai,
      tanggal_bayar: payD,
      jumlah
    });

    await refreshPreview();

    const thanksText = waThanks({ tenantName: t.nama, unitName: u?.nama_unit || "" });

    after.style.display = "block";
    after.innerHTML = `
      <b>✅ Pembayaran tersimpan.</b><br/>
      Periode: <b>${fmtDMY(periodeMulai)}</b> s/d <b>${fmtDMY(periodeSelesai)}</b><br/>
      Jumlah: <b>Rp ${formatRupiah(jumlah)}</b><br/><br/>
      <a class="badge" style="padding:7px 10px" href="${waLink(t.no_hp, thanksText)}" target="_blank">Kirim WA: Terima kasih pembayaran</a>
    `;
  });

  await refreshPreview();
}

build();