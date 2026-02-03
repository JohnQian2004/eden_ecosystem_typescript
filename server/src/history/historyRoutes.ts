/**
 * History & Autobiography Routes
 * Handles historical events, figures, timelines, and first-person conversations
 */

import { IncomingMessage, ServerResponse } from 'http';
import { callLLM } from '../llm';
import * as fs from 'fs';
import * as path from 'path';

interface HistoricalEvent {
  id: string;
  title: string;
  date: string;
  description: string;
  location: string;
  perspectives?: string[];
  relatedFigures?: string[];
}

const HISTORY_DATA_PATH = path.resolve(__dirname, '../../../data/history');

// Ensure data directory exists
if (!fs.existsSync(HISTORY_DATA_PATH)) {
  fs.mkdirSync(HISTORY_DATA_PATH, { recursive: true });
}

/**
 * Generate historical periods using LLM
 */
async function generateHistoricalPeriods(): Promise<any[]> {
  const prompt = `You are a world history expert. Generate a comprehensive list of major historical periods that span from ancient times to the present day.

Create 6-8 major historical periods, each covering significant eras of human civilization. For each period, provide:
1. A unique ID (lowercase, hyphenated, e.g., "ancient-civilizations")
2. A descriptive name (e.g., "Ancient Civilizations")
3. Start year (can be negative for BCE dates)
4. End year
5. A concise description (1-2 sentences maximum) explaining the key characteristics and significance

The periods should:
- Cover the full span of recorded human history
- Be non-overlapping (each period should end where the next begins)
- Represent major transitions in human civilization
- Include diverse global perspectives

CRITICAL: Keep descriptions brief (1-2 sentences max). Do NOT populate globalEvents - always use empty array []. Return ONLY the JSON array, no markdown, no explanations.

Return your response as a JSON array in this exact format:
[
  {
    "id": "period-id",
    "name": "Period Name",
    "startYear": -3000,
    "endYear": 500,
    "description": "Brief description...",
    "globalEvents": []
  }
]

CRITICAL JSON REQUIREMENTS:
- endYear MUST be a NUMBER (not a word like "present")
- For current year, use the actual year number (e.g., 2026)
- All strings MUST be in double quotes
- All numbers MUST NOT have quotes
- Do NOT use unquoted words like "present" or "current"
- Return ONLY valid JSON that can be parsed by JSON.parse()
- No markdown code blocks, no explanations, just pure JSON array

Return ONLY valid JSON. No markdown, no explanations, just the JSON array.`;

  try {
    const response = await callLLM(prompt, true);
    
    // Log raw LLM response for debugging
    console.log('📜 [History] Raw LLM periods response:');
    console.log('=====================================');
    console.log(response);
    console.log('=====================================');
    
    // Parse JSON response
    let periods: any[] = [];
    let jsonStr = '';
    try {
      // Try to extract JSON from response
      jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '').trim();
      }
      
      // Extract JSON array
      const arrayStart = jsonStr.indexOf('[');
      const arrayEnd = jsonStr.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonStr = jsonStr.substring(arrayStart, arrayEnd + 1);
      }
      
      // Fix common JSON errors: unquoted words like "present", "current", "now"
      const currentYear = new Date().getFullYear();
      jsonStr = jsonStr.replace(/:\s*(present|current|now)\s*([,}])/gi, `: ${currentYear}$2`);
      
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        periods = parsed;
        // Ensure each period has globalEvents array
        periods.forEach(period => {
          if (!period.globalEvents) {
            period.globalEvents = [];
          }
        });
      }
    } catch (parseError: any) {
      console.error('Failed to parse LLM periods response:', parseError.message);
      console.error('Attempting to extract partial data from response...');
      
      // Try to extract partial periods from the response using regex
      // Handle truncated JSON by finding complete objects
      try {
        // Find all complete period objects (those that have closing braces)
        const periodPattern = /\{[^{}]*"id"\s*:\s*"[^"]*"[^{}]*"name"\s*:\s*"[^"]*"[^{}]*\}/g;
        const matches = response.match(periodPattern);
        
        if (matches) {
          for (const match of matches) {
            try {
              // Try to parse each complete object
              const period = JSON.parse(match);
              if (period.id && period.name) {
                if (!period.globalEvents) {
                  period.globalEvents = [];
                }
                periods.push(period);
              }
            } catch (e) {
              // If JSON.parse fails, extract fields manually
              const idMatch = match.match(/"id"\s*:\s*"([^"]*)"/);
              const nameMatch = match.match(/"name"\s*:\s*"([^"]*)"/);
              const startYearMatch = match.match(/"startYear"\s*:\s*(-?\d+)/);
              const endYearMatch = match.match(/"endYear"\s*:\s*(-?\d+)/);
              const descMatch = match.match(/"description"\s*:\s*"([^"]*)"/);
              
              if (idMatch && nameMatch) {
                periods.push({
                  id: idMatch[1],
                  name: nameMatch[1],
                  startYear: startYearMatch ? parseInt(startYearMatch[1]) : 0,
                  endYear: endYearMatch ? parseInt(endYearMatch[1]) : new Date().getFullYear(),
                  description: descMatch ? descMatch[1] : '',
                  globalEvents: []
                });
              }
            }
          }
        } else {
          // Fallback: split by closing braces
          const periodBlocks = response.split('}');
          for (let i = 0; i < periodBlocks.length - 1; i++) {
            let block = periodBlocks[i] + '}';
            const openBrace = block.lastIndexOf('{');
            if (openBrace !== -1) {
              block = block.substring(openBrace);
            }
            
            const idMatch = block.match(/"id"\s*:\s*"([^"]*)"/);
            const nameMatch = block.match(/"name"\s*:\s*"([^"]*)"/);
            const startYearMatch = block.match(/"startYear"\s*:\s*(-?\d+)/);
            const endYearMatch = block.match(/"endYear"\s*:\s*(-?\d+)/);
            const descMatch = block.match(/"description"\s*:\s*"([^"]*)"/);
            
            if (idMatch && nameMatch) {
              periods.push({
                id: idMatch[1],
                name: nameMatch[1],
                startYear: startYearMatch ? parseInt(startYearMatch[1]) : 0,
                endYear: endYearMatch ? parseInt(endYearMatch[1]) : new Date().getFullYear(),
                description: descMatch ? descMatch[1] : '',
                globalEvents: []
              });
            }
          }
        }
        console.log(`✅ Extracted ${periods.length} periods from partial response`);
      } catch (extractError) {
        console.error('Failed to extract partial periods:', extractError);
      }
      
      // If still no periods, return empty array (no defaults)
      if (periods.length === 0) {
        console.error('No periods could be extracted from LLM response');
      }
    }
    
    return periods;
  } catch (error: any) {
    console.error('Failed to generate historical periods:', error);
    // Return empty array on error
    return [];
  }
}

