import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1000'],
  },
};

export function setup() {
  const response = http.post(`${__ENV.API_URL}/auth/login`, JSON.stringify({ email: __ENV.LOGIN_EMAIL, password: __ENV.LOGIN_PASSWORD }), { headers: { 'Content-Type': 'application/json' } });
  check(response, { 'login berhasil': (result) => result.status === 201 || result.status === 200 });
  return { token: response.json('accessToken') };
}

export default function run(data) {
  const response = http.post(`${__ENV.API_URL}/sales`, JSON.stringify({
    branchId: __ENV.BRANCH_ID,
    warehouseId: __ENV.WAREHOUSE_ID,
    items: [{ productUnitId: __ENV.PRODUCT_UNIT_ID, quantity: 1 }],
    paymentMethod: 'CASH',
  }), { headers: { Authorization: `Bearer ${data.token}`, 'Content-Type': 'application/json' } });
  check(response, { 'transaksi berhasil/konflik stok': (result) => [201, 409].includes(result.status) });
  sleep(0.2);
}
