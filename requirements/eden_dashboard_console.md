11:43:27 PMwebsocket
Connected to Eden Simulator
11:43:27 PMwebsocket
Connected to Eden Simulator
11:43:36 PMuser
User query: "I want to BUY 2 SOLANA token A at 1 Token/SOL or with best price"
{
  "input": "I want to BUY 2 SOLANA token A at 1 Token/SOL or with best price",
  "email": "alice@gmail.com"
}
11:43:36 PMllm
Starting LLM query extraction...
11:43:36 PMllm🤖
Starting LLM query extraction... (Provider: openai | Model: gpt-4o-mini | Input: I want to BUY 2 SOLANA token A at 1 Token/SOL or w...)
LLM Provider: openai
Model: gpt-4o-mini
User Input: I want to BUY 2 SOLANA token A at 1 Token/SOL or with best price
System Prompt:

You are Eden Core AI query processor.
Extract service query from user input.
Return JSON only with: query (object with serviceType and filters), serviceType, confidence.

Service types: "movie" or "dex"

For movie queries:
Example: {"query": {"serviceType": "movie", "filters": {"location": "Baltimore", "maxPrice": 10}}, "serviceType": "movie", "confidence": 0.95}

For DEX token trading queries (BUY/SELL tokens):
- Extract tokenSymbol (e.g., "TOKENA", "TOKENB")
- Extract baseToken (e.g., "SOL", "USDC")
- Extract action: "BUY" or "SELL"
- Extract tokenAmount if specified
- Extract maxPrice if specified (e.g., "1 Token/SOL" means price <= 1)

