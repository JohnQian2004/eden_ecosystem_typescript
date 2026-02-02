"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeDuckDuckGoShopping = scrapeDuckDuckGoShopping;
const puppeteer_1 = __importDefault(require("puppeteer"));
/**
 * Setup Puppeteer browser with optimized options for speed
 */
async function setupBrowser() {
    console.log('🔧 Setting up Puppeteer browser (optimized for speed)...');
    const browser = await puppeteer_1.default.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-gpu',
            '--disable-extensions',
            '--disable-plugins',
            '--disable-plugins-discovery',
            '--disable-preconnect',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows',
            '--disable-ipc-flooding-protection',
            '--disable-features=TranslateUI,BlinkGenPropertyTrees',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--disable-sync',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-logging',
            '--log-level=3',
            '--silent',
            '--disable-infobars',
        ],
        defaultViewport: {
            width: 1920,
            height: 1080
        }
    });
    console.log('✅ Puppeteer browser initialized successfully');
    return browser;
}
/**
 * Scrape DuckDuckGo shopping results
 */
async function scrapeDuckDuckGoShopping(searchQuery, maxResults = 30) {
    console.log(`🔍 Starting DuckDuckGo shopping search for: '${searchQuery}' (max results: ${maxResults})`);
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://duckduckgo.com/?q=${encodedQuery}&iar=shopping`;
    console.log(`🌐 Target URL: ${url}`);
    const browser = await setupBrowser();
    const results = [];
    try {
        const page = await browser.newPage();
        // Block images and stylesheets for faster loading
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font' || resourceType === 'media') {
                req.abort();
            }
            else {
                req.continue();
            }
        });
        // Set user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        console.log('📡 Navigating to DuckDuckGo...');
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 8000
        });
        console.log('⏳ Waiting for page to load (1 second)...');
        await page.waitForTimeout(1000);
        console.log(`📄 Page title: ${await page.title()}`);
        // Scroll to load dynamic content
        console.log('📜 Scrolling page to load dynamic content...');
        await page.evaluate(() => {
            if (typeof window !== 'undefined' && typeof document !== 'undefined') {
                window.scrollTo(0, document.body.scrollHeight);
            }
        });
        await page.waitForTimeout(800);
        // Wait for shopping results
        console.log('🔎 Looking for shopping results elements...');
        const selectorsToTry = [
            "main[data-testid='zci-products']",
            "ol.QCtvfIqZQM6BVmIacNk9 li",
            "[data-testid='zci-products'] li",
        ];
        let elementFound = false;
        for (const selector of selectorsToTry) {
            try {
                await page.waitForSelector(selector, { timeout: 2000 });
                elementFound = true;
                console.log(`   ✅ Found elements using selector: ${selector}`);
                break;
            }
            catch {
                continue;
            }
        }
        if (!elementFound) {
            console.log('   ⚠️ No elements found with primary selectors, trying fallback...');
            await page.waitForTimeout(500);
        }
        // Extract product data
        console.log('📦 Extracting product data...');
        const products = await page.evaluate((maxResults) => {
            const results = [];
            // Try different selectors
            const selectors = [
                "main[data-testid='zci-products'] li",
                "ol.QCtvfIqZQM6BVmIacNk9 li",
                "[data-testid='zci-products'] li",
                "li.O9Ipab51rBntYb0pwOQn",
            ];
            let productElements = [];
            for (const selector of selectors) {
                if (typeof document !== 'undefined') {
                    productElements = Array.from(document.querySelectorAll(selector));
                    if (productElements.length > 0) {
                        console.log(`Found ${productElements.length} products with selector: ${selector}`);
                        break;
                    }
                }
            }
            if (productElements.length === 0) {
                return results;
            }
            // Process up to maxResults
            for (let i = 0; i < Math.min(productElements.length, maxResults); i++) {
                const product = productElements[i];
                const result = {};
                // Extract title
                const titleElem = product.querySelector("h2.xrWcR15SIZQFwwZBfYi3") ||
                    product.querySelector("h2.RDtM9fAcGGHRulQKs39C") ||
                    product.querySelector("h2");
                if (titleElem) {
                    result.title = titleElem.textContent?.trim() || '';
                }
                // Extract price
                const priceElem = product.querySelector("span.d26Geqs1C__RaCO7MUs2");
                if (priceElem) {
                    result.price = priceElem.textContent?.trim() || '';
                }
                // Extract image
                const imgContainer = product.querySelector("div.sbB0T4qY2HLLeqUQBQXW");
                const imgElem = imgContainer?.querySelector("img") || product.querySelector("img");
                if (imgElem) {
                    let imageUrl = imgElem.getAttribute('src') ||
                        imgElem.getAttribute('data-src') ||
                        imgElem.getAttribute('data-lazy-src') || '';
                    if (imageUrl) {
                        if (imageUrl.startsWith('//')) {
                            imageUrl = 'https:' + imageUrl;
                        }
                        else if (!imageUrl.startsWith('http')) {
                            imageUrl = 'https://duckduckgo.com' + imageUrl;
                        }
                    }
                    result.image = imageUrl;
                }
                // Extract link
                const linkElem = product.querySelector("a[href]");
                if (linkElem) {
                    let linkUrl = linkElem.getAttribute('href') || '';
                    if (linkUrl) {
                        if (linkUrl.startsWith('//')) {
                            linkUrl = 'https:' + linkUrl;
                        }
                        else if (!linkUrl.startsWith('http')) {
                            if (linkUrl.startsWith('/l/?kh=')) {
                                linkUrl = 'https://duckduckgo.com' + linkUrl;
                            }
                        }
                    }
                    result.link = linkUrl;
                }
                // Extract merchant/vendor
                const merchantContainer = product.querySelector("div.yG10y4QOq199BdDVBq6e");
                if (merchantContainer) {
                    const merchantElem = merchantContainer.querySelector("span.LQVY1Jpkk8nyJ6HBWKAk");
                    if (merchantElem) {
                        result.merchant = merchantElem.textContent?.trim() || '';
                        result.vendor = result.merchant;
                    }
                }
                if (result.title) {
                    results.push(result);
                }
            }
            return results;
        }, maxResults);
        results.push(...products);
        // Fallback if no results
        if (results.length === 0) {
            console.log('⚠️ No results found with product selectors, trying fallback method...');
            const fallbackResults = await page.evaluate((maxResults) => {
                const results = [];
                if (typeof document === 'undefined') {
                    return results;
                }
                const allLinks = Array.from(document.querySelectorAll('a[href]'));
                for (let i = 0; i < Math.min(allLinks.length, maxResults * 2); i++) {
                    const link = allLinks[i];
                    if (!link)
                        continue;
                    const parent = link.parentElement;
                    if (parent) {
                        const text = parent.textContent?.trim() || '';
                        if (text && text.length > 10) {
                            let href = link.getAttribute('href') || '';
                            if (href && !href.startsWith('http')) {
                                href = 'https://duckduckgo.com' + href;
                            }
                            results.push({
                                title: text.substring(0, 100),
                                link: href,
                                price: '',
                                image: '',
                                merchant: '',
                                vendor: ''
                            });
                            if (results.length >= maxResults) {
                                break;
                            }
                        }
                    }
                }
                return results;
            }, maxResults);
            results.push(...fallbackResults);
        }
        console.log(`📊 Total results collected: ${results.length}`);
        // Log first few results for debugging
        if (results.length > 0) {
            console.log(`\n📋 Sample results (showing first ${Math.min(3, results.length)}):`);
            results.slice(0, 3).forEach((result, index) => {
                console.log(`   ${index + 1}. ${result.title}`);
                console.log(`      Price: ${result.price || 'N/A'}`);
                console.log(`      Merchant: ${result.merchant || result.vendor || 'N/A'}`);
                console.log(`      Link: ${result.link ? result.link.substring(0, 80) + '...' : 'N/A'}`);
            });
            if (results.length > 3) {
                console.log(`   ... and ${results.length - 3} more results`);
            }
            console.log('');
        }
    }
    catch (error) {
        console.error(`❌ Error scraping results: ${error.message}`);
        throw error;
    }
    finally {
        console.log('🔒 Closing browser...');
        await browser.close();
        console.log('✅ Browser closed');
    }
    return results;
}
