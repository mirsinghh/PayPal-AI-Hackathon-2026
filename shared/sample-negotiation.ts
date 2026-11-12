import type { NegotiationSession } from "@/shared/contracts/types";

/**
 * A frozen run of the REAL rule engine (server/negotiation: buildScenario + rankOffers + composeEvents) for one fixed
 * request, seed 42. It is what the home page replays, and it is always labelled as a sample: it is not the visitor's
 * request and nothing in it is live. tests/sample-negotiation.test.ts fails if the engine's output drifts from it.
 */
export const SAMPLE_NEGOTIATION: NegotiationSession = {
  "sessionId": "sample",
  "createdAt": "2026-01-01T12:00:00.000Z",
  "expiresAt": "2026-01-02T12:00:00.000Z",
  "status": "ready",
  "intent": {
    "productQuery": "Wireless noise-cancelling headphones",
    "budgetCents": 30000,
    "currency": "EUR",
    "priority": "best_value",
    "preferences": [
      "warranty"
    ],
    "language": "en"
  },
  "offers": [
    {
      "offerId": "off_a4753e4e-71d4-4331-8eec-5837ffed20ea",
      "sessionId": "sample",
      "sellerId": "nova",
      "productLabel": "Wireless noise-cancelling headphones",
      "initialPriceCents": 27122,
      "finalPriceCents": 24060,
      "minPriceCents": 23868,
      "discountCents": 3062,
      "deliveryDays": 6,
      "warrantyMonths": 12,
      "freeShipping": false,
      "eligible": true,
      "ineligibilityReasons": [],
      "offerExpiresAt": "2026-01-01T12:30:00.000Z",
      "policyVersion": "2026-11-v1"
    },
    {
      "offerId": "off_84d3915c-db8c-4ea9-b368-a81509d4b43f",
      "sessionId": "sample",
      "sellerId": "orbit",
      "productLabel": "Wireless noise-cancelling headphones",
      "initialPriceCents": 28208,
      "finalPriceCents": 26699,
      "minPriceCents": 25952,
      "discountCents": 1509,
      "deliveryDays": 1,
      "warrantyMonths": 12,
      "freeShipping": true,
      "eligible": true,
      "ineligibilityReasons": [],
      "offerExpiresAt": "2026-01-01T12:30:00.000Z",
      "policyVersion": "2026-11-v1"
    },
    {
      "offerId": "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d",
      "sessionId": "sample",
      "sellerId": "prism",
      "productLabel": "Wireless noise-cancelling headphones",
      "initialPriceCents": 29170,
      "finalPriceCents": 28138,
      "minPriceCents": 27712,
      "discountCents": 1032,
      "deliveryDays": 4,
      "warrantyMonths": 36,
      "freeShipping": true,
      "eligible": true,
      "ineligibilityReasons": [],
      "offerExpiresAt": "2026-01-01T12:30:00.000Z",
      "policyVersion": "2026-11-v1"
    },
    {
      "offerId": "off_ad408e3a-ecca-4054-839a-945174dc0225",
      "sessionId": "sample",
      "sellerId": "vertex",
      "productLabel": "Wireless noise-cancelling headphones",
      "initialPriceCents": 31536,
      "finalPriceCents": 30644,
      "minPriceCents": 30590,
      "discountCents": 892,
      "deliveryDays": 3,
      "warrantyMonths": 24,
      "freeShipping": false,
      "eligible": false,
      "ineligibilityReasons": [
        "over_budget"
      ],
      "offerExpiresAt": "2026-01-01T12:30:00.000Z",
      "policyVersion": "2026-11-v1"
    }
  ],
  "events": [
    {
      "eventId": "evt_9912aa6c-9582-47e7-95a8-c57b0bcc7129",
      "sessionId": "sample",
      "sequence": 0,
      "atMs": 500,
      "phase": "initialize",
      "type": "AGENT_INITIALIZED",
      "sellerId": null,
      "payload": {
        "productQuery": "Wireless noise-cancelling headphones",
        "budgetCents": 30000
      },
      "feedText": "Your agent is looking for \"Wireless noise-cancelling headphones\" with a maximum budget of €300.00."
    },
    {
      "eventId": "evt_9d05e756-0e6d-40a2-83ca-eb251a698f76",
      "sessionId": "sample",
      "sequence": 1,
      "atMs": 4500,
      "phase": "discover",
      "type": "SELLER_DISCOVERED",
      "sellerId": "nova",
      "payload": {
        "sellerId": "nova",
        "strategy": "price_fighter"
      },
      "feedText": "Brisa Outlet joined the simulated negotiation."
    },
    {
      "eventId": "evt_be91a1e5-6d58-44b5-a083-7f36bdfdbb60",
      "sessionId": "sample",
      "sequence": 2,
      "atMs": 5900,
      "phase": "discover",
      "type": "SELLER_DISCOVERED",
      "sellerId": "orbit",
      "payload": {
        "sellerId": "orbit",
        "strategy": "fast_delivery"
      },
      "feedText": "Zefiro Express joined the simulated negotiation."
    },
    {
      "eventId": "evt_a3641ec5-4617-4efb-971a-02bd39fcd2b4",
      "sessionId": "sample",
      "sequence": 3,
      "atMs": 7300,
      "phase": "discover",
      "type": "SELLER_DISCOVERED",
      "sellerId": "prism",
      "payload": {
        "sellerId": "prism",
        "strategy": "premium_value"
      },
      "feedText": "Atelier Norden joined the simulated negotiation."
    },
    {
      "eventId": "evt_1edfb255-adc5-4b96-83e0-eab58c577cc0",
      "sessionId": "sample",
      "sequence": 4,
      "atMs": 8700,
      "phase": "discover",
      "type": "SELLER_DISCOVERED",
      "sellerId": "vertex",
      "payload": {
        "sellerId": "vertex",
        "strategy": "hard_negotiator"
      },
      "feedText": "Korvan Direct joined the simulated negotiation."
    },
    {
      "eventId": "evt_0170412a-1816-4e2a-bf31-ed28bb523550",
      "sessionId": "sample",
      "sequence": 5,
      "atMs": 10500,
      "phase": "offers",
      "type": "OFFER_RECEIVED",
      "sellerId": "nova",
      "payload": {
        "offerId": "off_a4753e4e-71d4-4331-8eec-5837ffed20ea",
        "initialPriceCents": 27122
      },
      "feedText": "Brisa Outlet opened at €271.22."
    },
    {
      "eventId": "evt_acc1ee07-adb7-4407-b14a-61d03a649da2",
      "sessionId": "sample",
      "sequence": 6,
      "atMs": 12700,
      "phase": "offers",
      "type": "OFFER_RECEIVED",
      "sellerId": "orbit",
      "payload": {
        "offerId": "off_84d3915c-db8c-4ea9-b368-a81509d4b43f",
        "initialPriceCents": 28208
      },
      "feedText": "Zefiro Express opened at €282.08."
    },
    {
      "eventId": "evt_f232f913-4c86-4dd7-914b-37b3f3e74ca2",
      "sessionId": "sample",
      "sequence": 7,
      "atMs": 14900,
      "phase": "offers",
      "type": "OFFER_RECEIVED",
      "sellerId": "prism",
      "payload": {
        "offerId": "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d",
        "initialPriceCents": 29170
      },
      "feedText": "Atelier Norden opened at €291.70."
    },
    {
      "eventId": "evt_e9ab174f-a6a8-4c77-a13f-fbae61041e8a",
      "sessionId": "sample",
      "sequence": 8,
      "atMs": 17100,
      "phase": "offers",
      "type": "OFFER_RECEIVED",
      "sellerId": "vertex",
      "payload": {
        "offerId": "off_ad408e3a-ecca-4054-839a-945174dc0225",
        "initialPriceCents": 31536
      },
      "feedText": "Korvan Direct opened at €315.36."
    },
    {
      "eventId": "evt_bc331306-4d21-40f9-b1f3-1f53e0af0b52",
      "sessionId": "sample",
      "sequence": 9,
      "atMs": 20500,
      "phase": "negotiate",
      "type": "BUYER_MESSAGE",
      "sellerId": "nova",
      "payload": {
        "sellerId": "nova",
        "message": "Can you improve your price within my budget?"
      },
      "feedText": "Your agent asked Brisa Outlet to improve its price."
    },
    {
      "eventId": "evt_a5bc3b2e-ba53-4379-94b4-37c776381fe3",
      "sessionId": "sample",
      "sequence": 10,
      "atMs": 22500,
      "phase": "negotiate",
      "type": "COUNTEROFFER_RECEIVED",
      "sellerId": "nova",
      "payload": {
        "offerId": "off_a4753e4e-71d4-4331-8eec-5837ffed20ea",
        "previousPriceCents": 27122,
        "newPriceCents": 24060,
        "message": "Best I can do is €240.60."
      },
      "feedText": "Brisa Outlet made a new offer: €240.60 (was €271.22)."
    },
    {
      "eventId": "evt_c170da98-5028-46fa-8e71-39e2c0642146",
      "sessionId": "sample",
      "sequence": 11,
      "atMs": 24900,
      "phase": "negotiate",
      "type": "BUYER_MESSAGE",
      "sellerId": "orbit",
      "payload": {
        "sellerId": "orbit",
        "message": "Can you improve your price within my budget?"
      },
      "feedText": "Your agent asked Zefiro Express to improve its price."
    },
    {
      "eventId": "evt_4fc7d9d9-79b9-492e-9ae2-4cee488f012b",
      "sessionId": "sample",
      "sequence": 12,
      "atMs": 26900,
      "phase": "negotiate",
      "type": "COUNTEROFFER_RECEIVED",
      "sellerId": "orbit",
      "payload": {
        "offerId": "off_84d3915c-db8c-4ea9-b368-a81509d4b43f",
        "previousPriceCents": 28208,
        "newPriceCents": 26699,
        "message": "Best I can do is €266.99."
      },
      "feedText": "Zefiro Express made a new offer: €266.99 (was €282.08)."
    },
    {
      "eventId": "evt_0931e395-f7d8-4e02-944d-7b5646668d5c",
      "sessionId": "sample",
      "sequence": 13,
      "atMs": 29300,
      "phase": "negotiate",
      "type": "BUYER_MESSAGE",
      "sellerId": "prism",
      "payload": {
        "sellerId": "prism",
        "message": "Can you improve your price within my budget?"
      },
      "feedText": "Your agent asked Atelier Norden to improve its price."
    },
    {
      "eventId": "evt_92073c05-8868-4471-8b1a-bf55094b2a5c",
      "sessionId": "sample",
      "sequence": 14,
      "atMs": 31300,
      "phase": "negotiate",
      "type": "COUNTEROFFER_RECEIVED",
      "sellerId": "prism",
      "payload": {
        "offerId": "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d",
        "previousPriceCents": 29170,
        "newPriceCents": 28138,
        "message": "Best I can do is €281.38."
      },
      "feedText": "Atelier Norden made a new offer: €281.38 (was €291.70)."
    },
    {
      "eventId": "evt_020f3307-973e-4ce7-a183-6e1f97a0842d",
      "sessionId": "sample",
      "sequence": 15,
      "atMs": 33700,
      "phase": "negotiate",
      "type": "BUYER_MESSAGE",
      "sellerId": "vertex",
      "payload": {
        "sellerId": "vertex",
        "message": "Can you improve your price within my budget?"
      },
      "feedText": "Your agent asked Korvan Direct to improve its price."
    },
    {
      "eventId": "evt_80c874ce-b421-45f7-8999-7fe6336d137b",
      "sessionId": "sample",
      "sequence": 16,
      "atMs": 35700,
      "phase": "negotiate",
      "type": "COUNTEROFFER_RECEIVED",
      "sellerId": "vertex",
      "payload": {
        "offerId": "off_ad408e3a-ecca-4054-839a-945174dc0225",
        "previousPriceCents": 31536,
        "newPriceCents": 30644,
        "message": "Best I can do is €306.44."
      },
      "feedText": "Korvan Direct made a new offer: €306.44 (was €315.36)."
    },
    {
      "eventId": "evt_372efc66-8d38-46db-b5bf-5deaf4ab2cf6",
      "sessionId": "sample",
      "sequence": 17,
      "atMs": 38500,
      "phase": "evaluate",
      "type": "REQUIREMENT_VERIFIED",
      "sellerId": "nova",
      "payload": {
        "offerId": "off_a4753e4e-71d4-4331-8eec-5837ffed20ea",
        "requirement": "within_budget",
        "passed": true
      },
      "feedText": "Brisa Outlet is within your budget."
    },
    {
      "eventId": "evt_7d9954d3-7994-4a9b-80c9-f2397a703ae3",
      "sessionId": "sample",
      "sequence": 18,
      "atMs": 39100,
      "phase": "evaluate",
      "type": "OFFER_EVALUATED",
      "sellerId": "nova",
      "payload": {
        "offerId": "off_a4753e4e-71d4-4331-8eec-5837ffed20ea",
        "score": 45,
        "reason": "eligible"
      },
      "feedText": "Brisa Outlet scored 45/100 for your priorities."
    },
    {
      "eventId": "evt_49c709e6-a539-4b23-92f9-b8fc607dbe67",
      "sessionId": "sample",
      "sequence": 19,
      "atMs": 40200,
      "phase": "evaluate",
      "type": "REQUIREMENT_VERIFIED",
      "sellerId": "orbit",
      "payload": {
        "offerId": "off_84d3915c-db8c-4ea9-b368-a81509d4b43f",
        "requirement": "within_budget",
        "passed": true
      },
      "feedText": "Zefiro Express is within your budget."
    },
    {
      "eventId": "evt_b1df162f-335c-4c56-8958-fc492ff4917f",
      "sessionId": "sample",
      "sequence": 20,
      "atMs": 40800,
      "phase": "evaluate",
      "type": "OFFER_EVALUATED",
      "sellerId": "orbit",
      "payload": {
        "offerId": "off_84d3915c-db8c-4ea9-b368-a81509d4b43f",
        "score": 52,
        "reason": "eligible"
      },
      "feedText": "Zefiro Express scored 52/100 for your priorities."
    },
    {
      "eventId": "evt_35f3d0e5-b587-452f-b568-9a4a52a861a8",
      "sessionId": "sample",
      "sequence": 21,
      "atMs": 41900,
      "phase": "evaluate",
      "type": "REQUIREMENT_VERIFIED",
      "sellerId": "prism",
      "payload": {
        "offerId": "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d",
        "requirement": "within_budget",
        "passed": true
      },
      "feedText": "Atelier Norden is within your budget."
    },
    {
      "eventId": "evt_4d0a2fc1-ec33-47ca-a4e6-57ffa6d0a177",
      "sessionId": "sample",
      "sequence": 22,
      "atMs": 42500,
      "phase": "evaluate",
      "type": "OFFER_EVALUATED",
      "sellerId": "prism",
      "payload": {
        "offerId": "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d",
        "score": 57,
        "reason": "eligible"
      },
      "feedText": "Atelier Norden scored 57/100 for your priorities."
    },
    {
      "eventId": "evt_2993c95a-d334-4cb3-bf88-8bc6963c721b",
      "sessionId": "sample",
      "sequence": 23,
      "atMs": 43600,
      "phase": "evaluate",
      "type": "REQUIREMENT_VERIFIED",
      "sellerId": "vertex",
      "payload": {
        "offerId": "off_ad408e3a-ecca-4054-839a-945174dc0225",
        "requirement": "within_budget",
        "passed": false
      },
      "feedText": "Korvan Direct exceeds your budget."
    },
    {
      "eventId": "evt_70bf3948-6e80-41a9-845d-7d31c4a0903e",
      "sessionId": "sample",
      "sequence": 24,
      "atMs": 44200,
      "phase": "evaluate",
      "type": "SELLER_REJECTED",
      "sellerId": "vertex",
      "payload": {
        "offerId": "off_ad408e3a-ecca-4054-839a-945174dc0225",
        "reasonCode": "over_budget"
      },
      "feedText": "Korvan Direct was set aside: exceeds your budget."
    },
    {
      "eventId": "evt_ae27ec2d-b3e0-4373-8e5a-9b0f812bb949",
      "sessionId": "sample",
      "sequence": 25,
      "atMs": 47000,
      "phase": "complete",
      "type": "WINNER_SELECTED",
      "sellerId": "prism",
      "payload": {
        "offerId": "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d",
        "reason": "best_match"
      },
      "feedText": "Best match for your preferences: Atelier Norden at €281.38."
    },
    {
      "eventId": "evt_cac16438-2c7a-414a-a3a3-852b2443f50b",
      "sessionId": "sample",
      "sequence": 26,
      "atMs": 51500,
      "phase": "complete",
      "type": "NEGOTIATION_COMPLETE",
      "sellerId": null,
      "payload": {
        "recommendedOfferId": "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d"
      },
      "feedText": "Negotiation complete. Review the deal before paying."
    }
  ],
  "evaluation": {
    "rankedOfferIds": [
      "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d",
      "off_84d3915c-db8c-4ea9-b368-a81509d4b43f",
      "off_a4753e4e-71d4-4331-8eec-5837ffed20ea"
    ],
    "recommendedOfferId": "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d",
    "scores": {
      "off_a4753e4e-71d4-4331-8eec-5837ffed20ea": 45,
      "off_84d3915c-db8c-4ea9-b368-a81509d4b43f": 52,
      "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d": 57,
      "off_ad408e3a-ecca-4054-839a-945174dc0225": 30
    },
    "validatedAt": "2026-11-11T23:11:45.701Z",
    "aiSummary": "Atelier Norden scored highest for your \"best value\" priority at €281.38.",
    "aiReasons": [
      "Final price €281.38 is within your €300.00 budget.",
      "Delivery in 4 days with 36 months of simulated warranty."
    ],
    "tradeoffs": [
      "Korvan Direct exceeded your budget."
    ],
    "source": "rules_fallback",
    "modelName": null,
    "evaluationId": "eval_56b76372-1240-4acc-9a00-43c8ef97980d",
    "sessionId": "sample"
  },
  "recommendedOfferId": "off_02a98c81-1ed2-4d60-9c40-5b763b251b1d",
  "approvedOfferId": null,
  "approvedAt": null,
  "aiStatus": "fallback",
  "schemaVersion": "1.0",
  "mode": "v0_rules",
  "fallbackReason": null
};
