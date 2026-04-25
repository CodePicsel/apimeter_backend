Meaning of each folder in this app

config/
Stores setup code like MongoDB connection, environment variables, Redis connection, etc.

models/
Stores MongoDB schemas.
For example:

User.js
ApiKey.js
RequestLog.js
UsageStats.js

These models save who made the request, when, and how many times.

routes/
Defines API endpoints.
For example:

POST /auth/register
POST /auth/login
POST /apikey/create
GET /usage
GET /logs

controllers/
Contains the main request-handling logic.
Example: when /usage is called, controller decides what data to return.

middleware/
Contains checks before the controller runs.
Very useful in metering apps for:

authentication
API key validation
request counting
rate limiting
logging request info

services/
Contains the actual business logic.
Example:

increment request count
calculate daily/monthly usage
check plan limits
generate usage reports

utils/
Small helper functions.
Example:

date formatter
error helper
response formatter
token generator

jobs/
Useful if you want background tasks.
Example:

reset daily counters
send usage reports
clean old logs

app.js
Main file where Express app is created, middleware is loaded, and routes are connected.