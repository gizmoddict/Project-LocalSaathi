# LocalSaathi — Product Analytics Canonical Event Catalog (Phase 16)

This document catalogs the canonical event taxonomy across the platform, specifying source classification and permitted metadata.

---

## 1. Acquisition & Authentication
| Event Name | Source | Description | Allowed Metadata |
|---|---|---|---|
| `user_signup_started` | Client Interaction | User opened OTP signup interface | `referralSource`, `channel` |
| `user_signup_completed` | Server Authoritative | User completed OTP verification & profile created | `role`, `authMethod` |
| `user_login_completed` | Server Authoritative | User authenticated via OTP challenge | `role`, `loginType` |
| `user_logout` | Client Interaction | User signed out from current device | `reason` |

---

## 2. Discovery, Search & Navigation
| Event Name | Source | Description | Allowed Metadata |
|---|---|---|---|
| `job_search_performed` | Client Interaction | Search query executed | `queryLength`, `hasLocationFilter`, `resultCount` |
| `job_filter_applied` | Client Interaction | Filter criteria toggled | `filterKey`, `wageType`, `radiusKm` |
| `job_viewed` | Client Interaction | Worker opened a job post details page | `jobId`, `category`, `source` |
| `recommendation_clicked`| Client Interaction | Worker clicked a recommended job | `jobId`, `position`, `recommendationEngine` |
| `voice_search_used` | Client Interaction | Worker used voice query | `queryLang`, `durationMs`, `success` |
| `language_switched` | Client Interaction | UI language toggled | `from`, `to` |

---

## 3. Worker Matching & Application
| Event Name | Source | Description | Allowed Metadata |
|---|---|---|---|
| `match_scored` | Server Authoritative | Worker & job matched via PostGIS distance | `jobId`, `workerId`, `matchScore` |
| `application_submitted` | Server Authoritative | Worker applied to an open job | `jobId`, `workerId`, `hasBid` |
| `application_shortlisted` | Server Authoritative | Employer shortlisted worker application | `jobId`, `applicationId` |
| `application_accepted` | Server Authoritative | Employer hired applicant | `jobId`, `applicationId` |
| `application_withdrawn` | Client Interaction / Server | Worker retracted application | `jobId`, `reason` |

---

## 4. Booking & Fulfillment
| Event Name | Source | Description | Allowed Metadata |
|---|---|---|---|
| `booking_offered` | Server Authoritative | Contract offered to worker | `bookingId`, `wageType` |
| `booking_accepted` | Server Authoritative | Worker confirmed booking | `bookingId`, `startDate` |
| `booking_started` | Server Authoritative | Job check-in initiated | `bookingId` |
| `booking_completed` | Server Authoritative | Job marked completed | `bookingId`, `totalHours` |
| `booking_disputed` | Server Authoritative | Formal dispute lodged | `bookingId`, `disputeReason` |

---

## 5. Payments & Financial Health
| Event Name | Source | Description | Allowed Metadata |
|---|---|---|---|
| `payment_intent_created` | Server Authoritative | Order initialized | `amountInr`, `currency` |
| `payment_captured` | Server Authoritative | Payment settled successfully | `amountInr`, `providerMethod` |
| `payment_failed` | Server Authoritative | Payment failed | `errorCode`, `reason` |
| `refund_settled` | Server Authoritative | Refund credited to payer | `amountInr`, `refundId` |
| `payout_disbursed` | Server Authoritative | Payout transferred to worker account | `amountInr`, `payoutId` |

---

## 6. Prohibited Sensitive Metadata Fields
The following keys are **strictly blocked or redacted** by the sanitizer:
- `password`, `token`, `refreshtoken`, `accesstoken`, `authorization`, `secret`
- `otp`, `otphash`
- `card`, `cardnumber`, `cvv`, `expiry`
- `pan`, `aadhaar`, `rawdocument`, `documenturl`
- `messagecontent`, `messagebody`
