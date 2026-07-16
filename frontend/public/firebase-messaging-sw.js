importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCfLCGhA-cv1Fn2UINr_GSBMEbTbictKkM',
  authDomain: 'niyogax.firebaseapp.com',
  projectId: 'niyogax',
  storageBucket: 'niyogax.firebasestorage.app',
  messagingSenderId: '451980624601',
  appId: '1:451980624601:web:8d3bbb852a39f8e96234c8',
  measurementId: 'G-FHZVFHT7LW',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notificationTitle = payload.notification?.title || 'NiyogaX';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message',
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    data: payload.data || {},
  };
  
  self.registration.showNotification(notificationTitle, notificationOptions);
});
