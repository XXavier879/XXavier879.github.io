// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDMh1skp6I2ipzBhIQz42EE8utdZqA9Ffc",
  authDomain: "xgames-chat-database.firebaseapp.com",
  projectId: "xgames-chat-database",
  storageBucket: "xgames-chat-database.appspot.com",
  messagingSenderId: "145136273026",
  appId: "1:145136273026:web:67dbf6eac5b37eb7d8169b",
  measurementId: "G-2MHNZ56YFE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
