import {
  getUnits,
  getTenants,
  updateTenant,
  addTenant,
  deleteTenantCascade,
} from "./repo.js";
import { toDate, toISODate } from "./utils.js";

let state = {
  units: [],
  tenants: [],
  unitById: new Map(),
};

function fmtDMY(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const yy = x.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function showNotif(msg, isError = false) {
  const el = document.getElementById("notif");
  el.classList.remove("hidden");

  if (isError) {
    el.className =
      "p-4 rounded-xl bg-red-900/30 text-red-200 border border-red-500/30 shadow-lg text-sm italic";
  } else {
    el.className =
      "p-4 rounded-xl bg-emerald-900/40 text-emerald-200 border border-emerald-500/30 shadow-lg text-sm italic";
  }

  el.textContent = msg;

  clearTimeout(showNotif._t);
  showNotif._t = setTimeout(() => {
    el.classList.add("hidden");
  }, 3000);
}

function renderAddUnitOptions() {
  const usedIds = new Set(state.tenants.map((t) => t.unit_id));
  const avail = state.units.filter((u) => !usedIds.has(u.id));

  document.getElementById("addUnit").innerHTML = avail.length
    ? avail
        .map((u) => `<option value="${u.id}">${u.nama_unit}</option>`)
        .join("")
    : `<option value="">Semua unit sudah terisi</option>`;

  document.getElementById("addInfo").textContent = avail.length
    ? `${avail.length} unit masih tersedia untuk penyewa baru.`
    : "Tidak ada unit kosong. Hapus atau edit penyewa jika ingin mengubah alokasi unit.";
}

function renderTenantTable() {
  const tbody = document.getElementById("tbodyTenants");
  document.getElementById("tenantCount").textContent =
    `${state.tenants.length} penyewa`;

  if (!state.tenants.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="p-6 text-[#8aa0c6] italic text-center">
          Belum ada data penyewa.
        </td>
      </tr>
    `;
    return;
  }

  const rows = state.tenants
    .slice()
    .sort((a, b) => {
      const ua = state.unitById.get(a.unit_id)?.nama_unit || "";
      const ub = state.unitById.get(b.unit_id)?.nama_unit || "";
      return ua.localeCompare(ub, "id");
    })
    .map((t) => {
      const unit = state.unitById.get(t.unit_id);

      return `
        <tr class="hover:bg-white/5 transition">
          <td class="p-4 text-left border-b border-white/10">
            <div class="font-bold">${t.nama}</div>
          </td>
          <td class="p-4 text-left border-b border-white/10 text-[#8aa0c6]">
            ${t.no_hp || "—"}
          </td>
          <td class="p-4 border-b border-white/10 font-mono">
            ${unit?.nama_unit || "—"}
          </td>
          <td class="p-4 border-b border-white/10">
            ${fmtDMY(toDate(t.tanggal_mulai))}
          </td>
          <td class="p-4 border-b border-white/10">
            <div class="flex items-center justify-center gap-2">
              <button
                class="bg-white/5 border border-white/10 px-4 py-2 rounded-lg text-xs font-bold hover:bg-emerald-500/20 transition"
                data-edit="${t.id}"
              >
                Edit
              </button>

              <button
                class="bg-red-900/20 border border-red-500/20 text-red-200 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-500/20 transition"
                data-delete="${t.id}"
              >
                Hapus
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  tbody.innerHTML = rows;

  document.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.onclick = () => openEditModal(btn.getAttribute("data-edit"));
  });

  document.querySelectorAll("button[data-delete]").forEach((btn) => {
    btn.onclick = () => handleDeleteTenant(btn.getAttribute("data-delete"));
  });
}

async function build() {
  const [units, tenants] = await Promise.all([getUnits(), getTenants()]);
  state.units = units;
  state.tenants = tenants;
  state.unitById = new Map(units.map((u) => [u.id, u]));

  renderAddUnitOptions();
  renderTenantTable();
}

const backdrop = document.getElementById("modalBackdrop");

function closeModal() {
  backdrop.classList.add("hidden");
  backdrop.classList.remove("flex");
}

document.getElementById("btnClose").onclick = closeModal;
backdrop.onclick = (e) => {
  if (e.target === backdrop) closeModal();
};

let editingId = null;

function openEditModal(id) {
  editingId = id;

  const t = state.tenants.find((x) => x.id === id);
  if (!t) return;

  const used = new Set(
    state.tenants.filter((x) => x.id !== id).map((x) => x.unit_id),
  );

  document.getElementById("mUnit").innerHTML = state.units
    .map((u) => {
      const dis = used.has(u.id) ? "disabled" : "";
      const sel = u.id === t.unit_id ? "selected" : "";
      return `<option value="${u.id}" ${sel} ${dis}>${u.nama_unit} ${dis ? "(isi)" : ""}</option>`;
    })
    .join("");

  document.getElementById("mNama").value = t.nama || "";
  document.getElementById("mHp").value = t.no_hp || "";
  document.getElementById("mMulai").value = toISODate(toDate(t.tanggal_mulai));
  document.getElementById("mInfo").textContent = `UID: ${id}`;

  backdrop.classList.remove("hidden");
  backdrop.classList.add("flex");
}

document.getElementById("btnSaveTenant").onclick = async () => {
  try {
    const payload = {
      nama: document.getElementById("mNama").value.trim(),
      no_hp: document.getElementById("mHp").value.trim(),
      unit_id: document.getElementById("mUnit").value,
      tanggal_mulai: document.getElementById("mMulai").value,
    };

    if (!payload.nama || !payload.unit_id || !payload.tanggal_mulai) {
      alert("Data wajib diisi!");
      return;
    }

    await updateTenant(editingId, payload);
    closeModal();
    await build();
    showNotif("Data penyewa berhasil diperbarui.");
  } catch (err) {
    console.error(err);
    showNotif("Gagal memperbarui data penyewa.", true);
  }
};

async function handleDeleteTenant(id) {
  try {
    const t = state.tenants.find((x) => x.id === id);
    if (!t) return;

    const unitName = state.unitById.get(t.unit_id)?.nama_unit || "-";

    const ok = confirm(
      `Yakin ingin menghapus penyewa ini beserta seluruh riwayat pembayarannya?\n\nNama: ${t.nama}\nUnit: ${unitName}\n\nTindakan ini tidak bisa dibatalkan.`,
    );

    if (!ok) return;

    const result = await deleteTenantCascade(id);
    await build();

    showNotif(
      `Penyewa "${t.nama}" dihapus. ${result.deletedPayments} riwayat pembayaran ikut dihapus.`,
    );
  } catch (err) {
    console.error(err);
    showNotif("Gagal menghapus penyewa.", true);
  }
}

document.getElementById("btnAddTenant").onclick = async () => {
  try {
    const payload = {
      nama: document.getElementById("addNama").value.trim(),
      no_hp: document.getElementById("addHp").value.trim(),
      unit_id: document.getElementById("addUnit").value,
      tanggal_mulai: document.getElementById("addMulai").value,
    };

    if (!payload.nama || !payload.unit_id || !payload.tanggal_mulai) {
      alert("Data wajib diisi!");
      return;
    }

    await addTenant(payload);

    document.getElementById("addNama").value = "";
    document.getElementById("addHp").value = "";
    document.getElementById("addMulai").value = "";

    await build();
    showNotif("Penyewa baru berhasil ditambahkan.");
  } catch (err) {
    console.error(err);
    showNotif("Gagal menambahkan penyewa.", true);
  }
};

document.getElementById("btnReload").onclick = build;

build();