/**
 * Generate historical figures using LLM
 */
async function generateHistoricalFigures(): Promise<any[]> {
  const prompt = `You are a world history expert. Generate a diverse list of 15-20 major historical figures from different time periods, regions, and fields of achievement.

Include figures from:
- Different time periods (ancient, medieval, modern, contemporary)
- Different regions (Europe, Asia, Africa, Americas, Middle East)
- Different fields (politics, science, arts, philosophy, military, religion, etc.)

For each figure, provide:
1. A unique ID (lowercase, hyphenated, e.g., "leonardo-da-vinci")
2. Full name
3. Birth year (or approximate if unknown)
4. Death year (or "Present" if still alive, or approximate if unknown)
5. Nationality or place of origin
6. Primary occupation or field
7. A concise biography (2 sentences maximum) explaining their significance and achievements
8. Key historical events they were involved in (array of 2-3 event names maximum)
9. Notable writings or works (array, can be empty, maximum 3 items)

CRITICAL: Use numbers for years (negative for BCE, e.g., -69 for 69 BC). Keep all text brief. Return ONLY the JSON array, no markdown, no explanations.

Return your response as a JSON array in this exact format:
[
  {
    "id": "figure-id",
    "name": "Full Name",
    "birthYear": 1452,
    "deathYear": 1519,
    "nationality": "Country/Region",
    "occupation": "Primary Occupation",
    "biography": "Brief biography...",
    "keyEvents": ["Event 1", "Event 2"],
    "writings": ["Work 1", "Work 2"]
  }
]

CRITICAL JSON REQUIREMENTS:
- birthYear and deathYear MUST be NUMBERS (not strings, not words)
- For living people, use the current year number (e.g., 2026) NOT the word "Present"
- All strings MUST be in double quotes
- All numbers MUST NOT have quotes
- Do NOT use unquoted words like "present", "current", or "now"
- Return ONLY valid JSON that can be parsed by JSON.parse()
- No markdown code blocks, no explanations, just pure JSON array

Return ONLY valid JSON. No markdown, no explanations, just the JSON array.`;

  try {
    console.log('👤 [History] About to call LLM for figures...');
    const response = await callLLM(prompt, true);
    console.log('👤 [History] LLM call completed, response length:', response.length);
    
    // Log raw LLM response for debugging
    console.log('👤 [History] Raw LLM figures response:');
    console.log('=====================================');
    console.log(response);
    console.log('=====================================');
    
    // Parse JSON response
    let figures: any[] = [];
    let jsonStr = '';
    try {
      // Try to extract JSON from response
      jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '').trim();
      }
      
      // Extract JSON array
      const arrayStart = jsonStr.indexOf('[');
      const arrayEnd = jsonStr.lastIndexOf(']');
      if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
        jsonStr = jsonStr.substring(arrayStart, arrayEnd + 1);
      }
      
      // Fix common JSON errors: unquoted words like "present", "current", "now"
      const currentYear = new Date().getFullYear();
      jsonStr = jsonStr.replace(/:\s*(present|current|now)\s*([,}])/gi, `: ${currentYear}$2`);
      
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        figures = parsed;
      }
    } catch (parseError: any) {
      console.error('Failed to parse LLM figures response:', parseError.message);
      console.error('Attempting to extract partial data from response...');
      
      // Try to extract partial figures from the response using regex
      try {
        const figureBlocks = response.split('}');
        for (let i = 0; i < figureBlocks.length - 1; i++) {
          let block = figureBlocks[i] + '}';
          const openBrace = block.lastIndexOf('{');
          if (openBrace !== -1) {
            block = block.substring(openBrace);
          }
          
          const idMatch = block.match(/"id"\s*:\s*"([^"]*)"/);
          const nameMatch = block.match(/"name"\s*:\s*"([^"]*)"/);
          const birthYearMatch = block.match(/"birthYear"\s*:\s*(-?\d+)/);
          const deathYearMatch = block.match(/"deathYear"\s*:\s*(-?\d+|"[^"]*")/);
          const nationalityMatch = block.match(/"nationality"\s*:\s*"([^"]*)"/);
          const occupationMatch = block.match(/"occupation"\s*:\s*"([^"]*)"/);
          const biographyMatch = block.match(/"biography"\s*:\s*"([^"]*)"/);
          
          // Extract keyEvents array
          const eventsMatch = block.match(/"keyEvents"\s*:\s*\[(.*?)\]/);
          let keyEvents: string[] = [];
          if (eventsMatch) {
            const eventsText = eventsMatch[1];
            const eventMatches = eventsText.match(/"([^"]*)"/g);
            if (eventMatches) {
              keyEvents = eventMatches.map(e => e.replace(/"/g, ''));
            }
          }
          
          // Extract writings array
          const writingsMatch = block.match(/"writings"\s*:\s*\[(.*?)\]/);
          let writings: string[] = [];
          if (writingsMatch) {
            const writingsText = writingsMatch[1];
            const writingMatches = writingsText.match(/"([^"]*)"/g);
            if (writingMatches) {
              writings = writingMatches.map(w => w.replace(/"/g, ''));
            }
          }
          
          if (idMatch && nameMatch) {
            let deathYear: any = null;
            if (deathYearMatch) {
              const deathYearStr = deathYearMatch[1].replace(/"/g, '');
              if (deathYearStr === 'Present' || deathYearStr.toLowerCase() === 'present') {
                deathYear = 'Present';
              } else {
                const numMatch = deathYearStr.match(/(-?\d+)/);
                if (numMatch) {
                  deathYear = parseInt(numMatch[1]);
                }
              }
            }
            
            figures.push({
              id: idMatch[1],
              name: nameMatch[1],
              birthYear: birthYearMatch ? parseInt(birthYearMatch[1]) : null,
              deathYear: deathYear,
              nationality: nationalityMatch ? nationalityMatch[1] : 'Unknown',
              occupation: occupationMatch ? occupationMatch[1] : 'Unknown',
              biography: biographyMatch ? biographyMatch[1] : '',
              keyEvents: keyEvents,
              writings: writings
            });
          }
        }
        console.log(`Extracted ${figures.length} figures from partial response`);
      } catch (extractError) {
        console.error('Failed to extract partial figures:', extractError);
      }
      
      // If still no figures, return empty array (no defaults)
      if (figures.length === 0) {
        console.error('No figures could be extracted from LLM response');
      }
    }
    
    return figures;
  } catch (error: any) {
    console.error('Failed to generate historical figures:', error);
    // Return empty array on error
    return [];
  }
}

