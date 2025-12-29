9:08:10 PMwebsocket
Connected to Eden Simulator
9:08:10 PMwebsocket
Connected to Eden Simulator
9:08:13 PMuser
User query: "I want a sci-fi movie to watch tonight at the best price"
{
  "input": "I want a sci-fi movie to watch tonight at the best price",
  "email": "alice@gmail.com"
}
9:08:13 PMllm
Starting LLM query extraction...
9:08:17 PMservice-registry
Querying ServiceRegistry...
9:08:17 PMservice-registry
Found 3 service providers
{
  "providers": [
    {
      "id": "amc-001",
      "name": "AMC Theatres"
    },
    {
      "id": "moviecom-001",
      "name": "MovieCom"
    },
    {
      "id": "cinemark-001",
      "name": "Cinemark"
    }
  ]
}
9:08:17 PMamc-001
Querying AMC Theatres API...
9:08:17 PMmoviecom-001
Querying MovieCom API...
9:08:17 PMcinemark-001
Querying Cinemark API...
9:08:17 PMamc-001
AMC Theatres returned 2 listings
9:08:17 PMmoviecom-001
MovieCom returned 1 listings
9:08:17 PMcinemark-001
Cinemark returned 1 listings
9:08:30 PMllm
Here are some sci-fi movies available tonight at the best prices: 1. **Back to the Future** - **Provider:** MovieCom - **Price:** $1.50 - **Showtime:** 9:45 PM - **Location:** Baltimore, Maryland - **Rating:** 4.7 (85 reviews) 2. **The Matrix** - **Provider:** AMC Theatres - **Price:** $2.00 - **Showtime:** 8:00 PM - **Location:** Baltimore, Maryland - **Rating:** 4.9 (150 reviews) The best option for you is **Back to the Future** at MovieCom for just **$1.50**!
{
  "response": {
    "message": "Here are some sci-fi movies available tonight at the best prices:\n\n1. **Back to the Future** \n   - **Provider:** MovieCom \n   - **Price:** $1.50 \n   - **Showtime:** 9:45 PM \n   - **Location:** Baltimore, Maryland \n   - **Rating:** 4.7 (85 reviews)\n\n2. **The Matrix** \n   - **Provider:** AMC Theatres \n   - **Price:** $2.00 \n   - **Showtime:** 8:00 PM \n   - **Location:** Baltimore, Maryland \n   - **Rating:** 4.9 (150 reviews)\n\nThe best option for you is **Back to the Future** at MovieCom for just **$1.50**!",
    "listings": [
      {
        "providerId": "moviecom-001",
        "providerName": "MovieCom",
        "movieTitle": "Back to the Future",
        "movieId": "back-to-future-1",
        "price": 1.5,
        "showtime": "9:45 PM",
        "location": "Baltimore, Maryland",
        "reviewCount": 85,
        "rating": 4.7,
        "indexerId": "indexer-beta"
      },
      {
        "providerId": "amc-001",
        "providerName": "AMC Theatres",
        "movieTitle": "The Matrix",
        "movieId": "matrix-001",
        "price": 2,
        "showtime": "8:00 PM",
        "location": "Baltimore, Maryland",
        "reviewCount": 150,
        "rating": 4.9,
        "indexerId": "indexer-alpha"
      }
    ],
    "selectedListing": {
      "providerId": "moviecom-001",
      "providerName": "MovieCom",
      "movieTitle": "Back to the Future",
      "movieId": "back-to-future-1",
      "price": 1.5,
      "showtime": "9:45 PM",
      "location": "Baltimore, Maryland",
      "reviewCount": 85,
      "rating": 4.7,
      "indexerId": "indexer-beta"
    },
    "iGasCost": 0.0048000000000000004
  }
}
9:08:30 PMigas
iGas Cost: 0.004800
{
  "igas": 0.0048000000000000004
}
9:08:30 PMroot-ca
Certificate validated for MovieCom
{
  "providerUuid": "550e8400-e29b-41d4-a716-446655440002",
  "providerName": "MovieCom",
  "capabilities": [
    "SERVICE_PROVIDER",
    "PRICE_QUOTE",
    "RECEIVE_PAYMENT"
  ],
  "expiresAt": 1774750086954
}
9:08:30 PMledger
Ledger entry created: 515ec148-3c0b-4d1e-a898-f32b13005929
{
  "entry": {
    "entryId": "515ec148-3c0b-4d1e-a898-f32b13005929",
    "txId": "3546516e-7d0f-466c-94ff-0d19c3665715",
    "timestamp": 1766974110900,
    "payer": "alice@gmail.com",
    "payerId": "alice@gmail.com",
    "merchant": "MovieCom",
    "providerUuid": "550e8400-e29b-41d4-a716-446655440002",
    "serviceType": "movie",
    "amount": 1.5,
    "iGasCost": 0.0048000000000000004,
    "fees": {
      "rootCA": 0.03,
      "indexerA": 0.0075,
      "indexerB": 0.0075
    },
    "status": "pending",
    "cashierId": "cashier-eden-001",
    "bookingDetails": {
      "movieTitle": "Back to the Future",
      "showtime": "9:45 PM",
      "location": "Baltimore, Maryland"
    }
  }
}
9:08:30 PMledger
Ledger entry created for booking: 515ec148-3c0b-4d1e-a898-f32b13005929
{
  "entry": {
    "entryId": "515ec148-3c0b-4d1e-a898-f32b13005929",
    "txId": "3546516e-7d0f-466c-94ff-0d19c3665715",
    "timestamp": 1766974110900,
    "payer": "alice@gmail.com",
    "payerId": "alice@gmail.com",
    "merchant": "MovieCom",
    "providerUuid": "550e8400-e29b-41d4-a716-446655440002",
    "serviceType": "movie",
    "amount": 1.5,
    "iGasCost": 0.0048000000000000004,
    "fees": {
      "rootCA": 0.03,
      "indexerA": 0.0075,
      "indexerB": 0.0075
    },
    "status": "pending",
    "cashierId": "cashier-eden-001",
    "bookingDetails": {
      "movieTitle": "Back to the Future",
      "showtime": "9:45 PM",
      "location": "Baltimore, Maryland"
    }
  }
}
9:08:30 PMcashier
Eden Cashier processing payment...
{
  "cashier": {
    "id": "cashier-eden-001",
    "name": "Eden Cashier",
    "processedCount": 0,
    "totalProcessed": 0,
    "status": "active"
  }
}
9:08:30 PMcashier
Eden Cashier processed payment: 1.5 USDC
{
  "entry": {
    "entryId": "515ec148-3c0b-4d1e-a898-f32b13005929",
    "txId": "3546516e-7d0f-466c-94ff-0d19c3665715",
    "timestamp": 1766974110900,
    "payer": "alice@gmail.com",
    "payerId": "alice@gmail.com",
    "merchant": "MovieCom",
    "providerUuid": "550e8400-e29b-41d4-a716-446655440002",
    "serviceType": "movie",
    "amount": 1.5,
    "iGasCost": 0.0048000000000000004,
    "fees": {
      "rootCA": 0.03,
      "indexerA": 0.0075,
      "indexerB": 0.0075
    },
    "status": "processed",
    "cashierId": "cashier-eden-001",
    "bookingDetails": {
      "movieTitle": "Back to the Future",
      "showtime": "9:45 PM",
      "location": "Baltimore, Maryland"
    }
  },
  "cashier": {
    "id": "cashier-eden-001",
    "name": "Eden Cashier",
    "processedCount": 1,
    "totalProcessed": 1.5,
    "status": "active"
  },
  "userBalance": 48.5
}
9:08:30 PMtransaction
Purchased Back to the Future for 1.5 USDC
{
  "listing": {
    "providerId": "moviecom-001",
    "providerName": "MovieCom",
    "movieTitle": "Back to the Future",
    "movieId": "back-to-future-1",
    "price": 1.5,
    "showtime": "9:45 PM",
    "location": "Baltimore, Maryland",
    "reviewCount": 85,
    "rating": 4.7,
    "indexerId": "indexer-beta"
  },
  "price": 1.5,
  "ledgerEntry": "515ec148-3c0b-4d1e-a898-f32b13005929"
}
9:08:30 PMsnapshot
Creating transaction snapshot...
9:08:30 PMsnapshot
Snapshot created: 3546516e-7d0f-466c-94ff-0d19c3665715
{
  "snapshot": {
    "chainId": "eden-core",
    "txId": "3546516e-7d0f-466c-94ff-0d19c3665715",
    "slot": 391243,
    "blockTime": 1766974110900,
    "payer": "alice@gmail.com",
    "merchant": "moviecom-001",
    "amount": 1.5,
    "feeSplit": {
      "rootCA": 0.03,
      "indexerA": 0.0075,
      "indexerB": 0.0075
    }
  }
}
9:08:30 PMredis
Streaming to indexers...
9:08:30 PMuser
Watching Back to the Future...
9:08:30 PMledger
Booking completed: 515ec148-3c0b-4d1e-a898-f32b13005929
{
  "entry": {
    "entryId": "515ec148-3c0b-4d1e-a898-f32b13005929",
    "txId": "3546516e-7d0f-466c-94ff-0d19c3665715",
    "timestamp": 1766974110900,
    "payer": "alice@gmail.com",
    "payerId": "alice@gmail.com",
    "merchant": "MovieCom",
    "providerUuid": "550e8400-e29b-41d4-a716-446655440002",
    "serviceType": "movie",
    "amount": 1.5,
    "iGasCost": 0.0048000000000000004,
    "fees": {
      "rootCA": 0.03,
      "indexerA": 0.0075,
      "indexerB": 0.0075
    },
    "status": "completed",
    "cashierId": "cashier-eden-001",
    "bookingDetails": {
      "movieTitle": "Back to the Future",
      "showtime": "9:45 PM",
      "location": "Baltimore, Maryland"
    }
  }
}
9:08:30 PMservice_provider📤
Webhook Delivery Attempt: moviecom-001 (Provider: moviecom-001 | TX: 3546516e...)
Provider: moviecom-001
Transaction: 3546516e-7d0f-466c-94ff-0d19c3665715
Webhook: http://localhost:3000/mock/webhook/moviecom-001
9:08:30 PMtransaction
Transaction completed successfully
{
  "balance": 48.65,
  "rebate": 0.15000000000000002,
  "fees": {
    "rootCA": 0.03,
    "indexerA": 0.0075,
    "indexerB": 0.0075
  },
  "iGasCost": 0.0048000000000000004,
  "selectedProvider": "MovieCom",
  "movie": "Back to the Future"
}
9:08:30 PMservice_provider📥
Mock Webhook Received: moviecom-001
Provider: moviecom-001
Transaction: 3546516e-7d0f-466c-94ff-0d19c3665715
9:08:30 PMservice_provider✅
Webhook Delivered: moviecom-001 (Provider: moviecom-001 | TX: 3546516e... | Status: 200)
Provider: moviecom-001
Transaction: 3546516e-7d0f-466c-94ff-0d19c3665715
Webhook: http://localhost:3000/mock/webhook/moviecom-001
HTTP Status: 200

