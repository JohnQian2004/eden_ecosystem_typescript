/**
 * RAG Knowledge Generator - Uses LLM to automatically extract knowledge from white paper
 * 
 * This module uses the LLM to read the white paper and generate structured knowledge documents
 * for the RAG system, rather than manually creating them.
 */

import * as fs from 'fs';
import * as path from 'path';
import { callLLM } from '../llm';
import { EdenKnowledgeDocument } from './edenKnowledgeBase';

const WHITEPAPER_PATH = path.resolve(__dirname, '../../requirements/eden_sim_whitepaper_v1_20251229.md');

/**
 * LLM prompt for extracting knowledge from white paper sections
 */
const KNOWLEDGE_EXTRACTION_PROMPT = `You are an expert knowledge extraction system for Eden. Your task is to read sections of the Eden white paper and extract structured knowledge documents.

For each section provided, extract:
1. **Title**: Clear, descriptive title
2. **Content**: Comprehensive explanation of the concept, feature, or system
3. **Category**: One of: 'architecture', 'governance', 'features', 'concepts', 'ui', 'messaging', 'dex', 'deployment'
4. **Keywords**: Array of relevant keywords for search (5-10 keywords)

**Content Requirements:**
- Be comprehensive and accurate
- Include key technical details
- Explain how concepts relate to each other
- Use clear, technical language
- Reference specific sections when relevant

**Output Format (JSON):**
{
  "documents": [
    {
      "id": "unique-id",
      "title": "Title of the knowledge document",
      "content": "Comprehensive content explaining the concept...",
      "category": "architecture|governance|features|concepts|ui|messaging|dex|deployment",
      "keywords": ["keyword1", "keyword2", "keyword3"]
    }
  ]
}

Return ONLY valid JSON. No markdown, no explanations, just the JSON object.`;

/**
 * Generate RAG knowledge documents from white paper using LLM
 */
export async function generateRAGKnowledgeFromWhitepaper(): Promise<EdenKnowledgeDocument[]> {
  console.log('📚 [RAG Generator] Starting knowledge extraction from white paper...');
  
  if (!fs.existsSync(WHITEPAPER_PATH)) {
    throw new Error(`White paper not found at: ${WHITEPAPER_PATH}`);
  }

  const whitepaperContent = fs.readFileSync(WHITEPAPER_PATH, 'utf-8');
  
  // Split white paper into manageable sections (by ## headers)
  const sections = splitWhitepaperIntoSections(whitepaperContent);
  
  console.log(`📚 [RAG Generator] Found ${sections.length} sections in white paper`);
  
  const allDocuments: EdenKnowledgeDocument[] = [];
  
  // Process each section through LLM
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    console.log(`📚 [RAG Generator] Processing section ${i + 1}/${sections.length}: ${section.title.substring(0, 50)}...`);
    
    try {
      const prompt = `${KNOWLEDGE_EXTRACTION_PROMPT}\n\n## White Paper Section:\n\n${section.content}`;
      const llmResponse = await callLLM(prompt, true);
      
      // Parse LLM response (should be JSON)
      const parsed = JSON.parse(llmResponse);
      
      if (parsed.documents && Array.isArray(parsed.documents)) {
        // Validate and add documents
        parsed.documents.forEach((doc: any) => {
          if (doc.title && doc.content && doc.category && doc.keywords) {
            allDocuments.push({
              id: doc.id || `auto-${Date.now()}-${Math.random().toString(36).substring(7)}`,
              title: doc.title,
              content: doc.content,
              category: doc.category,
              keywords: doc.keywords
            });
          }
        });
      }
    } catch (error: any) {
      console.error(`❌ [RAG Generator] Error processing section ${i + 1}:`, error.message);
      // Continue with next section
    }
  }
  
  console.log(`✅ [RAG Generator] Generated ${allDocuments.length} knowledge documents from white paper`);
  return allDocuments;
}

/**
 * Split white paper into sections based on ## headers
 */
function splitWhitepaperIntoSections(content: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = [];
  const lines = content.split('\n');
  
  let currentSection: { title: string; content: string } | null = null;
  let currentContent: string[] = [];
  
  for (const line of lines) {
    // Check for ## header (main sections)
    if (line.startsWith('## ') && !line.startsWith('###')) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join('\n');
        sections.push(currentSection);
      }
      
      // Start new section
      const title = line.substring(3).trim();
      currentSection = { title, content: '' };
      currentContent = [line]; // Include the header in content
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  
  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n');
    sections.push(currentSection);
  }
  
  return sections;
}

/**
 * Generate and save RAG knowledge base from white paper
 */
export async function generateAndSaveRAGKnowledge(): Promise<void> {
  const documents = await generateRAGKnowledgeFromWhitepaper();
  
  // Save to knowledge base file
  const outputPath = path.resolve(__dirname, 'edenKnowledgeBase.generated.ts');
  const output = `/**
 * Auto-generated Eden Knowledge Base from White Paper v1.28
 * 
 * This file is automatically generated by RAG Generator using LLM.
 * DO NOT EDIT MANUALLY - regenerate using generateRAGKnowledgeFromWhitepaper()
 * 
 * Generated: ${new Date().toISOString()}
 */

import { EdenKnowledgeDocument } from './edenKnowledgeBase';

export const EDEN_KNOWLEDGE_BASE_GENERATED: EdenKnowledgeDocument[] = ${JSON.stringify(documents, null, 2)};
`;
  
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`✅ [RAG Generator] Saved ${documents.length} documents to ${outputPath}`);
}

