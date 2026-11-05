// Generated from contracts/openapi-mvp.yaml. Run pnpm contracts:generate.
// Future operations are DESIGN ONLY; M1 implements getHealth only.
export interface Schemas {
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
  "getMe": { method: "GET"; path: "/me"; body: never; response: Record<string, unknown> };
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