---

## Service Provider Notification Events

### Webhook Registration (Startup)
9:08:10 PMservice_provider📡
Webhook Registered: AMC Theatres (amc-001)
Provider: amc-001
Provider Name: AMC Theatres
Webhook: http://localhost:3000/mock/webhook/amc-001

9:08:10 PMservice_provider📡
Webhook Registered: MovieCom (moviecom-001)
Provider: moviecom-001
Provider Name: MovieCom
Webhook: http://localhost:3000/mock/webhook/moviecom-001

9:08:10 PMservice_provider📡
Webhook Registered: Cinemark (cinemark-001)
Provider: cinemark-001
Provider Name: Cinemark
Webhook: http://localhost:3000/mock/webhook/cinemark-001

### RPC Query Examples
9:08:35 PMservice_provider🔍
Service Provider RPC Query: getTransactionByPayer (Method: getTransactionByPayer | Payer: alice@gmail.com | Found: 1 transaction(s))
Provider: alice@gmail.com
Transaction Count: 1

9:08:36 PMservice_provider🔍
Service Provider RPC Query: getTransactionBySnapshot (Method: getTransactionBySnapshot | Snapshot: 3546516e... | Found: true)
Provider: 3546516e-7d0f-466c-94ff-0d19c3665715
Found: true

