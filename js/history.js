import {
  getAllPayments,
  getTenants,
  deletePayment,
  updatePaymentTenant,
} from "./repo.js";
import { toDate, formatRupiah } from "./utils.js";

function showNotif(msg) {
  const n = document.getElementById("notif");
  n.textContent = msg;
  n.style.display = "block";
  clearTimeout(showNotif._t);
  showNotif._t = setTimeout(() => {
    n.style.display = "none";
  }, 3000);
}

function fmtDMY(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const yy = x.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

async function build() {
  const tbody = document.getElementById("tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-[#8aa0c6] italic">Memuat data...</td></tr>`;

  const [tenants, payments] = await Promise.all([
    getTenants(),
    getAllPayments(),
  ]);
  const tenantsById = new Map(tenants.map((t) => [t.id, t]));

  if (!payments.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-[#8aa0c6] italic">Belum ada transaksi tersimpan.</td></tr>`;
    return;
  }

  tbody.innerHTML = payments
    .map((p) => {
      const t = tenantsById.get(p.tenant_id);
      const bayar = toDate(p.tanggal_bayar);
      const ps = toDate(p.periode_mulai);
      const pe = toDate(p.periode_selesai);

      return `
        <tr class="hover:bg-white/5 transition">
          <td class="p-4 border-b border-white/5 font-mono text-xs">${bayar ? fmtDMY(bayar) : "—"}</td>
          <td class="p-4 border-b border-white/5">
            <select class="tenantSelect bg-white/5 border border-white/10 rounded-lg p-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500" data-id="${p.id}">
              ${tenants
                .map((x) => {
                  const sel = x.id === p.tenant_id ? "selected" : "";
                  return `<option value="${x.id}" ${sel}>${x.nama}</option>`;
                })
                .join("")}
            </select>
            <div class="text-[10px] text-[#8aa0c6] mt-1 italic">${t?.no_hp || ""}</div>
          </td>
          <td class="p-4 border-b border-white/5 text-xs text-[#8aa0c6]">
            ${ps ? fmtDMY(ps) : "—"} <br/> s/d <br/> ${pe ? fmtDMY(pe) : "—"}
          </td>
          <td class="p-4 border-b border-white/5 font-bold text-emerald-400">Rp ${formatRupiah(p.jumlah || 0)}</td>
          <td class="p-4 border-b border-white/5">
            <button class="bg-red-900/20 text-red-400 border border-red-500/20 px-4 py-1 rounded-lg text-[10px] font-bold hover:bg-red-500 hover:text-white transition" data-del="${p.id}">
              Hapus
            </button>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.onclick = async (e) => {
    const btn = e.target.closest("button[data-del]");
    if (!btn) return;

    const id = btn.getAttribute("data-del");
    if (!confirm("Hapus data pembayaran ini selamanya?")) return;

    await deletePayment(id);
    btn.closest("tr").remove();
    showNotif("✅ Berhasil: Transaksi telah dihapus.");
  };

  tbody.onchange = async (e) => {
    const sel = e.target.closest("select.tenantSelect");
    if (!sel) return;

    const id = sel.getAttribute("data-id");
    await updatePaymentTenant(id, sel.value);
    showNotif("✅ Berhasil: Data penyewa diperbarui.");
  };
}

build();
