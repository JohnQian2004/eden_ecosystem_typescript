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
 * Repair incomplete or malformed JSON string
 * Handles common issues like missing commas, incomplete values, unclosed braces, etc.
 */
function repairJSON(jsonStr: string): string {
  let repaired = jsonStr;
  
  // Fix incomplete property values (e.g., "property": without value)
  repaired = repaired.replace(/:\s*$/gm, ': null');
  repaired = repaired.replace(/:\s*,\s*/g, ': null,');
  repaired = repaired.replace(/:\s*}/g, ': null}');
  repaired = repaired.replace(/:\s*]/g, ': null]');
  
  // Fix unquoted words that should be numbers or null
  repaired = repaired.replace(/:\s*(present|current|now)\s*([,}])/gi, ': 2026$2');
  repaired = repaired.replace(/:\s*(present|current|now)\s*]/gi, ': 2026]');
  
  // Fix trailing commas before closing braces/brackets
  repaired = repaired.replace(/,\s*}/g, '}');
  repaired = repaired.replace(/,\s*]/g, ']');
  repaired = repaired.replace(/,\s*,/g, ',');
  
  // Fix incomplete strings (unclosed quotes)
  // Find strings that start with " but don't have a closing " before the next : or ,
  repaired = repaired.replace(/"([^"]*?)(?=\s*[:\],}])/g, (match, content) => {
    // If the match doesn't end with ", it's incomplete - close it
    if (!match.endsWith('"')) {
      return `"${content.replace(/"/g, '\\"')}"`;
    }
    return match;
  });
  
  // Fix incomplete objects - ensure all opening braces have closing braces
  let openBraces = (repaired.match(/{/g) || []).length;
  let closeBraces = (repaired.match(/}/g) || []).length;
  if (openBraces > closeBraces) {
    repaired += '}'.repeat(openBraces - closeBraces);
  }
  
  // Fix incomplete arrays - ensure all opening brackets have closing brackets
  let openBrackets = (repaired.match(/\[/g) || []).length;
  let closeBrackets = (repaired.match(/\]/g) || []).length;
  if (openBrackets > closeBrackets) {
    repaired += ']'.repeat(openBrackets - closeBrackets);
  }
  
  // Remove incomplete property at the end (property name followed by colon but no value)
  repaired = repaired.replace(/,\s*"[^"]+"\s*:\s*$/g, '');
  repaired = repaired.replace(/,\s*"[^"]+"\s*:\s*}/g, '}');
  repaired = repaired.replace(/,\s*"[^"]+"\s*:\s*]/g, ']');
  
  // Fix double commas
  repaired = repaired.replace(/,\s*,/g, ',');
  
  // Fix missing commas between objects in arrays
  repaired = repaired.replace(/}\s*{/g, '},{');
  
  // Fix missing commas between properties
  repaired = repaired.replace(/"\s*"/g, '","');
  repaired = repaired.replace(/}\s*"/g, '},"');
  repaired = repaired.replace(/]\s*"/g, '],"');
  
  return repaired;
}

/**
 * Safely parse JSON with repair attempts
 */