/**
 * Generate first-person response from historical figure
 */
async function generateAutobiographyResponse(
  figureId: string,
  question: string,
  conversationHistory: Array<{ role: string; content: string }>
): Promise<string> {
  const figures = await generateHistoricalFigures();
  const figure = figures.find((f: any) => f.id === figureId);
  
  if (!figure) {
    throw new Error(`Historical figure not found: ${figureId}`);
  }
  
  // Build context from conversation history
  const historyContext = conversationHistory
    .map(msg => `${msg.role === 'user' ? 'User' : figure.name}: ${msg.content}`)
    .join('\n');
  
  const prompt = `You are ${figure.name} (${figure.birthYear}-${figure.deathYear}), ${figure.occupation} from ${figure.nationality}.

${figure.biography}

Based on your actual writings, historical records, and the context of your time, respond to the following question in first person, as if you are speaking directly to the user. Be authentic to your character, knowledge, and the historical period in which you lived.

Previous conversation:
${historyContext}

User's question: ${question}

Respond as ${figure.name} would, using first person ("I", "my", "me"). Be thoughtful, authentic, and true to your historical character.`;

  try {
    const response = await callLLM(prompt, true);
    return response;
  } catch (error: any) {
    console.error('Failed to generate autobiography response:', error);
    throw new Error(`Failed to generate response: ${error.message}`);
  }
}

