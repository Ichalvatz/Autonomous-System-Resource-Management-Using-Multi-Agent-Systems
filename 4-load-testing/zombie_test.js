import http from 'k6/http';
export const options = {
    vus: 1,
    iterations: 1,
};

const zombieUrl = 'http://mwtback.aiops/chaos/zombie';

export default function () {
    http.get(zombieUrl, {
        timeout: '15s',
        tags: { scenario: 'zombie' },
    });
}
