# LocalSaathi — Product Analytics API Specification (Phase 16)

## Base URL
`/api/v1/analytics`

---

## Endpoints

### 1. Ingest Single Client Event
- **Endpoint**: `POST /events`
- **Auth**: Public or Optional Bearer Token
- **Request Body**:
```json
{
  "eventId": "evt_abc123_456",
  "eventName": "job_viewed",
  "anonymousSessionId": "anon_session_123",
  "platform": "WEB",
  "appVersion": "1.0.0",
  "metadata": {
    "jobId": "job-uuid-123",
    "category": "Gardening"
  }
}
```
- **Response**: `201 Created`
```json
{
  "success": true,
  "accepted": 1,
  "duplicates": 0
}
```

---

### 2. Ingest Batch Client Events
- **Endpoint**: `POST /events/batch`
- **Auth**: Public or Optional Bearer Token
- **Request Body**:
```json
{
  "events": [
    {
      "eventId": "evt_1",
      "eventName": "voice_search_used",
      "metadata": { "queryLang": "hi" }
    },
    {
      "eventId": "evt_2",
      "eventName": "recommendation_clicked",
      "metadata": { "position": 1 }
    }
  ]
}
```
- **Response**: `201 Created`
```json
{
  "accepted": 2,
  "rejected": 0,
  "duplicates": 0
}
```

---

### 3. Admin Event Explorer
- **Endpoint**: `GET /admin/events`
- **Auth**: `ADMIN` or `MODERATOR` role
- **Query Parameters**:
  - `page`: Integer (default 1)
  - `limit`: Integer (default 20, max 100)
  - `eventName`: String (optional filter)
  - `source`: `SERVER_AUTHORITATIVE` | `CLIENT_INTERACTION` (optional)
  - `platform`: String (optional)
  - `startDate`: ISO 8601 (optional)
  - `endDate`: ISO 8601 (optional)
- **Response**: `200 OK`
```json
{
  "data": [
    {
      "id": "uuid",
      "eventId": "evt_1",
      "eventName": "voice_search_used",
      "occurredAt": "2026-10-05T00:00:00.000Z",
      "ingestedAt": "2026-10-05T00:00:01.000Z",
      "userId": "uuid",
      "source": "CLIENT_INTERACTION",
      "platform": "WEB",
      "metadata": { "queryLang": "hi" }
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "totalPages": 1
}
```

---

### 4. Admin Product Analytics Metrics
- **Endpoint**: `GET /admin/metrics`
- **Auth**: `ADMIN` or `MODERATOR` role
- **Query Parameters**:
  - `timeframe`: `24h` | `7d` | `30d` | `90d` (default `30d`)
- **Response**: `200 OK`
```json
{
  "timeframe": "30d",
  "generatedAt": "2026-10-05T00:00:00.000Z",
  "acquisition": {
    "signupStartedCount": 10,
    "signupCompletedCount": 8,
    "signupConversionRate": 80.0,
    "uniqueActiveUsers": 50
  },
  "engagement": {
    "totalInteractions": 120,
    "jobViewsCount": 60,
    "searchesCount": 30,
    "voiceSearchesCount": 6,
    "voiceUsagePercentage": 20.0,
    "recommendationCtr": 8.3,
    "topLanguages": [{ "language": "hi", "count": 12 }]
  },
  "matching": {
    "applicationsSubmittedCount": 25,
    "applicationsAcceptedCount": 5,
    "applicationConversionRate": 20.0
  },
  "fulfillment": {
    "bookingsCompletedCount": 5,
    "bookingCompletionRate": 100.0
  },
  "payments": {
    "paymentSuccessRate": 100.0,
    "totalCapturedVolumeInr": 1500000
  },
  "trustSafety": {
    "reportsSubmittedCount": 2,
    "averageRating": 4.9
  }
}
```
