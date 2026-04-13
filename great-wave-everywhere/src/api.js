// src/api.js
import axios from "axios";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  query,
  orderBy,
  limit,
  getDocs,
  increment,
} from "firebase/firestore";

const FUNCTIONS_BASE =
  "https://us-central1-great-wave-everywhere.cloudfunctions.net";

// Firebase configuration (public, safe to expose in frontend)
const firebaseConfig = {
  apiKey: "AIzaSyCRxJN8mLgYx3InCRLqGLCQhSc5hq7JbJ0",
  authDomain: "great-wave-everywhere.firebaseapp.com",
  projectId: "great-wave-everywhere",
  storageBucket: "great-wave-everywhere.appspot.com",
  messagingSenderId: "435639476835",
  appId: "1:435639476835:web:c8ca95d74d3d6259df5e59",
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

/**
 * Increments the count for a given word in Firestore directly (no Cloud Function).
 * If the word doesn't exist yet, it initializes it with count = 1.
 */
export async function updateWord(word) {
  try {
    const wordLower = word.toLowerCase();
    const wordRef = doc(db, "words", wordLower);

    await runTransaction(db, async (transaction) => {
      const docSnapshot = await transaction.get(wordRef);
      if (!docSnapshot.exists()) {
        transaction.set(wordRef, { count: 1 });
      } else {
        transaction.update(wordRef, { count: docSnapshot.data().count + 1 });
      }
    });

    return { success: true, word: wordLower };
  } catch (error) {
    console.error("Error updating word:", error);
    throw error;
  }
}

/**
 * Fetches all words in the "words" collection via Cloud Function.
 * Used to render the full word cloud.
 */
export async function fetchWords() {
  try {
    const response = await axios.get(`${FUNCTIONS_BASE}/getWords`);
    return response.data;
  } catch (error) {
    console.error("Error fetching words:", error);
    return [];
  }
}

/**
 * Fetches the top N most searched words, sorted by count in descending order.
 * Used to render a trending panel.
 */
export async function fetchTrendingWords(n = 5) {
  try {
    const response = await axios.get(
      `${FUNCTIONS_BASE}/getTrendingWords?n=${n}`,
    );
    return response.data;
  } catch (error) {
    console.error("Error fetching trending words:", error);
    return [];
  }
}

/**
 * Updates or creates a location entry in Firestore.
 * Uses server-side increment to handle concurrent writes safely.
 * Document ID is based on lat+lng+domain to avoid duplicates.
 */
export async function updateLocation(lat, lng, domain) {
  try {
    const locationId = `${lat.toFixed(2)}_${lng.toFixed(2)}_${domain}`;
    const locationRef = doc(db, "locations", locationId);
    const now = new Date().toISOString();

    // First, try to create document if it doesn't exist
    await setDoc(
      locationRef,
      {
        lat: Number(lat),
        lng: Number(lng),
        domain,
        count: 0,
        lastSeen: now,
      },
      { merge: true },
    );

    // Then increment the count atomically
    await updateDoc(locationRef, {
      count: increment(1),
      lastSeen: now,
    });

    return { success: true, locationId };
  } catch (error) {
    // Fail silently to not block image display
    console.warn("Failed to update location:", error.message);
  }
}

/**
 * Fetches and aggregates locations by lat/lng coordinates.
 * Multiple domains at same location are grouped into one circle with summed count.
 * Returns top N locations by aggregated count.
 */
export async function fetchTrendingLocations(n = 100) {
  try {
    const locationsRef = collection(db, "locations");
    // Fetch more to ensure we have enough after grouping
    const q = query(locationsRef, orderBy("count", "desc"), limit(n * 3));
    const querySnapshot = await getDocs(q);

    // Group by lat/lng to handle multiple domains at same location
    const grouped = {};
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const key = `${data.lat.toFixed(2)}_${data.lng.toFixed(2)}`;

      if (!grouped[key]) {
        grouped[key] = {
          lat: data.lat,
          lng: data.lng,
          count: 0,
          domains: [],
          lastSeen: data.lastSeen,
        };
      }
      grouped[key].count += data.count;
      grouped[key].domains.push(data.domain);
      // Keep the most recent lastSeen
      if (data.lastSeen > grouped[key].lastSeen) {
        grouped[key].lastSeen = data.lastSeen;
      }
    });

    // Convert to array and sort by aggregated count
    const locations = Object.values(grouped)
      .sort((a, b) => b.count - a.count)
      .slice(0, n);

    return locations;
  } catch (error) {
    console.error("Error fetching trending locations:", error);
    return [];
  }
}
