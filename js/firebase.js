// Firebase v9+ (modular) via CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/**
 * ✅ Tempel firebaseConfig milikmu di sini.
 * Firebase setup tidak dijelaskan lagi sesuai permintaan.
 */
const firebaseConfig = {
  apiKey: "AIzaSyCHEcZw7xuP3MRak8x8tufSmGBNpSyC76I",
  authDomain: "kossangkrah.firebaseapp.com",
  projectId: "kossangkrah",
  storageBucket: "kossangkrah.firebasestorage.app",
  messagingSenderId: "845808147831",
  appId: "1:845808147831:web:dd95f480e9bc99612b1572"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);