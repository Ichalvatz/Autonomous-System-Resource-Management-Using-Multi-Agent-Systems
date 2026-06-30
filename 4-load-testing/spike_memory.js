import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
    vus: 50, // Δεν θέλουμε άπειρους χρήστες, θέλουμε ΒΑΡΙΑ requests
    duration: '2m',
};

// Δημιουργούμε ένα τεράστιο, άχρηστο string 1 Megabyte
const massivePayload = "A".repeat(1024 * 1024); 

export default function () {
    // Στέλνουμε το τεράστιο string ως query parameter ή header 
    // Αναγκάζει τον web server να δεσμεύσει MBs μνήμης για να διαβάσει το URL
    const url = `http://mwtback.aiops/places/search?keywords=Athens&junk=${massivePayload}`;
    
    const params = {
        headers: { 'Content-Type': 'application/json' },
    };

    http.get(url, params);
    sleep(0.5); // Μικρή παύση για να μην "κάψουμε" το CPU, θέλουμε να χτυπήσουμε ΜΟΝΟ τη μνήμη
}