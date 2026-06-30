import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
    vus: 20,
    duration: '2m',
};

// Στέλνουμε SQL Injection δοκιμές, ειδικούς χαρακτήρες και null bytes
// Αν το backend δεν τα κάνει sanitize σωστά, θα πετάξει Error 500
const maliciousTerms = [
    "' OR 1=1 --", 
    "%; DROP TABLE places;", 
    "\\x00\\x01\\x02", 
    "undefined", 
    "NaN"
];

export default function () {
    const term = maliciousTerms[Math.floor(Math.random() * maliciousTerms.length)];
    // Κάνουμε encode για να περάσει από το δίκτυο, αλλά να σκάσει στον κώδικα
    const encodedTerm = encodeURIComponent(term);
    const url = `http://mwtback.aiops/places/search?keywords=${encodedTerm}`;
    
    http.get(url);
    sleep(0.1); 
}