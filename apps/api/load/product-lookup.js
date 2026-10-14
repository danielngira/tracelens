import http from 'k6/http';
import { check } from 'k6';

const baseUrl = __ENV.TARGET_URL || 'http://127.0.0.1:4000';
export default function () {
  const code = `P${String(Math.floor(Math.random() * 20000) + 1).padStart(6, '0')}`;
  const response = http.get(`${baseUrl}/api/products/${code}`, { tags: { scenario: 'product-lookup' } });
  check(response, { 'status is 200': result => result.status === 200 });
}
