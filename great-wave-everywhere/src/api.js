// src/api.js
import axios from "axios";

const FUNCTIONS_BASE =
  "https://us-central1-great-wave-everywhere.cloudfunctions.net";

/**
 * Increments the count for a given word in Firestore via Cloud Function.
 * If the word doesn't exist yet, it initializes it with count = 1.
 */
export async function updateWord(word) {
  try {
    const response = await axios.post(`${FUNCTIONS_BASE}/updateWord`, { word });
    return response.data;
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
