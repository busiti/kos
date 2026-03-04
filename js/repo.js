import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { db } from "./firebase.js";
import { toDate, tsFromDate, rangesMerge } from "./utils.js";

export async function getUnits(){
  const snap = await getDocs(query(collection(db,"units"), orderBy("nama_unit")));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function getTenants(){
  const snap = await getDocs(query(collection(db,"tenants"), orderBy("nama")));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function addTenant({ nama, no_hp, unit_id, tanggal_mulai }){
  await addDoc(collection(db,"tenants"),{
    nama,
    no_hp,
    unit_id,
    tanggal_mulai: tsFromDate(toDate(tanggal_mulai)),
    created_at: Timestamp.now()
  });
}

export async function updateTenant(id, payload){
  const data = { ...payload };
  if (data.tanggal_mulai) data.tanggal_mulai = tsFromDate(toDate(data.tanggal_mulai));
  await updateDoc(doc(db,"tenants",id), data);
}

export async function getPaymentsByTenant(tenantId){
  // NOTE: ini butuh composite index (tenant_id asc + periode_mulai asc) -> kamu sudah buat
  const qy = query(
    collection(db,"payments"),
    where("tenant_id","==",tenantId),
    orderBy("periode_mulai","asc")
  );
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export function paymentsToRanges(payments){
  const ranges = payments.map(p => ({
    start: toDate(p.periode_mulai),
    end: toDate(p.periode_selesai)
  }));
  return rangesMerge(ranges);
}

export async function addPayment({ tenant_id, periode_mulai, periode_selesai, tanggal_bayar, jumlah }){
  await addDoc(collection(db,"payments"),{
    tenant_id,
    periode_mulai: tsFromDate(periode_mulai),
    periode_selesai: tsFromDate(periode_selesai),
    tanggal_bayar: tsFromDate(tanggal_bayar),
    jumlah,
    created_at: Timestamp.now()
  });
}

/* ====== HISTORY ====== */

export async function getAllPayments(){
  // Urut terbaru dulu agar enak untuk audit
  const snap = await getDocs(query(collection(db,"payments"), orderBy("tanggal_bayar","desc")));
  return snap.docs.map(d => ({ id:d.id, ...d.data() }));
}

export async function deletePayment(id){
  await deleteDoc(doc(db,"payments",id));
}

export async function updatePaymentTenant(id, tenantId){
  await updateDoc(doc(db,"payments",id), { tenant_id: tenantId });
}