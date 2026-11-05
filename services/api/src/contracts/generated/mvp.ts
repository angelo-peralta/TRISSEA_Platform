// Generated from contracts/openapi-mvp.yaml. Run pnpm contracts:generate.
// Only x-implemented-in operations are implemented; M2.3 requires the local-synthetic flag.
export interface Schemas {
  "FutureObject": Record<string, unknown>;
  "PhoneChallengeRequest": { "phone": string; "clientPurpose": "PASSENGER"; "deviceId": string; "clientProof": string; };
  "PhoneChallengeResponse": { "challengeId": string; "expiresAt": string; "resendAfter": string; "clientPurpose": "PASSENGER"; "deliveryMode": "MOCK"; };
  "PhoneChallengeStatus": { "challengeId": string; "expiresAt": string; "resendAfter": string; "clientPurpose": "PASSENGER"; "deliveryMode": "MOCK"; "state": "PENDING" | "EXPIRED" | "COMPLETED"; };
  "PhoneVerifyRequest": { "phone": string; "clientPurpose": "PASSENGER"; "deviceId": string; "clientProof": string; "code": string; };
  "MobileRefreshRequest": { "clientPurpose": "PASSENGER"; "deviceId": string; "clientProof": string; "refreshToken": string; };
  "MobileAuthResult": { "accessToken": string; "accessTokenExpiresAt": string; "refreshToken": string; "tokenType": "Bearer"; "userId": string; "sessionId": string; "clientPurpose": "PASSENGER"; };
  "PassengerProfile": { "userId": string; "sessionId": string; "clientPurpose": "PASSENGER"; "state": "CONSENT_REQUIRED" | "ACTIVE"; "displayName": string | null; "profileVersion": number; "requiredNoticeVersion": string; "requiredTermsVersion": string; "operationsEnabled": false; "environment": "LOCAL_SYNTHETIC"; };
  "PassengerProfileUpdate": { "displayName": string | null; "expectedVersion": number; };
  "PassengerConsentRequest": { "noticeVersion": "local-synthetic-notice-v1"; "termsVersion": "local-synthetic-terms-v1"; "noticeAcknowledged": true; "termsAccepted": true; };
  "PassengerSessionList": { "sessions": Array<{ "id": string; "state": "PREAUTH" | "CONSENT_REQUIRED" | "ACTIVE" | "REVOKED" | "EXPIRED"; "lastSeenAt": string; "expiresAt": string; "current": boolean; }>; };
  "EmptyMutation": Record<string, never>;
  "PhoneAuthError": { "code": "INVALID_REQUEST" | "AUTH_FAILED" | "RATE_LIMITED" | "CONFLICT" | "UNAVAILABLE"; "message": string; };
  "HealthResponse": { "status": "ok"; "service": "trissea-api"; "milestone": "M1"; "bookingsEnabled": false; };
  "Error": { "code": string; "message": string; "traceId"?: string; };
  "Coords": { "longitude": number; "latitude": number; };
  "QuoteRequest": { "rideOption": "REGULAR" | "SHARED" | "SPECIAL"; "pickup": Schemas["Coords"]; "dropoff": Schemas["Coords"]; "seatsRequested"?: number; "fareCategory"?: "REGULAR" | "STUDENT_SENIOR_PWD"; "stops"?: Array<Schemas["Coords"]>; };
  "Quote": { "id": string; "rideOption": string; "totalCentavos": number; "currency": "PHP"; "expiresAt": string; "legalFareSourceId": string; "policyVersion": number; "breakdown"?: Record<string, unknown>; };
  "Ride": { "id": string; "status": string; "version": number; "fareSnapshot"?: Record<string, unknown>; "driver"?: Record<string, unknown> | null; };
  "FareDraft": { "sourceId": string; "serviceCode": "REGULAR" | "SHARED" | "SPECIAL" | "RESERVATION"; "reason": string; "rules": Array<Record<string, unknown>>; };
}
export interface Operations {
  "getHealth": { method: "GET"; path: "/health"; body: never; response: Schemas["HealthResponse"] };
  "requestPassengerOtp": { method: "POST"; path: "/auth/phone/challenges"; body: Schemas["PhoneChallengeRequest"]; response: Schemas["PhoneChallengeResponse"] };
  "verifyPassengerOtp": { method: "POST"; path: "/auth/phone/challenges/{challengeId}/verify"; body: Schemas["PhoneVerifyRequest"]; response: Schemas["MobileAuthResult"] };
  "getPassengerChallengeStatus": { method: "GET"; path: "/auth/phone/challenges/{challengeId}"; body: never; response: Schemas["PhoneChallengeStatus"] };
  "refreshPassengerSession": { method: "POST"; path: "/auth/mobile/refresh"; body: Schemas["MobileRefreshRequest"]; response: Schemas["MobileAuthResult"] };
  "listPassengerSessions": { method: "GET"; path: "/auth/sessions"; body: never; response: Schemas["PassengerSessionList"] };
  "revokePassengerSession": { method: "POST"; path: "/auth/sessions/{sessionId}/revoke"; body: Schemas["EmptyMutation"]; response: unknown };
  "logoutPassenger": { method: "POST"; path: "/auth/logout"; body: Schemas["EmptyMutation"]; response: unknown };
  "getMe": { method: "GET"; path: "/me"; body: never; response: Schemas["PassengerProfile"] };
  "updatePassengerProfile": { method: "PATCH"; path: "/me"; body: Schemas["PassengerProfileUpdate"]; response: Schemas["PassengerProfile"] };
  "recordPassengerConsent": { method: "POST"; path: "/me/consents"; body: Schemas["PassengerConsentRequest"]; response: Schemas["PassengerProfile"] };
  "getAvailableServices": { method: "GET"; path: "/services/available"; body: never; response: Record<string, unknown> };
  "createQuote": { method: "POST"; path: "/quotes"; body: Schemas["QuoteRequest"]; response: Schemas["Quote"] };
  "createRide": { method: "POST"; path: "/rides"; body: { "quoteId": string; }; response: Schemas["Ride"] };
  "getRide": { method: "GET"; path: "/rides/{rideId}"; body: never; response: Schemas["Ride"] };
  "cancelRide": { method: "POST"; path: "/rides/{rideId}/cancel"; body: { "reasonCode": string; }; response: Schemas["Ride"] };
  "transitionRide": { method: "POST"; path: "/rides/{rideId}/transitions"; body: { "action": "DRIVER_EN_ROUTE" | "DRIVER_ARRIVED" | "START_TRIP" | "COMPLETE_TRIP"; "expectedVersion": number; "pickupPin"?: string; }; response: Schemas["Ride"] };
  "getRideReceipt": { method: "GET"; path: "/rides/{rideId}/receipt"; body: never; response: Record<string, unknown> };
  "startOrEndShift": { method: "POST"; path: "/driver/shifts"; body: { "operation": "START" | "END"; "todaId"?: string; "vehicleId"?: string; }; response: Record<string, unknown> };
  "postDriverLocation": { method: "POST"; path: "/driver/locations"; body: { "longitude": number; "latitude": number; "capturedAt": string; "accuracyMeters"?: number; "sequence": number; }; response: Record<string, unknown> };
  "getDriverOffers": { method: "GET"; path: "/driver/offers"; body: never; response: Record<string, unknown> };
  "acceptDriverOffer": { method: "POST"; path: "/driver/offers/{offerId}/accept"; body: { "expectedVersion": number; }; response: Record<string, unknown> };
  "declineDriverOffer": { method: "POST"; path: "/driver/offers/{offerId}/decline"; body: { "reasonCode"?: string; }; response: Record<string, unknown> };
  "listFarePolicies": { method: "GET"; path: "/admin/fares"; body: never; response: Record<string, unknown> };
  "createFareDraft": { method: "POST"; path: "/admin/fares/drafts"; body: Schemas["FareDraft"]; response: Record<string, unknown> };
  "submitFareDraft": { method: "POST"; path: "/admin/fares/{policyId}/submit"; body: { "reason": string; }; response: Record<string, unknown> };
  "approveFareDraft": { method: "POST"; path: "/admin/fares/{policyId}/approve"; body: { "decision": "APPROVE" | "REJECT"; "reason": string; }; response: Record<string, unknown> };
  "listTodas": { method: "GET"; path: "/admin/todas"; body: never; response: Record<string, unknown> };
  "listOperationalRides": { method: "GET"; path: "/admin/rides"; body: never; response: Record<string, unknown> };
}
export type HealthResponse = Operations['getHealth']['response'];