9:08:37 PMservice_provider🔍
Service Provider RPC Query: getLatestSnapshot (Method: getLatestSnapshot | Provider: moviecom-001 | Found: true | TX: 3546516e...)
Provider: moviecom-001
Transaction: 3546516e-7d0f-466c-94ff-0d19c3665715
Found: true

### RPC Poll Example
9:08:38 PMservice_provider🔄
Service Provider Polling: tx/status (Method: tx/status | Payer: alice@gmail.com | Status: completed | TX: 3546516e...)
Provider: alice@gmail.com
Status: completed
Transaction: 3546516e-7d0f-466c-94ff-0d19c3665715

### Webhook Delivery Flow
1. **Webhook Attempt**: Indexer attempts to deliver webhook
2. **Webhook Received**: Mock endpoint receives the webhook
3. **Webhook Delivered**: Success confirmation with HTTP 200

### Webhook Failure Example (if endpoint unreachable)
9:08:40 PMservice_provider❌
Webhook Delivery Failed: amc-001 (Provider: amc-001 | TX: abc12345... | Status: 500 | Failures: 1)
Provider: amc-001
Transaction: abc12345-...
HTTP Status: 500
Failure Count: 1
Webhook: http://localhost:3000/mock/webhook/amc-001

---

## Service Provider Notification Architecture

Eden provides **THREE notification mechanisms** for service providers:

### 1️⃣ INDEXER RPC (Canonical Source of Truth)
- `GET /rpc/getTransactionByPayer?payer=<google_email>`
- `GET /rpc/getTransactionBySnapshot?snapshot_id=<tx_id>`
- `GET /rpc/getLatestSnapshot?provider_id=<provider_id>`
- `GET /rpc/tx/status?payer=<email> OR ?snapshot_id=<tx_id>`
- Bot-friendly, cacheable, stateless
- Same model as Ethereum/Solana RPC

### 2️⃣ OPTIONAL PUSH (Webhook - Best Effort)
- `POST /rpc/webhook/register`
- `POST /rpc/webhook/unregister`
- `GET /rpc/webhook/list`
- Indexer pushes snapshot on transaction finalization
- Best effort delivery, no guarantees
- Retry logic handled by indexer

### 3️⃣ PULL/POLL (Safety Net)
- `GET /rpc/tx/status?payer=<email>`
- Providers poll until timeout
- Fallback if webhook fails
- Provider controls reliability
- No inbound firewall rules required