/**
 * Generate what-if historical scenario
 */
async function generateWhatIfScenario(scenario: string): Promise<string> {
  const prompt = `You are a historical analyst exploring alternative history scenarios. Analyze the following "what if" question and provide a thoughtful, well-reasoned response based on historical context, cause-and-effect relationships, and plausible outcomes.

What-if scenario: ${scenario}

Provide:
1. Historical context of the actual events
2. Key factors that would need to change
3. Plausible alternative outcomes
4. Potential ripple effects and long-term consequences
5. Analysis of how this might have altered subsequent history

Be thorough, analytical, and grounded in historical understanding.`;

  try {
    const response = await callLLM(prompt, true);
    return response;
  } catch (error: any) {
    console.error('Failed to generate what-if scenario:', error);
    throw new Error(`Failed to generate scenario: ${error.message}`);
  }
}

/**
 * Generate historical events for a period using LLM
 */
async function generatePeriodEvents(period: any): Promise<HistoricalEvent[]> {
  const prompt = `You are a historical researcher. Generate a comprehensive list of major historical events for the period: ${period.name} (${period.startYear} - ${period.endYear}).

Period description: ${period.description}

For each event, provide:
1. A clear, descriptive title
2. The approximate date (can be a year, decade, or century)
3. A detailed description (2-3 sentences)
4. The location/region where it occurred
5. Multiple perspectives on the event (e.g., from different cultures, social classes, or viewpoints)
6. Related historical figures who were involved

Generate 8-12 major events that represent the most significant developments of this period. Include events from different regions of the world to show the global scope of history.

Return your response as a JSON array of events in this exact format:
[
  {
    "id": "event-id-1",
    "title": "Event Title",
    "date": "Year or date range",
    "description": "Detailed description of the event...",
    "location": "Geographic location",
    "perspectives": ["Perspective 1", "Perspective 2", "Perspective 3"],
    "relatedFigures": ["Figure Name 1", "Figure Name 2"]
  }
]

Return ONLY valid JSON. No markdown, no explanations, just the JSON array.`;

  try {
    const response = await callLLM(prompt, true);
    
    // Log raw LLM response for debugging
    console.log(`📅 [History] Raw LLM events response for period: ${period.name}`);
    console.log('=====================================');
    console.log(response);
    console.log('=====================================');
    
    // Parse JSON response
    let events: HistoricalEvent[] = [];
    let jsonStr = ''; // Declare outside try block for catch block access
    try {
      // Try to extract JSON from response (might have markdown code blocks)
      jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '').trim();
      }
      
      // Try to find JSON array in the response
      // Look for the first [ and last ] to extract the array
      const firstBracket = jsonStr.indexOf('[');
      const lastBracket = jsonStr.lastIndexOf(']');
      
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
        jsonStr = jsonStr.substring(firstBracket, lastBracket + 1);
      }
      
      // Try to fix unterminated strings by tracking string state
      let fixedJson = '';
      let inString = false;
      let escapeNext = false;
      
      for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];
        
        if (escapeNext) {
          fixedJson += char;
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          fixedJson += char;
          escapeNext = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          fixedJson += char;
        } else if (inString) {
          // Inside a string, escape special characters
          if (char === '\n' || char === '\r') {
            fixedJson += '\\n';
          } else if (char === '\t') {
            fixedJson += '\\t';
          } else {
            fixedJson += char;
          }
        } else {
          fixedJson += char;
        }
      }
      
      // If we ended in a string, try to close it intelligently
      if (inString) {
        // Look ahead to find where the string should end
        const remaining = jsonStr.substring(fixedJson.length);
        const nextComma = remaining.indexOf(',');
        const nextBrace = remaining.indexOf('}');
        const nextBracket = remaining.indexOf(']');
        
        // Close the string
        fixedJson += '"';
      }
      
      jsonStr = fixedJson;
      
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        events = parsed;
      } else if (parsed.events && Array.isArray(parsed.events)) {
        events = parsed.events;
      }
    } catch (parseError: any) {
      console.error('Failed to parse LLM response as JSON:', parseError.message);
      
      // Log context around the error position for debugging
      if (parseError.message.includes('position') && jsonStr) {
        const posMatch = parseError.message.match(/position (\d+)/);
        if (posMatch) {
          const pos = parseInt(posMatch[1]);
          const start = Math.max(0, pos - 200);
          const end = Math.min(jsonStr.length, pos + 200);
          console.error('Context around error position:', jsonStr.substring(start, end));
        }
      }
      
      // Fallback: try to extract individual event objects using regex
      try {
        // Split by closing braces to find potential event objects
        const eventBlocks = response.split('}');
        const extractedEvents: any[] = [];
        
        for (let i = 0; i < eventBlocks.length - 1; i++) {
          let block = eventBlocks[i] + '}';
          
          // Try to find the opening brace
          const openBrace = block.lastIndexOf('{');
          if (openBrace !== -1) {
            block = block.substring(openBrace);
          }
          
          // Extract key fields using regex
          const idMatch = block.match(/"id"\s*:\s*"([^"]*)"/);
          const titleMatch = block.match(/"title"\s*:\s*"([^"]*)"/);
          const dateMatch = block.match(/"date"\s*:\s*"([^"]*)"/);
          const descMatch = block.match(/"description"\s*:\s*"([^"]*)"/);
          const locMatch = block.match(/"location"\s*:\s*"([^"]*)"/);
          
          if (idMatch && titleMatch) {
            // Extract perspectives array
            const perspectivesMatch = block.match(/"perspectives"\s*:\s*\[(.*?)\]/);
            let perspectives: string[] = [];
            if (perspectivesMatch) {
              const persText = perspectivesMatch[1];
              const persMatches = persText.match(/"([^"]*)"/g);
              if (persMatches) {
                perspectives = persMatches.map(p => p.replace(/"/g, ''));
              }
            }
            
            // Extract related figures array
            const figuresMatch = block.match(/"relatedFigures"\s*:\s*\[(.*?)\]/);
            let relatedFigures: string[] = [];
            if (figuresMatch) {
              const figText = figuresMatch[1];
              const figMatches = figText.match(/"([^"]*)"/g);
              if (figMatches) {
                relatedFigures = figMatches.map(f => f.replace(/"/g, ''));
              }
            }
            
            extractedEvents.push({
              id: idMatch[1],
              title: titleMatch[1],
              date: dateMatch ? dateMatch[1] : 'Unknown',
              description: descMatch ? descMatch[1] : 'Historical event',
              location: locMatch ? locMatch[1] : 'Unknown',
              perspectives: perspectives,
              relatedFigures: relatedFigures
            });
          }
        }
        
        if (extractedEvents.length > 0) {
          console.log(`Extracted ${extractedEvents.length} events using fallback regex method`);
          events = extractedEvents.slice(0, 12); // Limit to 12 events
        }
      } catch (fallbackError) {
        console.error('Fallback extraction also failed:', fallbackError);
      }
    }
    
    return events;
  } catch (error: any) {
    console.error('Failed to generate period events:', error);
    return [];
  }
}

