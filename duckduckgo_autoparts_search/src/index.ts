import express, { Request, Response } from 'express';
import cors from 'cors';
import { scrapeDuckDuckGoShopping } from './scraper';

const app = express();
const PORT = parseInt(process.env.PORT || '5004', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'DuckDuckGo AutoParts Search API',
    port: PORT
  });
});

// Search endpoint
app.get('/search', async (req: Request, res: Response) => {
  const searchString = req.query.search_string as string || '2020 Nissan Altima front bumper';
  const maxReturn = Math.min(Math.max(parseInt(req.query.maxReturn as string || '25', 10), 25), 50);

  console.log('='.repeat(60));
  console.log('🚀 NEW SEARCH INITIATED');
  console.log(`   Search String: ${searchString}`);
  console.log(`   Max Return: ${maxReturn}`);
  console.log('='.repeat(60));

  try {
    const results = await scrapeDuckDuckGoShopping(searchString, maxReturn);

    console.log('='.repeat(60));
    console.log('✅ SEARCH COMPLETED');
    console.log(`   Results: ${results.length}`);
    console.log('='.repeat(60));
    
    // Log response summary
    console.log(`\n📤 Sending response:`);
    console.log(`   Search: "${searchString}"`);
    console.log(`   Max Return: ${maxReturn}`);
    console.log(`   Results Count: ${results.length}`);
    if (results.length > 0) {
      console.log(`   First Result: ${results[0].title}`);
      console.log(`   Last Result: ${results[results.length - 1].title}`);
    }
    console.log('');

    res.json({
      search_string: searchString,
      max_return: maxReturn,
      results_count: results.length,
      results: results
    });
  } catch (error: any) {
    console.error('❌ Error in search:', error);
    res.status(500).json({
      error: 'Search failed',
      message: error.message,
      search_string: searchString,
      max_return: maxReturn,
      results_count: 0,
      results: []
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log(`🚀 Starting AutoParts Search API on http://0.0.0.0:${PORT}`);
  console.log(`📡 Accessible from network at: http://YOUR_IP:${PORT}`);
  console.log('='.repeat(60));
});