Example: {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKENA", "baseToken": "SOL", "action": "BUY", "tokenAmount": 2, "maxPrice": 1}}, "serviceType": "dex", "confidence": 0.95}
11:43:39 PMllm✅
LLM query extraction completed (Provider: openai | ServiceType: dex | Confidence: 0.95)
LLM Provider: openai
Model: gpt-4o-mini
Extracted Query:
{
  "query": {
    "serviceType": "dex",
    "filters": {
      "tokenSymbol": "TOKENA",
      "baseToken": "SOL",
      "action": "BUY",
      "tokenAmount": 2,
      "maxPrice": 1
    }
  },
  "serviceType": "dex",
  "confidence": 0.95
}
LLM Response:
{
  "id": "chatcmpl-CrzOSZBCZo4qfAbR4D0YY530ClDMF",
  "object": "chat.completion",
  "created": 1766983416,
  "model": "gpt-4o-mini-2024-07-18",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\n  \"query\": {\n    \"serviceType\": \"dex\",\n    \"filters\": {\n      \"tokenSymbol\": \"TOKENA\",\n      \"baseToken\": \"SOL\",\n      \"action\": \"BUY\",\n      \"tokenAmount\": 2,\n      \"maxPrice\": 1\n    }\n  },\n  \"serviceType\": \"dex\",\n  \"confidence\": 0.95\n}",
        "refusal": null,
        "annotations": []
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 272,
    "completion_tokens": 81,
    "total_tokens": 353,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default",
  "system_fingerprint": "fp_8bbc38b4db"
}
11:43:39 PMservice-registry
Querying ServiceRegistry...
11:43:39 PMservice-registry
Found 2 service providers
{
  "providers": [
    {
      "id": "dex-pool-tokena",
      "name": "TOKENA Pool (TokenIndexer-T1)"
    },
    {
      "id": "dex-pool-tokenb",
      "name": "TOKENB Pool (TokenIndexer-T2)"
    }
  ]
}
11:43:39 PMdex-pool-tokena
Querying TOKENA Pool (TokenIndexer-T1) API...
11:43:39 PMdex-pool-tokenb
Querying TOKENB Pool (TokenIndexer-T2) API...
11:43:39 PMdex-pool-tokena
TOKENA Pool (TokenIndexer-T1) returned 1 listings
11:43:39 PMdex-pool-tokenb
TOKENB Pool (TokenIndexer-T2) returned 0 listings
11:43:39 PMllm📝
Starting LLM response formatting... (Provider: openai | Model: gpt-4o-mini | Listings: 1)
LLM Provider: openai
Model: gpt-4o-mini
System Prompt:

You are Eden Core AI response formatter.
Format service provider listings into user-friendly chat response.

Your responsibilities depend on serviceType:

FOR MOVIE SERVICE:
1. Filter listings based on user query filters (e.g., maxPrice, genre, time, location)
2. If maxPrice is "best" or "lowest", select listings with the lowest price
3. If maxPrice is a number, only include listings with price <= maxPrice
4. Apply other filters (genre, time, location) as specified
5. Format the filtered results into a user-friendly message
6. Select the best option based on user criteria (best price, best rating, etc.)

IMPORTANT: When returning selectedListing, you MUST include ALL fields from the original listing, especially providerId (e.g., "amc-001", "moviecom-001", "cinemark-001").

FOR DEX TOKEN SERVICE:
1. Filter token pools based on tokenSymbol, baseToken, and action (BUY/SELL)
2. If maxPrice is specified (e.g., "1 Token/SOL"), only include pools with price <= maxPrice
3. If action is "BUY", find pools where user can buy tokens with baseToken
4. If action is "SELL", find pools where user can sell tokens for baseToken
5. Select the best pool based on price and liquidity
6. Format the results showing: token symbol, price, liquidity, pool provider

IMPORTANT: When returning selectedListing for DEX, you MUST include ALL fields: poolId, providerId, tokenSymbol, baseToken, price, liquidity, indexerId.

Return JSON with: message (string), listings (array of filtered listings), selectedListing (best option with ALL original fields including providerId/poolId, or null).
Listings Count: 1
11:43:44 PMllm✅
LLM response formatting completed (Provider: openai | Listings: 1 | Selected: TOKENA Pool (TokenIndexer-T1))
LLM Provider: openai
Model: gpt-4o-mini
Formatted Message: I found a great option for you to buy 2 SOLANA token A at a very low price!
Selected Listing:
{
  "poolId": "pool-solana-tokena",
  "providerId": "dex-pool-tokena",
  "providerName": "TOKENA Pool (TokenIndexer-T1)",
  "tokenSymbol": "TOKENA",
  "tokenName": "Token A",
  "baseToken": "SOL",
  "price": 0.001,
  "liquidity": 100,
  "volume24h": 0,
  "indexerId": "T1"
}
Listings Count: 1
LLM Response:
{
  "id": "chatcmpl-CrzOVpT0Nl4dRNrjSKLbg11zTlOef",
  "object": "chat.completion",
  "created": 1766983419,
  "model": "gpt-4o-mini-2024-07-18",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\n  \"message\": \"I found a great option for you to buy 2 SOLANA token A at a very low price!\",\n  \"listings\": [\n    {\n      \"poolId\": \"pool-solana-tokena\",\n      \"providerId\": \"dex-pool-tokena\",\n      \"providerName\": \"TOKENA Pool (TokenIndexer-T1)\",\n      \"tokenSymbol\": \"TOKENA\",\n      \"tokenName\": \"Token A\",\n      \"baseToken\": \"SOL\",\n      \"price\": 0.001,\n      \"liquidity\": 100,\n      \"volume24h\": 0,\n      \"indexerId\": \"T1\"\n    }\n  ],\n  \"selectedListing\": {\n    \"poolId\": \"pool-solana-tokena\",\n    \"providerId\": \"dex-pool-tokena\",\n    \"providerName\": \"TOKENA Pool (TokenIndexer-T1)\",\n    \"tokenSymbol\": \"TOKENA\",\n    \"tokenName\": \"Token A\",\n    \"baseToken\": \"SOL\",\n    \"price\": 0.001,\n    \"liquidity\": 100,\n    \"volume24h\": 0,\n    \"indexerId\": \"T1\"\n  }\n}",
        "refusal": null,
        "annotations": []
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 529,
    "completion_tokens": 252,
    "total_tokens": 781,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default",
  "system_fingerprint": "fp_29330a9688"
}
11:43:44 PMllm
I found a great option for you to buy 2 SOLANA token A at a very low price!
LLM Response:
{
  "message": "I found a great option for you to buy 2 SOLANA token A at a very low price!",
  "listings": [
    {
      "poolId": "pool-solana-tokena",
      "providerId": "dex-pool-tokena",
      "providerName": "TOKENA Pool (TokenIndexer-T1)",
      "tokenSymbol": "TOKENA",
      "tokenName": "Token A",
      "baseToken": "SOL",
      "price": 0.001,
      "liquidity": 100,
      "volume24h": 0,
      "indexerId": "T1"
    }
  ],
  "selectedListing": {
    "poolId": "pool-solana-tokena",
    "providerId": "dex-pool-tokena",
    "providerName": "TOKENA Pool (TokenIndexer-T1)",
    "tokenSymbol": "TOKENA",
    "tokenName": "Token A",
    "baseToken": "SOL",
    "price": 0.001,
    "liquidity": 100,
    "volume24h": 0,
    "indexerId": "T1"
  },
  "iGasCost": 0.0049499999999999995
}
11:43:44 PMigas
iGas Cost: 0.004950
{
  "igas": 0.0049499999999999995
}
11:43:44 PMllm🤖
Starting LLM query extraction... (Provider: openai | Model: gpt-4o-mini | Input: I want to BUY 2 SOLANA token A at 1 Token/SOL or w...)
LLM Provider: openai
Model: gpt-4o-mini
User Input: I want to BUY 2 SOLANA token A at 1 Token/SOL or with best price
System Prompt:

You are Eden Core AI query processor.
Extract service query from user input.
Return JSON only with: query (object with serviceType and filters), serviceType, confidence.

Service types: "movie" or "dex"

For movie queries:
Example: {"query": {"serviceType": "movie", "filters": {"location": "Baltimore", "maxPrice": 10}}, "serviceType": "movie", "confidence": 0.95}

For DEX token trading queries (BUY/SELL tokens):
- Extract tokenSymbol (e.g., "TOKENA", "TOKENB")
- Extract baseToken (e.g., "SOL", "USDC")
- Extract action: "BUY" or "SELL"
- Extract tokenAmount if specified
- Extract maxPrice if specified (e.g., "1 Token/SOL" means price <= 1)

Example: {"query": {"serviceType": "dex", "filters": {"tokenSymbol": "TOKENA", "baseToken": "SOL", "action": "BUY", "tokenAmount": 2, "maxPrice": 1}}, "serviceType": "dex", "confidence": 0.95}
11:43:46 PMllm✅
LLM query extraction completed (Provider: openai | ServiceType: dex | Confidence: 0.95)
LLM Provider: openai
Model: gpt-4o-mini
Extracted Query:
{
  "query": {
    "serviceType": "dex",
    "filters": {
      "tokenSymbol": "SOLANA",
      "baseToken": "TOKENA",
      "action": "BUY",
      "tokenAmount": 2,
      "maxPrice": 1
    }
  },
  "serviceType": "dex",
  "confidence": 0.95
}
LLM Response:
{
  "id": "chatcmpl-CrzOabr6UMtdQYmG7vOHkjb7bKWgS",
  "object": "chat.completion",
  "created": 1766983424,
  "model": "gpt-4o-mini-2024-07-18",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "{\n  \"query\": {\n    \"serviceType\": \"dex\",\n    \"filters\": {\n      \"tokenSymbol\": \"SOLANA\",\n      \"baseToken\": \"TOKENA\",\n      \"action\": \"BUY\",\n      \"tokenAmount\": 2,\n      \"maxPrice\": 1\n    }\n  },\n  \"serviceType\": \"dex\",\n  \"confidence\": 0.95\n}",
        "refusal": null,
        "annotations": []
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 272,
    "completion_tokens": 82,
    "total_tokens": 354,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default",
  "system_fingerprint": "fp_8bbc38b4db"
}
11:43:46 PMdex💰
DEX Trade: BUY 2 TOKENA
{
  "trade": {
    "tradeId": "b1feb106-4a89-44b1-b801-e55298dedda1",
    "poolId": "pool-solana-tokena",
    "tokenSymbol": "TOKENA",
    "baseToken": "SOL",
    "action": "BUY",
    "tokenAmount": 2,
    "baseAmount": 0.002000060001200024,
    "price": 0.00100004000140004,
    "priceImpact": 0.00001,
    "iTax": 1.0000300006000122e-8,
    "timestamp": 1766983426606,
    "trader": "alice@gmail.com"
  },
  "iTaxDistribution": {
    "rootCA": 4.0001200024000485e-9,
    "indexer": 3.0000900018000365e-9,
    "trader": 3.0000900018000365e-9
  },
  "poolState": {
    "price": 0.00100004000140004,
    "liquidity": 100.001,
    "totalVolume": 0.002000060001200024,
    "totalTrades": 1
  },
  "rootCALiquidity": 1000.0000000040001
}
Trade ID: b1feb106-4a89-44b1-b801-e55298dedda1
Action: BUY
Token: 2 TOKENA
Base Amount: 0.002000 SOL
Price: 0.001000 SOL/TOKENA
Price Impact: 0.001%
iTax: 0.000000 SOL
Pool ID: pool-solana-tokena
iTax Distribution:
ROOT CA: 0.000000 (40%)
Indexer: 0.000000 (30%)
Trader: 0.000000 (30%)
Pool State:
Price: 0.001000
Liquidity: 100.00 SOL
Total Volume: 0.00 SOL
Total Trades: 1
ROOT CA Liquidity: 1000.00 SOL
11:43:46 PMledger
Ledger entry created: f902469d-5b45-4b52-8f0c-2e65f3907881
{
  "entry": {
    "entryId": "f902469d-5b45-4b52-8f0c-2e65f3907881",
    "txId": "61bfea9b-1e20-4df4-b2b3-2053b14e3fa5",
    "timestamp": 1766983426608,
    "payer": "alice@gmail.com",
    "payerId": "alice@gmail.com",
    "merchant": "TOKENA Pool (TokenIndexer-T1)",
    "providerUuid": "93e218ba-0d27-49e1-8320-23cc06ad2808",
    "serviceType": "dex",
    "amount": 0.002000060001200024,
    "iGasCost": 0.0049499999999999995,
    "fees": {
      "rootCA": 0.00004000120002400048,
      "indexerA": 0.00001000030000600012,
      "indexerB": 0.00001000030000600012
    },
    "status": "pending",
    "cashierId": "cashier-eden-001",
    "bookingDetails": {
      "tokenSymbol": "TOKENA",
      "baseToken": "SOL",
      "action": "BUY",
      "tokenAmount": 2,
      "baseAmount": 0.002000060001200024,
      "price": 0.00100004000140004,
      "iTax": 1.0000300006000122e-8
    }
  }
}
11:43:46 PMledger
Booking completed: f902469d-5b45-4b52-8f0c-2e65f3907881
{
  "entry": {
    "entryId": "f902469d-5b45-4b52-8f0c-2e65f3907881",
    "txId": "61bfea9b-1e20-4df4-b2b3-2053b14e3fa5",
    "timestamp": 1766983426608,
    "payer": "alice@gmail.com",
    "payerId": "alice@gmail.com",
    "merchant": "TOKENA Pool (TokenIndexer-T1)",
    "providerUuid": "93e218ba-0d27-49e1-8320-23cc06ad2808",
    "serviceType": "dex",
    "amount": 0.002000060001200024,
    "iGasCost": 0.0049499999999999995,
    "fees": {
      "rootCA": 0.00004000120002400048,
      "indexerA": 0.00001000030000600012,
      "indexerB": 0.00001000030000600012
    },
    "status": "completed",
    "cashierId": "cashier-eden-001",
    "bookingDetails": {
      "tokenSymbol": "TOKENA",
      "baseToken": "SOL",
      "action": "BUY",
      "tokenAmount": 2,
      "baseAmount": 0.002000060001200024,
      "price": 0.00100004000140004,
      "iTax": 1.0000300006000122e-8
    }
  }
}
11:43:46 PMindexer📤
Streamed transaction to 3 regular indexer(s) ( | TX: 61bfea9b... | Indexers: Indexer-A, Indexer-B, Indexer-C | Count: 3)
Transaction: 61bfea9b-1e20-4df4-b2b3-2053b14e3fa5
Indexers: Indexer-A, Indexer-B, Indexer-C
Count: 3
11:43:46 PMtoken_indexer🔷
Streamed transaction to 2 token indexer(s) ( | TX: 61bfea9b... | Indexers: TokenIndexer-T1, TokenIndexer-T2 | Count: 2)
Transaction: 61bfea9b-1e20-4df4-b2b3-2053b14e3fa5
Indexers: TokenIndexer-T1, TokenIndexer-T2
Count: 2
11:43:46 PMservice_provider📤
Webhook Delivery Attempt: dex-pool-tokena (Provider: dex-pool-tokena | TX: 61bfea9b...)
Provider: dex-pool-tokena
Transaction: 61bfea9b-1e20-4df4-b2b3-2053b14e3fa5
Webhook: http://localhost:3000/mock/webhook/dex-pool-tokena
11:43:46 PMdex💰
DEX Trade Complete: BUY 2 TOKENA
{
  "trade": {
    "tradeId": "b1feb106-4a89-44b1-b801-e55298dedda1",
    "poolId": "pool-solana-tokena",
    "tokenSymbol": "TOKENA",
    "baseToken": "SOL",
    "action": "BUY",
    "tokenAmount": 2,
    "baseAmount": 0.002000060001200024,
    "price": 0.00100004000140004,
    "priceImpact": 0.00001,
    "iTax": 1.0000300006000122e-8,
    "timestamp": 1766983426606,
    "trader": "alice@gmail.com"
  },
  "traderRebate": 3.0000900018000365e-9,
  "userBalance": 49.99799994299889,
  "rootCALiquidity": 1000.0000000040001
}
Trade ID: b1feb106-4a89-44b1-b801-e55298dedda1
Action: BUY
Token: 2 TOKENA
Base Amount: 0.002000 SOL
Price: 0.001000 SOL/TOKENA
Price Impact: 0.001%
iTax: 0.000000 SOL
Pool ID: pool-solana-tokena
ROOT CA Liquidity: 1000.00 SOL
Trader Rebate: 0.000000
User Balance: 50.00
11:43:46 PMservice_provider📥
Mock Webhook Received: dex-pool-tokena
Provider: dex-pool-tokena
Transaction: 61bfea9b-1e20-4df4-b2b3-2053b14e3fa5
11:43:46 PMservice_provider✅
Webhook Delivered: dex-pool-tokena (Provider: dex-pool-tokena | TX: 61bfea9b... | Status: 200)
Provider: dex-pool-tokena
Transaction: 61bfea9b-1e20-4df4-b2b3-2053b14e3fa5
Webhook: http://localhost:3000/mock/webhook/dex-pool-tokena
HTTP Status: 200