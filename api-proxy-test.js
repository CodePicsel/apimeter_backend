import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
};

const BASE_URL = __ENV.BASE_URL || "https://apimeter-backend.onrender.com";
const API_KEY = __ENV.API_KEY;

const routes = [
  "/api/proxy/pokemon/pikachu",
  "/api/proxy/pokemon/charizard",
  "/api/proxy/pokemon/bulbasaur",
  "/api/proxy/pokemon/mewtwo",
];

export default function () {
  for (const route of routes) {
    const res = http.get(`${BASE_URL}${route}`, {
      headers: {
        "x-api-key": API_KEY,
      },
    });

    check(res, {
      "status was 200": (r) => r.status === 200,
    });
  }

  sleep(0.5);
}