function safeParseJSON(jsonStr: string, context: string = ''): any {
  // First, try to extract JSON from markdown code blocks
  let cleaned = jsonStr.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/```\n?/g, '').trim();
  }
  
  // Extract JSON object/array
  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  let startIndex = -1;
  let endChar = '';
  
  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    startIndex = objStart;
    endChar = '}';
  } else if (arrStart !== -1) {
    startIndex = arrStart;
    endChar = ']';
  }
  
  if (startIndex !== -1) {
    const endIndex = cleaned.lastIndexOf(endChar);
    if (endIndex > startIndex) {
      cleaned = cleaned.substring(startIndex, endIndex + 1);
    } else {
      // JSON is incomplete, try to find where it cuts off
      cleaned = cleaned.substring(startIndex);
    }
  }
  
  // Fix common JSON errors
  cleaned = cleaned.replace(/\b(present|current|now)\b/gi, '2026');
  
  // Try parsing
  try {
    return JSON.parse(cleaned);
  } catch (error: any) {
    // Try repairing and parsing again
    try {
      const repaired = repairJSON(cleaned);
      return JSON.parse(repaired);
    } catch (repairError: any) {
      // If repair fails, throw original error with context
      throw new Error(`${context ? context + ': ' : ''}${error.message}`);
    }
  }
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
    try {
      const parsed = safeParseJSON(response, 'generateHistoricalPeriods');
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
      // Non-blocking: Log warning but continue with extraction
      console.warn('⚠️ [History] JSON parse warning (non-blocking):', parseError.message);
      console.log('📜 [History] Attempting to extract partial data from response...');
      
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
        console.log(`✅ [History] Extracted ${periods.length} periods from partial response`);
      } catch (extractError) {
        console.warn('⚠️ [History] Extraction warning (non-blocking):', extractError);
      }
      
      // If still no periods, return empty array (no defaults) - non-blocking
      if (periods.length === 0) {
        console.warn('⚠️ [History] No periods extracted, returning empty array (non-blocking)');
      }
    }
    
    // Always return something, even if empty - never throw
    return periods;
  } catch (error: any) {
    // Non-blocking: Log error but return empty array instead of throwing
    console.warn('⚠️ [History] Generation warning (non-blocking):', error.message);
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
      try {
        const parsed = safeParseJSON(response, 'generateHistoricalFigures');
        if (Array.isArray(parsed)) {
          figures = parsed;
        }
      } catch (parseError: any) {
      // Non-blocking: Log warning but continue with extraction
      console.warn('⚠️ [History] JSON parse warning (non-blocking):', parseError.message);
      console.log('👤 [History] Attempting to extract partial data from response...');
      
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
        console.log(`✅ [History] Extracted ${figures.length} figures from partial response`);
      } catch (extractError) {
        console.warn('⚠️ [History] Extraction warning (non-blocking):', extractError);
      }
      
      // If still no figures, return empty array (no defaults) - non-blocking
      if (figures.length === 0) {
        console.warn('⚠️ [History] No figures extracted, returning empty array (non-blocking)');
      }
    }
    
    // Always return something, even if empty - never throw
    return figures;
  } catch (error: any) {
    // Non-blocking: Log error but return empty array instead of throwing
    console.warn('⚠️ [History] Generation warning (non-blocking):', error.message);
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
  
  // Try exact ID match first
  let figure = figures.find((f: any) => f.id === figureId);
  
  // If not found, try to find by name (extract name from ID)
  if (!figure) {
    // Convert ID to name format (e.g., "frederick-the-great-prussia" -> "Frederick the Great")
    const nameFromId = figureId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    // Try exact name match
    figure = figures.find((f: any) => 
      f.name.toLowerCase() === nameFromId.toLowerCase() ||
      f.name.toLowerCase().includes(nameFromId.toLowerCase()) ||
      nameFromId.toLowerCase().includes(f.name.toLowerCase())
    );
    
    // Try partial match on ID
    if (!figure) {
      figure = figures.find((f: any) => 
        f.id.toLowerCase().includes(figureId.toLowerCase()) ||
        figureId.toLowerCase().includes(f.id.toLowerCase())
      );
    }
  }
  
  if (!figure) {
    // Last resort: try to find by searching in the conversation history for the figure name
    const figureNameFromHistory = conversationHistory
      .find(msg => msg.role === 'figure')?.content
      ?.match(/(?:I am|I'm|This is)\s+([^.]+)/i)?.[1]
      ?.trim();
    
    if (figureNameFromHistory) {
      figure = figures.find((f: any) => 
        f.name.toLowerCase().includes(figureNameFromHistory.toLowerCase()) ||
        figureNameFromHistory.toLowerCase().includes(f.name.toLowerCase())
      );
    }
  }
  
  // If still not found, try to generate figure on-demand from the ID
  if (!figure) {
    console.log(`🔍 [History] Figure "${figureId}" not in global list, attempting to generate on-demand...`);
    
    // Extract name from ID (e.g., "frederick-the-great-prussia" -> "Frederick the Great")
    const nameFromId = figureId
      .split('-')
      .filter(part => part !== 'prussia' && part !== 'the' && part !== 'of') // Remove common suffixes
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/\bThe\b/g, 'the'); // Fix "The" capitalization
    
    // Try to search for this figure using LLM
    try {
      const searchPrompt = `You are a world history expert. Provide brief information about the historical figure: ${nameFromId}

Return ONLY a JSON object with this exact format (no markdown, no explanations):
{
  "id": "${figureId}",
  "name": "Full Name",
  "birthYear": number (can be negative for BCE),
  "deathYear": number or null,
  "nationality": "Country",
  "occupation": "Occupation",
  "biography": "2-3 sentence biography"
}`;

      const searchResponse = await callLLM(searchPrompt, true);
      let figureData: any = null;
      
      // Try to parse the response
      try {
        figureData = safeParseJSON(searchResponse, 'generateAutobiographyResponse on-demand figure');
      } catch (parseError) {
        console.warn('⚠️ [History] Could not parse on-demand figure data, using fallback');
        // Use a fallback with the name we extracted
        figureData = {
          id: figureId,
          name: nameFromId,
          birthYear: 0,
          deathYear: null,
          nationality: 'Unknown',
          occupation: 'Historical Figure',
          biography: `A historical figure known as ${nameFromId}.`
        };
      }
      
      figure = figureData;
      console.log(`✅ [History] Generated figure on-demand: ${figure.name}`);
    } catch (error: any) {
      console.warn(`⚠️ [History] Could not generate figure on-demand: ${error.message}`);
      console.warn(`Available figures:`, figures.slice(0, 5).map((f: any) => `${f.id} (${f.name})`).join(', '), '...');
      throw new Error(`Historical figure not found: ${figureId}. Please try selecting a figure from the biography list.`);
    }
  }
  
  // Build context from conversation history
  const historyContext = conversationHistory
    .map(msg => `${msg.role === 'user' ? 'User' : figure.name}: ${msg.content}`)
    .join('\n');
  
  const prompt = `You are ${figure.name}${figure.birthYear ? ` (${figure.birthYear}${figure.deathYear ? `-${figure.deathYear}` : ''})` : ''}, ${figure.occupation}${figure.nationality ? ` from ${figure.nationality}` : ''}.

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
 * Generate popular historical figures and events
 */
async function generatePopularItems(): Promise<Array<{
  id: string;
  name: string;
  type: 'figure' | 'event';
  year?: number;
  country?: string;
}>> {
  const prompt = `You are a world history expert. Generate a list of 10-12 of the most popular and well-known historical figures and events that people commonly search for or want to learn about.

Include a mix of:
- Famous historical figures from different time periods and regions
- Major historical events that shaped the world
- Diverse representation across different continents and cultures
- Both ancient and modern figures/events

For each item, provide:
- id: lowercase, hyphenated (e.g., "thomas-edison", "world-war-ii")
- name: full name or event title
- type: either "figure" or "event"
- year: the birth year for figures, or start year for events (can be negative for BCE)
- country: the country most associated with this figure/event

CRITICAL JSON REQUIREMENTS:
- All years MUST be numbers (not words like "present")
- For current year, use 2026
- All strings MUST be in double quotes
- All numbers MUST NOT have quotes
- Return ONLY valid JSON that can be parsed by JSON.parse()
- No markdown code blocks, no explanations, just pure JSON

Return your response as a JSON array in this exact format:
[
  {
    "id": "thomas-edison",
    "name": "Thomas Edison",
    "type": "figure",
    "year": 1847,
    "country": "United States"
  },
  {
    "id": "world-war-ii",
    "name": "World War II",
    "type": "event",
    "year": 1939,
    "country": "Germany"
  }
]

Return ONLY valid JSON. No markdown, no explanations, just the JSON array.`;

  try {
    const response = await callLLM(prompt, true);
    
    console.log(`⭐ [History] Raw LLM popular items response`);
    console.log('=====================================');
    console.log(response);
    console.log('=====================================');
    
    // Parse JSON response
    let popularItems: any[] = [];
    let jsonStr = '';
    try {
      // Parse JSON response using safe parser
      popularItems = safeParseJSON(response, 'generatePopularItems');
      
      // Ensure it's an array
      if (!Array.isArray(popularItems)) {
        popularItems = [];
      }
      
      // Validate and ensure required fields
      popularItems = popularItems
        .filter((item: any) => item && item.id && item.name && item.type)
        .map((item: any) => ({
          id: item.id,
          name: item.name,
          type: item.type === 'event' ? 'event' : 'figure',
          year: item.year,
          country: item.country
        }));
      
      console.log(`✅ [History] Generated ${popularItems.length} popular items`);
      
    } catch (parseError: any) {
      console.warn(`⚠️ [History] JSON parse warning for popular items:`, parseError.message);
      console.log('👤 [History] Attempting to extract partial data from response...');
      
      // Try to extract partial data
      try {
        const itemsMatch = response.match(/\[(.*?)\]/s);
        if (itemsMatch) {
          // Try to extract complete objects
          const extractCompleteObjects = (content: string): any[] => {
            const objects: any[] = [];
            let depth = 0;
            let currentObject = '';
            let inString = false;
            let escapeNext = false;
            
            for (let i = 0; i < content.length; i++) {
              const char = content[i];
              
              if (escapeNext) {
                currentObject += char;
                escapeNext = false;
                continue;
              }
              
              if (char === '\\') {
                escapeNext = true;
                currentObject += char;
                continue;
              }
              
              if (char === '"' && !escapeNext) {
                inString = !inString;
                currentObject += char;
                continue;
              }
              
              if (inString) {
                currentObject += char;
                continue;
              }
              
              if (char === '{') {
                if (depth === 0) {
                  currentObject = '{';
                } else {
                  currentObject += char;
                }
                depth++;
              } else if (char === '}') {
                currentObject += char;
                depth--;
                if (depth === 0) {
                  try {
                    let fixedObject = currentObject
                      .replace(/,\s*}/g, '}')
                      .replace(/,\s*]/g, ']')
                      .replace(/:\s*$/gm, ': null')
                      .replace(/:\s*,\s*/g, ': null,')
                      .replace(/:\s*}/g, ': null}')
                      .replace(/:\s*]/g, ': null]')
                      .replace(/\b(present|current|now)\b/gi, '2026');
                    
                    const parsed = JSON.parse(fixedObject);
                    if (parsed.id && parsed.name && parsed.type) {
                      objects.push(parsed);
                    }
                  } catch (e) {
                    // Skip invalid objects
                  }
                  currentObject = '';
                }
              } else {
                if (depth > 0) {
                  currentObject += char;
                }
              }
            }
            
            return objects;
          };
          
          popularItems = extractCompleteObjects(itemsMatch[1]);
          console.log(`✅ [History] Extracted ${popularItems.length} popular items from partial response`);
        }
      } catch (extractError) {
        console.warn('Could not extract popular items from partial response');
      }
    }
    
    // Fallback to default list if extraction failed
    if (popularItems.length === 0) {
      console.warn('⚠️ [History] Using fallback popular items list');
      popularItems = [
        { id: 'edison', name: 'Thomas Edison', type: 'figure', year: 1847, country: 'United States' },
        { id: 'washington', name: 'George Washington', type: 'figure', year: 1732, country: 'United States' },
        { id: 'napoleon', name: 'Napoleon Bonaparte', type: 'figure', year: 1769, country: 'France' },
        { id: 'einstein', name: 'Albert Einstein', type: 'figure', year: 1879, country: 'Germany' },
        { id: 'caesar', name: 'Julius Caesar', type: 'figure', year: -100, country: 'Italy' },
        { id: 'cleopatra', name: 'Cleopatra', type: 'figure', year: -69, country: 'Egypt' },
        { id: 'ww2', name: 'World War II', type: 'event', year: 1939, country: 'Germany' }
      ];
    }
    
    return popularItems;
  } catch (error: any) {
    console.error('Failed to generate popular items:', error);
    // Return fallback list
    return [
      { id: 'edison', name: 'Thomas Edison', type: 'figure', year: 1847, country: 'United States' },
      { id: 'washington', name: 'George Washington', type: 'figure', year: 1732, country: 'United States' },
      { id: 'napoleon', name: 'Napoleon Bonaparte', type: 'figure', year: 1769, country: 'France' },
      { id: 'einstein', name: 'Albert Einstein', type: 'figure', year: 1879, country: 'Germany' },
      { id: 'caesar', name: 'Julius Caesar', type: 'figure', year: -100, country: 'Italy' },
      { id: 'cleopatra', name: 'Cleopatra', type: 'figure', year: -69, country: 'Egypt' },
      { id: 'ww2', name: 'World War II', type: 'event', year: 1939, country: 'Germany' }
    ];
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
          console.log(`✅ [History] Extracted ${extractedEvents.length} events using fallback regex method`);
          events = extractedEvents.slice(0, 12); // Limit to 12 events
        } else {
          console.warn('⚠️ [History] No events extracted, returning empty array (non-blocking)');
        }
      } catch (fallbackError) {
        console.warn('⚠️ [History] Fallback extraction warning (non-blocking):', fallbackError);
      }
    }
    
    // Always return something, even if empty - never throw
    return events;
  } catch (error: any) {
    // Non-blocking: Log error but return empty array instead of throwing
    console.warn('⚠️ [History] Generation warning (non-blocking):', error.message);
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
 * Generate continents and countries list using LLM
 */
async function generateContinentsAndCountries(): Promise<Array<{ name: string; countries: string[] }>> {
  const prompt = `You are a world geography expert. Generate a comprehensive list of all countries organized by continent.

Create a JSON object with continents as keys and arrays of country names as values. Include all major countries from each continent.

Continents to include:
- Africa
- Asia
- Europe
- North America
- South America
- Oceania
- Antarctica (can be empty or minimal)

For each continent, list all countries. Use standard country names (e.g., "United States" not "USA", "United Kingdom" not "UK").

Return ONLY valid JSON in this exact format:
[
  {
    "name": "Africa",
    "countries": ["Algeria", "Angola", "Benin", "Botswana", ...]
  },
  {
    "name": "Asia",
    "countries": ["Afghanistan", "Armenia", "Azerbaijan", "Bahrain", ...]
  },
  {
    "name": "Europe",
    "countries": ["Albania", "Andorra", "Austria", "Belarus", ...]
  },
  {
    "name": "North America",
    "countries": ["Antigua and Barbuda", "Bahamas", "Barbados", ...]
  },
  {
    "name": "South America",
    "countries": ["Argentina", "Bolivia", "Brazil", "Chile", ...]
  },
  {
    "name": "Oceania",
    "countries": ["Australia", "Fiji", "Kiribati", "New Zealand", ...]
  }
]

CRITICAL: Return ONLY valid JSON. No markdown, no explanations, just the JSON array.`;

  try {
    const response = await callLLM(prompt, true);
    
    console.log('🌍 [History] Raw LLM continents response:');
    console.log('=====================================');
    console.log(response);
    console.log('=====================================');
    
    // Parse JSON response
    let continents: Array<{ name: string; countries: string[] }> = [];
    let jsonStr = '';
    try {
      // Try to extract JSON from response
      jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '').trim();
      }
      
      continents = safeParseJSON(response, 'generateContinents');
      
      // Validate structure
      if (!Array.isArray(continents)) {
        throw new Error('Response is not an array');
      }
      
      // Ensure all entries have name and countries
      continents = continents.filter(c => c && c.name && Array.isArray(c.countries));
      
      console.log(`✅ [History] Parsed ${continents.length} continents with ${continents.reduce((sum, c) => sum + c.countries.length, 0)} total countries`);
      
    } catch (parseError: any) {
      console.warn(`⚠️ [History] JSON parse warning (non-blocking):`, parseError.message);
      console.log('👤 [History] Attempting to extract partial data from response...');
      
      // Fallback: create basic structure
      continents = [
        { name: 'Africa', countries: ['Egypt', 'South Africa', 'Nigeria', 'Kenya', 'Morocco'] },
        { name: 'Asia', countries: ['China', 'India', 'Japan', 'South Korea', 'Thailand'] },
        { name: 'Europe', countries: ['France', 'Germany', 'Italy', 'Spain', 'United Kingdom'] },
        { name: 'North America', countries: ['United States', 'Canada', 'Mexico', 'Cuba', 'Jamaica'] },
        { name: 'South America', countries: ['Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia'] },
        { name: 'Oceania', countries: ['Australia', 'New Zealand', 'Fiji', 'Papua New Guinea'] }
      ];
      
      console.log(`✅ [History] Using fallback continents data: ${continents.length} continents`);
    }
    
    return continents;
  } catch (error: any) {
    console.error('Failed to generate continents:', error);
    // Return fallback data
    return [
      { name: 'Africa', countries: ['Egypt', 'South Africa', 'Nigeria', 'Kenya', 'Morocco'] },
      { name: 'Asia', countries: ['China', 'India', 'Japan', 'South Korea', 'Thailand'] },
      { name: 'Europe', countries: ['France', 'Germany', 'Italy', 'Spain', 'United Kingdom'] },
      { name: 'North America', countries: ['United States', 'Canada', 'Mexico', 'Cuba', 'Jamaica'] },
      { name: 'South America', countries: ['Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia'] },
      { name: 'Oceania', countries: ['Australia', 'New Zealand', 'Fiji', 'Papua New Guinea'] }
    ];
  }
}

