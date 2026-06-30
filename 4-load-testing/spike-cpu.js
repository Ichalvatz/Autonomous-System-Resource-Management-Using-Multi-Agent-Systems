import http from 'k6/http';
import { check } from 'k6';

export const options = {
    // Καμία σταδιακή αύξηση. 300 χρήστες ταυτόχρονα σαν να άνοιξαν οι πόρτες στη Black Friday.
    vus: 300,
    duration: '2m', 
};

const searchTerms = ['Athens', 'Paris', 'beach', 'museum'];

export default function () {
    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    const url = `http://mwtback.aiops/places/search?keywords=${randomTerm}`;
    
    // Αφαιρέσαμε το sleep()! Ο κάθε χρήστης κάνει request όσο πιο γρήγορα μπορεί το δίκτυο.
    http.get(url);
}