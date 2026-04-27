# Apimeter Backend

Express + MongoDB backend for an API metering application. It works as a metered API gateway: users register an upstream API base URL, receive an API key, and every request made through Apimeter is forwarded to that upstream API while being tracked.

## Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT authentication
- Hashed API keys
- Metered API proxy
- Zod request validation

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill the values:

```bash
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/apimeter
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173
API_KEY_PREFIX=apm
PROXY_TIMEOUT_MS=30000
```

3. Start the server:

```bash
npm run dev
```

Use `npm.cmd run dev` on Windows if PowerShell blocks the npm script shim.

## Main Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### API Keys

Requires `Authorization: Bearer <jwt>`.

- `GET /api/keys`
- `POST /api/keys`
- `PATCH /api/keys/:id`
- `DELETE /api/keys/:id`

`POST /api/keys` returns the raw key once. Store it immediately.

Create keys with a `targetBaseUrl`, for example:

```json
{
  "name": "PokeAPI Key",
  "targetBaseUrl": "https://pokeapi.co/api/v2",
  "monthlyLimit": 10000
}
```

### Metered Proxy API

Requires `x-api-key: <api_key>`.

- `ANY /api/proxy/*`
- `GET /api/metered/ping`

The proxy validates the API key, checks the monthly limit, forwards the request to the key's `targetBaseUrl`, records the request, and returns the upstream response.

Example:

```text
targetBaseUrl: https://pokeapi.co/api/v2
client calls:  GET /api/proxy/pokemon/pikachu
upstream call: GET https://pokeapi.co/api/v2/pokemon/pikachu
```

Tracked fields include:

- API key and user
- HTTP method and Apimeter route
- upstream base URL, full URL, and path
- status code and upstream status code
- response time and upstream response time
- request bytes, response bytes, and total transfer bytes
- IP address, user agent, content type, and error message

### Usage

Requires `Authorization: Bearer <jwt>`.

- `GET /api/usage/summary?days=30`
- `GET /api/usage/logs?page=1&limit=25&days=30`
- `GET /api/usage/logs?apiKeyId=<id>`

## Example Flow

Register:

```bash
curl -X POST http://localhost:5000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Demo User\",\"email\":\"demo@example.com\",\"password\":\"password123\"}"
```

Create an API key:

```bash
curl -X POST http://localhost:5000/api/keys ^
  -H "Authorization: Bearer <jwt>" ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"PokeAPI\",\"targetBaseUrl\":\"https://pokeapi.co/api/v2\",\"monthlyLimit\":10000}"
```

Call a metered endpoint:

```bash
curl http://localhost:5000/api/proxy/pokemon/pikachu -H "x-api-key: <api_key>"
```

## Project Structure

- `config/` MongoDB connection
- `models/` Mongoose schemas
- `controllers/` Request handling logic
- `routes/` Endpoint definitions
- `middleware/` Auth, API key validation, metering, and errors
- `app.js` Express app and server bootstrap