/**
 * Extract partial JSON data from incomplete/malformed JSON response
 * Handles truncated responses by finding complete objects within arrays
 */
function extractPartialJSON(jsonStr: string, countryName: string): {
  periods: any[];
  figures: any[];
  events: any[];
} {
  const result: { periods: any[]; figures: any[]; events: any[] } = { periods: [], figures: [], events: [] };
  
  // Helper function to extract complete objects from an array string
  function extractCompleteObjects(arrayContent: string, objectType: string): any[] {
    const objects: any[] = [];
    let depth = 0;
    let currentObject = '';
    let inString = false;
    let escapeNext = false;
    
    for (let i = 0; i < arrayContent.length; i++) {
      const char = arrayContent[i];
      
      if (escapeNext) {
        currentObject += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        currentObject += char;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
        currentObject += char;
        continue;
      }
      
      if (inString) {
        currentObject += char;
        continue;
      }
      
      if (char === '{') {
        if (depth === 0) {
          currentObject = '{';
        } else {
          currentObject += char;
        }
        depth++;
      } else if (char === '}') {
        currentObject += char;
        depth--;
        if (depth === 0) {
          // Found a complete object
          try {
            // Fix common issues before parsing
            let fixedObject = currentObject
              .replace(/,\s*}/g, '}')  // Remove trailing commas
              .replace(/,\s*]/g, ']')  // Remove trailing commas in arrays
              .replace(/:\s*$/gm, ': null')  // Fix incomplete values at end of lines
              .replace(/:\s*,\s*/g, ': null,')  // Fix missing values
              .replace(/:\s*}/g, ': null}')  // Fix missing values before closing brace
              .replace(/:\s*]/g, ': null]')  // Fix missing values before closing bracket
              .replace(/:\s*$/g, ': null')  // Fix incomplete values at end of string
              .replace(/\b(present|current|now)\b/gi, '2026');  // Replace text years
            
            const parsed = JSON.parse(fixedObject);
            objects.push(parsed);
          } catch (e) {
            // Try to fix incomplete object by removing incomplete properties
            try {
              let fixedObject = currentObject;
              // Remove incomplete property at the end (e.g., "deathYear:" or "deathYear:,")
              fixedObject = fixedObject.replace(/,\s*"[^"]+"\s*:\s*$/m, '');
              fixedObject = fixedObject.replace(/,\s*"[^"]+"\s*:\s*}/g, '}');
              fixedObject = fixedObject.replace(/,\s*"[^"]+"\s*:\s*$/g, '');
              
              // Fix other common issues
              fixedObject = fixedObject
                .replace(/,\s*}/g, '}')
                .replace(/,\s*]/g, ']')
                .replace(/:\s*}/g, ': null}')
                .replace(/:\s*]/g, ': null]')
                .replace(/\b(present|current|now)\b/gi, '2026');
              
              const parsed = JSON.parse(fixedObject);
              objects.push(parsed);
            } catch (e2) {
              // Last resort: try to extract what we can by removing the last incomplete property
              try {
                let fixedObject = currentObject;
                // Find and remove the last incomplete property (property name followed by colon but no value)
                fixedObject = fixedObject.replace(/,\s*"[^"]+"\s*:\s*[^,}\]]*$/m, '');
                fixedObject = fixedObject.replace(/,\s*}/g, '}');
                fixedObject = fixedObject.replace(/,\s*]/g, ']');
                fixedObject = fixedObject.replace(/\b(present|current|now)\b/gi, '2026');
                
                const parsed = JSON.parse(fixedObject);
                objects.push(parsed);
              } catch (e3) {
                console.warn(`Could not parse ${objectType} object:`, currentObject.substring(0, 150));
              }
            }
          }
          currentObject = '';
        }
      } else {
        if (depth > 0) {
          currentObject += char;
        }
      }
    }
    
    return objects;
  }
  
  // Extract periods array
  const periodsMatch = jsonStr.match(/"periods"\s*:\s*\[/);
  if (periodsMatch) {
    const startIndex = periodsMatch.index! + periodsMatch[0].length;
    let depth = 1;
    let endIndex = jsonStr.length; // Default to end of string if bracket not found
    
    // Find the matching closing bracket
    for (let i = startIndex; i < jsonStr.length && depth > 0; i++) {
      if (jsonStr[i] === '[') depth++;
      else if (jsonStr[i] === ']') depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
    
    if (endIndex > startIndex) {
      const periodsContent = jsonStr.substring(startIndex, endIndex);
      result.periods = extractCompleteObjects(periodsContent, 'period');
    }
  }
  
  // Extract figures array
  const figuresMatch = jsonStr.match(/"figures"\s*:\s*\[/);
  if (figuresMatch) {
    const startIndex = figuresMatch.index! + figuresMatch[0].length;
    let depth = 1;
    let endIndex = jsonStr.length; // Default to end of string if bracket not found
    
    // Find the matching closing bracket
    for (let i = startIndex; i < jsonStr.length && depth > 0; i++) {
      if (jsonStr[i] === '[') depth++;
      else if (jsonStr[i] === ']') depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
    
    if (endIndex > startIndex) {
      const figuresContent = jsonStr.substring(startIndex, endIndex);
      result.figures = extractCompleteObjects(figuresContent, 'figure');
    }
  }
  
  // Extract events array
  const eventsMatch = jsonStr.match(/"events"\s*:\s*\[/);
  if (eventsMatch) {
    const startIndex = eventsMatch.index! + eventsMatch[0].length;
    let depth = 1;
    let endIndex = jsonStr.length; // Default to end of string if bracket not found
    
    // Find the matching closing bracket
    for (let i = startIndex; i < jsonStr.length && depth > 0; i++) {
      if (jsonStr[i] === '[') depth++;
      else if (jsonStr[i] === ']') depth--;
      if (depth === 0) {
        endIndex = i;
        break;
      }
    }
    
    if (endIndex > startIndex) {
      const eventsContent = jsonStr.substring(startIndex, endIndex);
      result.events = extractCompleteObjects(eventsContent, 'event');
    }
  }
  
  return result;
}

/**
 * Generate country-specific history (periods, figures, events)
 */
async function generateCountryHistory(countryName: string): Promise<{
  periods: any[];
  figures: any[];
  events: HistoricalEvent[];
}> {
  const prompt = `You are a world history expert specializing in ${countryName}. Generate comprehensive historical information about ${countryName}, including:

1. Major historical periods (4-6 periods covering the country's history from ancient times to present)
2. Important historical figures (10-15 figures from different eras)
3. Significant historical events (10-15 major events)

For periods, provide:
- id (lowercase, hyphenated)
- name
- startYear (number, can be negative for BCE)
- endYear (number, use current year for present)
- description (1-2 sentences)
- globalEvents: [] (always empty array)

For figures, provide:
- id (lowercase, hyphenated)
- name
- birthYear (number, can be negative for BCE)
- deathYear (number or null for living)
- nationality: "${countryName}"
- occupation
- biography (2-3 sentences)
- keyEvents: [] (array of event names)
- writings: [] (array of work titles)

For events, provide:
- id (lowercase, hyphenated)
- title
- date (year or date range)
- description (2-3 sentences)
- location (specific location in ${countryName})
- perspectives: [] (array of different viewpoints)
- relatedFigures: [] (array of figure names)

CRITICAL JSON REQUIREMENTS:
- All years MUST be numbers (not words like "present")
- For current year, use 2026
- All strings MUST be in double quotes
- All numbers MUST NOT have quotes
- Return ONLY valid JSON that can be parsed by JSON.parse()
- No markdown code blocks, no explanations, just pure JSON

Return your response as a JSON object in this exact format:
{
  "periods": [...],
  "figures": [...],
  "events": [...]
}

Return ONLY valid JSON. No markdown, no explanations, just the JSON object.`;

  try {
    const response = await callLLM(prompt, true);
    
    console.log(`🌍 [History] Raw LLM country history response for: ${countryName}`);
    console.log('=====================================');
    console.log(response);
    console.log('=====================================');
    
    // Parse JSON response
    let countryHistory: any = { periods: [], figures: [], events: [] };
    let jsonStr = '';
    try {
      // Try to extract JSON from response
      jsonStr = response.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '').trim();
      }
      
      countryHistory = safeParseJSON(response, `generateCountryHistory(${countryName})`);
      
      // Ensure all required fields exist
      if (!countryHistory.periods) countryHistory.periods = [];
      if (!countryHistory.figures) countryHistory.figures = [];
      if (!countryHistory.events) countryHistory.events = [];
      
      console.log(`✅ [History] Parsed country history for ${countryName}:`, {
        periods: countryHistory.periods.length,
        figures: countryHistory.figures.length,
        events: countryHistory.events.length
      });
      
    } catch (parseError: any) {
      console.warn(`⚠️ [History] JSON parse warning (non-blocking) for ${countryName}:`, parseError.message);
      console.log('👤 [History] Attempting to extract partial data from response...');
      
      // Improved extraction: find and extract complete objects from arrays
      countryHistory = extractPartialJSON(jsonStr, countryName);
      
      console.log(`✅ [History] Extracted partial country history for ${countryName}:`, {
        periods: countryHistory.periods.length,
        figures: countryHistory.figures.length,
        events: countryHistory.events.length
      });
    }
    
    return countryHistory;
  } catch (error: any) {
    console.error(`Failed to generate country history for ${countryName}:`, error);
    throw new Error(`Failed to generate country history: ${error.message}`);
  }
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

  // GET /api/history/popular
  if (pathname === '/api/history/popular' && req.method === 'GET') {
    console.log('⭐ [History] GET /api/history/popular - Generating with LLM (no cache)...');
    
    // Always generate popular items using LLM (no cache)
    generatePopularItems().then((items: any[]) => {
      console.log('⭐ [History] Generated', items.length, 'popular items');
      sendJsonResponse(200, items);
    }).catch((error: any) => {
      console.error('Failed to generate popular items:', error);
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

  // GET /api/history/country/:countryName
  const countryMatch = pathname.match(/^\/api\/history\/country\/(.+)$/);
  if (countryMatch && req.method === 'GET') {
    const countryName = decodeURIComponent(countryMatch[1]);
    console.log(`🌍 [History] GET /api/history/country/${countryName} - Generating with LLM...`);
    
    generateCountryHistory(countryName).then(countryHistory => {
      console.log(`🌍 [History] Generated country history for ${countryName}:`, {
        periods: countryHistory.periods.length,
        figures: countryHistory.figures.length,
        events: countryHistory.events.length
      });
      sendJsonResponse(200, countryHistory);
    }).catch((error: any) => {
      console.error(`Failed to generate country history for ${countryName}:`, error);
      sendJsonResponse(500, { error: error.message });
    });
    
    return true;
  }
  
  return false;
}

