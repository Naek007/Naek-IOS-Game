import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyANnQQvtwWEN1mrs8_AqXofZWI6dPWm3q4",
  authDomain: "boardgame-7015c.firebaseapp.com",
  databaseURL: "https://boardgame-7015c-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "boardgame-7015c",
  storageBucket: "boardgame-7015c.firebasestorage.app",
  messagingSenderId: "138831124973",
  appId: "1:138831124973:web:6963e61b6e0a6cffedefe4",
  measurementId: "G-8R05BKJ8DS"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
