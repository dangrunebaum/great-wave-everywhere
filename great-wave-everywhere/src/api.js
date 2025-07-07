// src/api.js
import { db } from './firebase'
import {
  doc,        // reference to a specific document
  getDoc,     // retrieve a document's data
  setDoc,     // create a new document
  updateDoc,  // update an existing document
  collection, // reference to a collection
  getDocs,    // fetch all documents in a collection
  query,      // construct a filtered query
  orderBy,    // sort results
  limit       // limit number of results
} from 'firebase/firestore'

/**
 * Increments the count for a given word in Firestore.
 * If the word doesn't exist yet, it initializes it with count = 1.
 */
export async function updateWord(word) {
  const ref = doc(db, 'words', word.toLowerCase()) // case-insensitive ID
  const snap = await getDoc(ref)

  if (snap.exists()) {
    await updateDoc(ref, { count: snap.data().count + 1 })
  } else {
    await setDoc(ref, { count: 1 })
  }
}

/**
 * Fetches all words in the "words" collection.
 * Used to render the full word cloud.
 */
export async function fetchWords() {
  const snapshot = await getDocs(collection(db, 'words'))
  return snapshot.docs.map(doc => ({
    id: doc.id,
    count: doc.data().count
  }))
}

/**
 * Fetches the top N most searched words, sorted by count in descending order.
 * Used to render a trending panel.
 */
export async function fetchTrendingWords(n = 5) {
  const q = query(collection(db, 'words'), orderBy('count', 'desc'), limit(n))
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    count: doc.data().count
  }))
}
