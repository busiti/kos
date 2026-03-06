import { getUnits, getTenants, getAllPayments, groupPaymentsByTenant, paymentsToRanges } from "./repo.js";
import { toDate, startOfDay, addDays, calcLate, maxEndDate } from "./utils.js";

function waLink(phone, text) {
  const p = String(phone || "").replace(/[^\d]/g, "");
  const msg = encodeURIComponent(text);
  return `https://wa.me/${p}?text=${msg}`;
}

function fmtDMY(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const yy = x.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function waTemplate({ tipe, tenantName, unitName, dueDMY }) {
  const title = `*INFO KOS BU SITI*`;
  const sign = `_Admin Kos Bu Siti_`;

  if (tipe === "H-3") {
    return `${title}\n\nHalo Bapak/Ibu *${tenantName}* ( ${unitName} )\nPengingat: jatuh tempo pembayaran kos pada *${dueDMY}* (H-3).\nMohon disiapkan ya.\n\n${sign}`;
  }
  if (tipe === "H-1") {
    return `${title}\n\nHalo Bapak/Ibu *${tenantName}* ( ${unitName} )\nPengingat: besok jatuh tempo pembayaran kos pada *${dueDMY}* (H-1).\nTerima kasih.\n\n${sign}`;
  }
  if (tipe === "H+2") {
    return `${title}\n\nHalo Bapak/Ibu *${tenantName}* ( ${unitName} )\nInfo: pembayaran kos dengan jatuh tempo *${dueDMY}* sudah melewati H+2.\nMohon konfirmasi / dilakukan pembayaran ya.\n\n${sign}`;
  }

  return `${title}\n\nHalo Bapak/Ibu *${tenantName}* ( ${unitName} )\n\n${sign}`;
}

function statusText(nextDue, today) {
  const { months, days } = calcLate(nextDue, today);
  if (months === 0 && days === 0) {
    return `<span class="bg-blue-500/10 text-blue-400 px-2 py-1 rounded-md text-[10px] font-bold uppercase">Belum jatuh tempo</span>`;
  }

  const parts = [];
  if (months > 0) parts.push(`${months} bln`);
  if (days > 0) parts.push(`${days} hr`);

  return `<span class="bg-red-500/10 text-red-400 px-2 py-1 rounded-md text-[10px] font-bold uppercase">Telat ${parts.join(" ")}</span>`;
}

function renderBucket(arr, elId, tipe) {
  const el = document.getElementById(elId);

  if (!arr.length) {
    el.innerHTML = `<div class="text-[#8aa0c6] text-xs italic">Tidak ada antrean.</div>`;
    return;
  }

  el.innerHTML = arr
    .map((x) => {
      const dueDMY = fmtDMY(x.due);
      const text = waTemplate({
        tipe,
        tenantName: x.tenantName,
        unitName: x.unitName,
        dueDMY,
      });

      return `
        <div class="flex justify-between items-center py-2 border-b border-white/5 last:border-0 group">
          <div>
            <div class="text-xs font-bold">#${x.unitName} — ${x.tenantName}</div>
            <div class="text-[10px] text-[#8aa0c6]">Jatuh tempo: ${dueDMY}</div>
          </div>
          <a
            class="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold hover:bg-emerald-500 hover:text-white transition"
            href="${waLink(x.phone, text)}"
            target="_blank"
          >WA</a>
        </div>
      `;
    })
    .join("");
}

async function build() {
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-[#8aa0c6] italic">Memuat data...</td></tr>`;

  const [units, tenants, payments] = await Promise.all([
    getUnits(),
    getTenants(),
    getAllPayments(),
  ]);

  const paymentsByTenant = groupPaymentsByTenant(payments);
  const tenantsByUnit = new Map(tenants.map((t) => [t.unit_id, t]));
  const today = startOfDay(new Date());

  const h3 = [];
  const h1 = [];
  const h2 = [];
  const rows = [];

  for (const u of units) {
    const t = tenantsByUnit.get(u.id);

    if (!t) {
      rows.push(`
        <tr class="hover:bg-white/5 transition">
          <td class="p-4 border-b border-white/5 font-bold">${u.nama_unit}</td>
          <td class="p-4 border-b border-white/5 text-[#8aa0c6] italic">Kosong</td>
          <td class="p-4 border-b border-white/5 text-[#8aa0c6]">—</td>
          <td class="p-4 border-b border-white/5 text-[#8aa0c6]">—</td>
          <td class="p-4 border-b border-white/5">—</td>
          <td class="p-4 border-b border-white/5">—</td>
        </tr>
      `);
      continue;
    }

    const tenantPayments = paymentsByTenant.get(t.id) || [];
    const merged = paymentsToRanges(tenantPayments);
    const lastEnd = maxEndDate(merged);
    const nextDue = lastEnd ? addDays(lastEnd, 1) : toDate(t.tanggal_mulai);
    const dueDMY = fmtDMY(nextDue);

    const dUntil = Math.round((startOfDay(nextDue) - today) / 86400000);

    if (dUntil === 3) {
      h3.push({ tenantName: t.nama, unitName: u.nama_unit, due: nextDue, phone: t.no_hp });
    }
    if (dUntil === 1) {
      h1.push({ tenantName: t.nama, unitName: u.nama_unit, due: nextDue, phone: t.no_hp });
    }
    if (dUntil === -2) {
      h2.push({ tenantName: t.nama, unitName: u.nama_unit, due: nextDue, phone: t.no_hp });
    }

    const btns = [];
    const btnClass =
      "px-3 py-1 bg-white/5 border border-white/10 rounded-md text-[10px] font-bold hover:bg-emerald-500/20 hover:text-emerald-400 transition";

    if (dUntil === 3) {
      const txt = waTemplate({ tipe: "H-3", tenantName: t.nama, unitName: u.nama_unit, dueDMY });
      btns.push(`<a class="${btnClass}" href="${waLink(t.no_hp, txt)}" target="_blank">H-3</a>`);
    }
    if (dUntil === 1) {
      const txt = waTemplate({ tipe: "H-1", tenantName: t.nama, unitName: u.nama_unit, dueDMY });
      btns.push(`<a class="${btnClass}" href="${waLink(t.no_hp, txt)}" target="_blank">H-1</a>`);
    }
    if (dUntil === -2) {
      const txt = waTemplate({ tipe: "H+2", tenantName: t.nama, unitName: u.nama_unit, dueDMY });
      btns.push(`<a class="${btnClass}" href="${waLink(t.no_hp, txt)}" target="_blank">H+2</a>`);
    }

    const txtDefault = waTemplate({ tipe: "DEFAULT", tenantName: t.nama, unitName: u.nama_unit, dueDMY });
    btns.push(`<a class="${btnClass}" href="${waLink(t.no_hp, txtDefault)}" target="_blank">WA</a>`);

    rows.push(`
      <tr class="hover:bg-white/5 transition">
        <td class="p-4 border-b border-white/5 font-bold">${u.nama_unit}</td>
        <td class="p-4 border-b border-white/5">${t.nama}</td>
        <td class="p-4 border-b border-white/5 text-[#8aa0c6]">${t.no_hp || "—"}</td>
        <td class="p-4 border-b border-white/5 font-mono text-xs">${dueDMY}</td>
        <td class="p-4 border-b border-white/5">${statusText(nextDue, today)}</td>
        <td class="p-4 border-b border-white/5"><div class="flex flex-wrap gap-2 justify-center">${btns.join("")}</div></td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join("") || `<tr><td colspan="6" class="p-6 text-[#8aa0c6] italic">Tidak ada data.</td></tr>`;

  renderBucket(h3, "listH3", "H-3");
  renderBucket(h1, "listH1", "H-1");
  renderBucket(h2, "listH2", "H+2");
}

document.getElementById("btnReload").addEventListener("click", build);
build();
