import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
    stages: [
        { duration: '30s', target: 22 }, // Ομαλό ramp-up
        { duration: '6m', target: 22 },  // Σταθερό φορτίο για την εκπαίδευση
        { duration: '30s', target: 0 },  // Ομαλό ramp-down
    ],
    thresholds: {
        http_req_failed: ['rate<0.01'],
    },
};

const searchTerms = ['Athens', 'Paris', 'beach', 'museum', 'hotel', 'coffee'];

export default function () {
    const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
    const url = `http://mwtback.aiops/places/search?keywords=${randomTerm}`;
    
    const res = http.get(url);
    
    check(res, {
        'status is 200': (r) => r.status === 200,
    });
    
    sleep(0.1);
}