/**
 * Search historical events and figures using LLM
 */
async function searchHistory(query: string): Promise<Array<any>> {
  // Generate periods and figures, then search
  const [periods, figures] = await Promise.all([
    generateHistoricalPeriods(),
    generateHistoricalFigures()
  ]);
  
  const queryLower = query.toLowerCase();
  const results: Array<any> = [];
  
  // Search figures
  figures.forEach((figure: any) => {
    if (
      figure.name.toLowerCase().includes(queryLower) ||
      figure.occupation.toLowerCase().includes(queryLower) ||
      figure.nationality.toLowerCase().includes(queryLower) ||
      figure.biography.toLowerCase().includes(queryLower)
    ) {
      results.push(figure);
    }
  });
  
  // Search periods
  periods.forEach((period: any) => {
    if (
      period.name.toLowerCase().includes(queryLower) ||
      period.description.toLowerCase().includes(queryLower)
    ) {
      results.push(period);
    }
  });
  
  return results.slice(0, 10); // Limit to 10 results
}

/**
 * Handle history API requests
 */
export function handleHistoryRequest(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
  const sendJsonResponse = (statusCode: number, data: any) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    sendJsonResponse(200, {});
    return true;
  }
  
  // GET /api/history/periods
  if (pathname === '/api/history/periods' && req.method === 'GET') {
    console.log('📜 [History] GET /api/history/periods - Generating with LLM (no cache)...');
    
    // Always generate periods using LLM (no cache)
    generateHistoricalPeriods().then(periods => {
      console.log('📜 [History] Generated', periods.length, 'periods');
      sendJsonResponse(200, periods);
    }).catch((error: any) => {
      console.error('Failed to generate periods:', error);
      sendJsonResponse(500, { error: error.message });
    });
    
    return true;
  }

  // GET /api/history/periods/:periodId/events
  const periodEventsMatch = pathname.match(/^\/api\/history\/periods\/([^\/]+)\/events$/);
  if (periodEventsMatch && req.method === 'GET') {
    const periodId = periodEventsMatch[1];
    console.log(`📅 [History] GET /api/history/periods/${periodId}/events - Generating with LLM (no cache)...`);
    
    // Always generate events using LLM (no cache)
    generateHistoricalPeriods().then(periods => {
      const period = periods.find((p: any) => p.id === periodId);
      
      if (!period) {
        sendJsonResponse(404, { error: 'Period not found' });
        return;
      }
      
      // Generate events asynchronously (no cache)
      console.log(`📅 [History] Generating events for period: ${period.name}`);
      generatePeriodEvents(period).then(events => {
        console.log(`📅 [History] Generated ${events.length} events for ${period.name}`);
        sendJsonResponse(200, events);
      }).catch((error: any) => {
        console.error('Failed to generate period events:', error);
        sendJsonResponse(500, { error: error.message });
      });
    }).catch((error: any) => {
      console.error('Failed to load periods:', error);
      sendJsonResponse(500, { error: error.message });
    });
    
    return true;
  }

  // GET /api/history/figures
  if (pathname === '/api/history/figures' && req.method === 'GET') {
    console.log('👤 [History] GET /api/history/figures - Generating with LLM (no cache)...');
    
    // Always generate figures using LLM (no cache)
    generateHistoricalFigures().then((figures: any[]) => {
      console.log('👤 [History] Generated', figures.length, 'figures');
      sendJsonResponse(200, figures);
    }).catch((error: any) => {
      console.error('Failed to generate figures:', error);
      sendJsonResponse(500, { error: error.message });
    });
    
    return true;
  }
  
  // POST /api/history/autobiography/ask
  if (pathname === '/api/history/autobiography/ask' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { figureId, question, conversationHistory } = JSON.parse(body);
        
        if (!figureId || !question) {
          sendJsonResponse(400, { error: 'Missing figureId or question' });
          return;
        }
        
        const response = await generateAutobiographyResponse(figureId, question, conversationHistory || []);
        sendJsonResponse(200, { response });
      } catch (error: any) {
        console.error('Autobiography ask error:', error);
        sendJsonResponse(500, { error: error.message });
      }
    });
    return true;
  }
  
  // POST /api/history/whatif
  if (pathname === '/api/history/whatif' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { scenario } = JSON.parse(body);
        
        if (!scenario) {
          sendJsonResponse(400, { error: 'Missing scenario' });
          return;
        }
        
        const result = await generateWhatIfScenario(scenario);
        sendJsonResponse(200, { result });
      } catch (error: any) {
        console.error('What-if generation error:', error);
        sendJsonResponse(500, { error: error.message });
      }
    });
    return true;
  }
  
  // POST /api/history/search
  if (pathname === '/api/history/search' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const { query } = JSON.parse(body);
        
        if (!query) {
          sendJsonResponse(400, { error: 'Missing query' });
          return;
        }
        
        const results = await searchHistory(query);
        sendJsonResponse(200, results);
      } catch (error: any) {
        console.error('History search error:', error);
        sendJsonResponse(500, { error: error.message });
      }
    });
    return true;
  }
  
  return false;
}

