import http from 'k6/http';
import { check, sleep } from 'k6';

// Ορισμός των σεναρίων
export const options = {
    scenarios: {
        // Σενάριο 1: Οι "Κανονικοί Χρήστες" (Background Traffic)
        // Στέλνουν σταθερή, χαμηλή κίνηση για 3 λεπτά.
        background_traffic: {
            executor: 'constant-vus',
            vus: 2, 
            duration: '3m',
            exec: 'normalTraffic', // Καλεί τη συνάρτηση normalTraffic
        },
        
        // Σενάριο 2: Το "Δηλητηριώδες Χάπι" (Chaos Injection)
        // Χτυπάει ακριβώς 1 φορά, 30 δευτερόλεπτα μετά την έναρξη του τεστ!
        poison_pill: {
            executor: 'shared-iterations',
            vus: 1,
            iterations: 1,
            startTime: '30s', // Περιμένει 30 δευτερόλεπτα πριν ρίξει το χάος
            exec: 'zombieTraffic', // Καλεί τη συνάρτηση zombieTraffic
        },
    },
};

// Η λειτουργία των κανονικών χρηστών
export function normalTraffic() {
    const loginUrl = 'http://mwtback.aiops/auth/login';
    const payload = JSON.stringify({ email: 'user1@example.com', password: 'password123' });
    const params = { headers: { 'Content-Type': 'application/json' } };
    
    const res = http.post(loginUrl, payload, params);
    
    // Είναι φυσιολογικό να δούμε errors (π.χ. 502/504) την ώρα που το σύστημα
    // είναι "ζόμπι" ή την ώρα που ο Agent κάνει το restart, οπότε δεν τα κάνουμε check.
    // Keep traffic positive, but sparse enough for the single 10s zombie
    // request to dominate the one-minute Prometheus p95 window.
    sleep(10);
}

// Η λειτουργία του Chaos Engineering
export function zombieTraffic() {
    console.log("☠️ [CHAOS] Injecting Poison Pill (Zombie request) NOW!");
    
    // Χτυπάμε το endpoint που προκαλεί το deadlock
    const res = http.get('http://mwtback.aiops/chaos/zombie');
    
    console.log(`☠️ [CHAOS] Poison Pill completed with status: ${res.status}`);
}