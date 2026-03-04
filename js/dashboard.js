import { getUnits, getTenants, getPaymentsByTenant, paymentsToRanges } from "./repo.js";
import { toDate, startOfDay, addDays, calcLate, maxEndDate } from "./utils.js";

function waLink(phone, text){
  const p = String(phone||"").replace(/[^\d]/g,"");
  const msg = encodeURIComponent(text);
  return `https://wa.me/${p}?text=${msg}`;
}

function fmtDMY(d){
  const x = new Date(d); x.setHours(0,0,0,0);
  const dd = String(x.getDate()).padStart(2,"0");
  const mm = String(x.getMonth()+1).padStart(2,"0");
  const yy = x.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function waTemplate({ tipe, tenantName, unitName, dueDMY }){
  const title = `*INFO KOS BU SITI*`;
  const sign = `_Admin Kos Bu Siti_`;

  if (tipe === "H-3"){
    return `${title}\n\nHalo Bapak/Ibu *${tenantName}* ( ${unitName} )\nPengingat: jatuh tempo pembayaran kos pada *${dueDMY}* (H-3).\nMohon disiapkan ya.\n\n${sign}`;
  }
  if (tipe === "H-1"){
    return `${title}\n\nHalo Bapak/Ibu *${tenantName}* ( ${unitName} )\nPengingat: besok jatuh tempo pembayaran kos pada *${dueDMY}* (H-1).\nTerima kasih.\n\n${sign}`;
  }
  if (tipe === "H+2"){
    return `${title}\n\nHalo Bapak/Ibu *${tenantName}* ( ${unitName} )\nInfo: pembayaran kos dengan jatuh tempo *${dueDMY}* sudah melewati H+2.\nMohon konfirmasi / dilakukan pembayaran ya.\n\n${sign}`;
  }
  return `${title}\n\nHalo Bapak/Ibu *${tenantName}* ( ${unitName} )\n\n${sign}`;
}

function statusText(nextDue, today){
  const { months, days } = calcLate(nextDue, today);
  if (months === 0 && days === 0) return `<span class="badge">Belum jatuh tempo</span>`;

  const parts = [];
  if (months > 0) parts.push(`${months} bln`);
  if (days > 0) parts.push(`${days} hr`);
  return `<span class="badge">Telat ${parts.join(" ")}</span>`;
}

async function build(){
  const tbody = document.querySelector("#tbl tbody");
  tbody.innerHTML = `<tr><td colspan="6" class="muted">Memuat...</td></tr>`;

  const [units, tenants] = await Promise.all([getUnits(), getTenants()]);
  const tenantsByUnit = new Map(tenants.map(t => [t.unit_id, t]));

  const today = startOfDay(new Date());

  const h3 = [];
  const h1 = [];
  const h2 = [];

  const rows = [];

  for (const u of units){
    const t = tenantsByUnit.get(u.id);
    if (!t){
      rows.push(`
        <tr>
          <td><b>${u.nama_unit}</b></td>
          <td class="muted">— (kosong)</td>
          <td class="muted">—</td>
          <td class="muted">—</td>
          <td><span class="badge">Tidak ada penyewa</span></td>
          <td class="muted">—</td>
        </tr>
      `);
      continue;
    }

    const payments = await getPaymentsByTenant(t.id);
    const merged = paymentsToRanges(payments);

    const lastEnd = maxEndDate(merged);
    const startDate = toDate(t.tanggal_mulai);

    const nextDue = lastEnd ? addDays(lastEnd, 1) : startDate;
    const dUntil = Math.round((nextDue.getTime() - today.getTime())/86400000);

    if (dUntil === 3) h3.push({ unitName:u.nama_unit, tenantName:t.nama, phone:t.no_hp, due: nextDue });
    if (dUntil === 1) h1.push({ unitName:u.nama_unit, tenantName:t.nama, phone:t.no_hp, due: nextDue });
    if (dUntil === -2) h2.push({ unitName:u.nama_unit, tenantName:t.nama, phone:t.no_hp, due: nextDue });

    const dueDMY = fmtDMY(nextDue);
    const btns = [];

    if (dUntil === 3){
      const txt = waTemplate({ tipe:"H-3", tenantName:t.nama, unitName:u.nama_unit, dueDMY });
      btns.push(`<a class="badge" style="padding:7px 10px" href="${waLink(t.no_hp, txt)}" target="_blank">H-3</a>`);
    }
    if (dUntil === 1){
      const txt = waTemplate({ tipe:"H-1", tenantName:t.nama, unitName:u.nama_unit, dueDMY });
      btns.push(`<a class="badge" style="padding:7px 10px" href="${waLink(t.no_hp, txt)}" target="_blank">H-1</a>`);
    }
    if (dUntil === -2){
      const txt = waTemplate({ tipe:"H+2", tenantName:t.nama, unitName:u.nama_unit, dueDMY });
      btns.push(`<a class="badge" style="padding:7px 10px" href="${waLink(t.no_hp, txt)}" target="_blank">H+2</a>`);
    }

    const txtDefault = waTemplate({ tipe:"H-1", tenantName:t.nama, unitName:u.nama_unit, dueDMY });
    btns.push(`<a class="badge" style="padding:7px 10px" href="${waLink(t.no_hp, txtDefault)}" target="_blank">WA</a>`);

    rows.push(`
      <tr>
        <td><b>${u.nama_unit}</b></td>
        <td>${t.nama}</td>
        <td class="muted">${t.no_hp || "—"}</td>
        <td>${dueDMY}</td>
        <td>${statusText(nextDue, today)}</td>
        <td><div class="row" style="gap:6px">${btns.join("")}</div></td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join("") || `<tr><td colspan="6" class="muted">Tidak ada data.</td></tr>`;

  const renderBucket = (arr, elId, tipe) => {
    const el = document.getElementById(elId);
    if (!arr.length){ el.innerHTML = `<div class="muted">Tidak ada.</div>`; return; }
    el.innerHTML = arr.map(x=>{
      const dueDMY = fmtDMY(x.due);
      const text = waTemplate({ tipe, tenantName:x.tenantName, unitName:x.unitName, dueDMY });
      return `
        <div class="row" style="justify-content:space-between; margin:8px 0">
          <div>
            <div><b>${x.unitName}</b> — ${x.tenantName}</div>
            <div class="muted">Jatuh tempo: ${dueDMY}</div>
          </div>
          <a class="badge" href="${waLink(x.phone, text)}" target="_blank">WA</a>
        </div>
      `;
    }).join("");
  };

  renderBucket(h3, "listH3", "H-3");
  renderBucket(h1, "listH1", "H-1");
  renderBucket(h2, "listH2", "H+2");
}

document.getElementById("btnReload").addEventListener("click", build);
build();