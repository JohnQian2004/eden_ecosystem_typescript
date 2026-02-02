# DuckDuckGo AutoParts Search Service

TypeScript conversion of the Flask-based DuckDuckGo shopping search scraper.

## Features

- Fast web scraping using Puppeteer
- Optimized for speed (blocks images, CSS, fonts)
- RESTful API with `/search` endpoint
- Health check endpoint

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Run

```bash
npm start
# or for development
npm run dev
```

## API Endpoints

### GET /health
Health check endpoint.

### GET /search?search_string=QUERY&maxReturn=NUMBER

Search for auto parts on DuckDuckGo shopping.

**Parameters:**
- `search_string` (optional): Search query (default: "2020 Nissan Altima front bumper")
- `maxReturn` (optional): Number of results to return, between 25-50 (default: 25)

**Response:**
```json
{
  "search_string": "2020 Nissan Altima front bumper",
  "max_return": 25,
  "results_count": 25,
  "results": [
    {
      "title": "Product Title",
      "price": "$99.99",
      "image": "https://...",
      "link": "https://...",
      "merchant": "Store Name",
      "vendor": "Store Name"
    }
  ]
}
```

## Port

Default port: 5004 (configurable via PORT environment variable)

