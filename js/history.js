import { getAllPayments, getTenants, deletePayment, updatePaymentTenant } from "./repo.js";
import { toDate, formatRupiah } from "./utils.js";

function showNotif(msg){
  const n = document.getElementById("notif");
  n.textContent = msg;
  n.style.display = "block";
  clearTimeout(showNotif._t);
  showNotif._t = setTimeout(()=>{ n.style.display = "none"; }, 2500);
}

function fmtDMY(d){
  const x = new Date(d); x.setHours(0,0,0,0);
  const dd = String(x.getDate()).padStart(2,"0");
  const mm = String(x.getMonth()+1).padStart(2,"0");
  const yy = x.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

async function build(){
  const [tenants, payments] = await Promise.all([getTenants(), getAllPayments()]);
  const tenantsById = new Map(tenants.map(t => [t.id, t]));

  const tbody = document.getElementById("tbody");
  tbody.innerHTML = "";

  if (!payments.length){
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Belum ada transaksi.</td></tr>`;
    return;
  }

  for (const p of payments){
    const t = tenantsById.get(p.tenant_id);
    const bayar = toDate(p.tanggal_bayar);
    const ps = toDate(p.periode_mulai);
    const pe = toDate(p.periode_selesai);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${bayar ? fmtDMY(bayar) : "—"}</td>
      <td>
        <select class="tenantSelect" data-id="${p.id}">
          ${tenants.map(x=>{
            const sel = x.id === p.tenant_id ? "selected" : "";
            return `<option value="${x.id}" ${sel}>${x.nama}</option>`;
          }).join("")}
        </select>
        <div class="muted" style="margin-top:4px">${t?.no_hp || ""}</div>
      </td>
      <td>${ps ? fmtDMY(ps) : "—"} - ${pe ? fmtDMY(pe) : "—"}</td>
      <td>Rp ${formatRupiah(p.jumlah || 0)}</td>
      <td>
        <button class="small" data-del="${p.id}">Hapus</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  // bind delete
  document.querySelectorAll("button[data-del]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.getAttribute("data-del");
      if (!confirm("Hapus pembayaran ini?")) return;

      await deletePayment(id);
      btn.closest("tr").remove();
      showNotif("✅ Pembayaran berhasil dihapus");
    });
  });

  // bind change tenant
  document.querySelectorAll("select.tenantSelect").forEach(sel=>{
    sel.addEventListener("change", async ()=>{
      const id = sel.getAttribute("data-id");
      await updatePaymentTenant(id, sel.value);
      showNotif("✅ Penyewa pembayaran diperbarui");
    });
  });
}

build();