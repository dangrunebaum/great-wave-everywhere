// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from 'firebase/firestore';

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAZsdXZU6WbM33SaKP5PoYm7G0V2ABYUSU",
  authDomain: "great-wave-everywhere.firebaseapp.com",
  projectId: "great-wave-everywhere",
  storageBucket: "great-wave-everywhere.firebasestorage.app",
  messagingSenderId: "636756607685",
  appId: "1:636756607685:web:2199075bc12821f89466ac",
  measurementId: "G-XRVYGKFWJ8"
};
const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
