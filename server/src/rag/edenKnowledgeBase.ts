/**
 * Eden Knowledge Base for RAG (Retrieval-Augmented Generation)
 * 
 * Stores structured knowledge about Eden architecture, concepts, and features
 * for use in answering user questions.
 */

export interface EdenKnowledgeDocument {
  id: string;
  title: string;
  content: string;
  category: 'architecture' | 'governance' | 'features' | 'concepts' | 'ui' | 'messaging' | 'dex' | 'deployment' | 'bible';
  keywords: string[];
  relevanceScore?: number;
}

/**
 * Eden Knowledge Base - Structured information about Eden
 */
export const EDEN_KNOWLEDGE_BASE: EdenKnowledgeDocument[] = [
  {
    id: 'god-root-ca',
    title: 'GOD (ROOT CA) - How GOD Works in Eden',
    content: `GOD in Eden refers to ROOT CA (Root Certificate Authority), the supreme authority and law of the Eden ecosystem.

**GOD = ROOT CA**

ROOT CA alone can:
- Validate identity (ENCERT)
- Verify capability boundaries
- Accept or reject ledger entries
- Settle balances (only ROOT CA can settle transactions)
- Finalize fees
- Revoke certificates
- Write immutable judgment records

**How GOD Works:**

1. **Settlement Authority**: Gardens (priests) execute transactions, but only GOD (ROOT CA) can settle them. Each transaction is a "mini Judgment Day":
   - Garden executes → emits ledger entry (pending)
   - GOD verifies → valid → settled OR invalid → rejected/slashed

2. **Service Registry**: GOD manages the centralized ServiceRegistry - a single source of truth for all services. Gardens query ROOT CA for service discovery.

3. **Certification**: GOD certifies gardens and services, ensuring trust and quality.

4. **Governance**: GOD defines the law - what's allowed, what's forbidden, and how the system operates.

**The Metaphor:**
- **Priests (Gardens)**: Perform rituals (execute services)
- **GOD (ROOT CA)**: Judgment Day (settlement authority)
- **Law**: Clear rules that everyone follows

This separation of execution (Gardens) and settlement (GOD) makes Eden safer than traditional blockchains.`,
    category: 'governance',
    keywords: ['god', 'root ca', 'roca', 'settlement', 'authority', 'judgment', 'certification', 'governance']
  },
  {
    id: 'eden-architecture',
    title: 'Eden Architecture Overview',
    content: `Eden is a **garden-first economic and intelligence system** where the traditional blockchain is no longer the parent, but the *child* of the garden.

**Core Philosophy:**
"In Eden, no action is valid unless it is understandable, attributable, and reversible by intelligence."

**Key Features:**
- **Gas-free**: No blockchain gas fees
- **Garden-driven**: Federated, Docker-deployed nodes (Gardens) provide intelligence and routing
- **LLM-native**: Intelligence is the new gas (iGas)
- **Service-oriented**: All commerce, labor, governance flows through structured workflows
- **Self-policing, self-governing, self-replicating**: Gardens act as "priests" that certify and govern

**System Actors:**
1. **ROOT CA (GOD)**: Global certification authority, manages ServiceRegistry, handles settlement
2. **Gardens**: Federated nodes that execute services, query ROOT CA, provide intelligence
3. **Users**: Free actors who interact through natural language
4. **Service Providers**: Certified entities offering services (movies, DEX tokens, etc.)`,
    category: 'architecture',
    keywords: ['eden', 'architecture', 'garden', 'system', 'design', 'overview', 'structure']
  },
  {
    id: 'gardens-priests',
    title: 'Gardens (Priests) - Execution Layer',
    content: `Gardens are the execution layer of Eden - they act as "priests" that perform rituals (execute services).

**What Gardens Do:**
- Execute services
- Serve users
- Calculate iGas / iTax
- Emit ledger entries
- Operate freely within granted capabilities
- Query ROOT CA ServiceRegistry for service discovery

**What Gardens Cannot Do:**
- ❌ Cannot mint authority
- ❌ Cannot finalize money
- ❌ Cannot rewrite history
- ❌ Cannot settle transactions (only GOD can)

**Garden Architecture:**
- Federated, Docker-deployed nodes
- Run identical LLM versions (DeepSeek-class)
- Provide intelligence, routing, pricing, and policing
- Execute transactions but never settle them

Gardens are the "many executors" while GOD is the "one judge" in Eden's governance model.`,
    category: 'architecture',
    keywords: ['garden', 'gardens', 'priest', 'priests', 'execution', 'indexer', 'indexers']
  },
  {
    id: 'igas-itax',
    title: 'iGas and iTax - Intelligence Fees',
    content: `Eden uses intelligence fees instead of traditional blockchain gas fees.

**iGas (Intelligence Gas):**
- Intelligence is the new gas in Eden
- Paid for LLM processing, service discovery, and intelligent routing
- Minimal cost (≈0.001% typically)
- Funds the Eden economy

**iTax (Intelligence Tax):**
- Not a fee, but "obedience cost"
- Governance friction and anti-chaos constant
- Enough to discourage abuse and fund governance
- Never enough to hurt the system

**Fee Redistribution:**
Fees are distributed among:
- User (service cost)
- Provider (revenue)
- Garden (execution fee)
- GOD (settlement fee, ≈0.001%)

This creates a sustainable economy where intelligence is monetized fairly.`,
    category: 'concepts',
    keywords: ['igas', 'itax', 'fee', 'fees', 'cost', 'pricing', 'intelligence', 'gas']
  },
  {
    id: 'messaging-system',
    title: 'Universal Messaging System',
    content: `Eden includes a **Universal Messaging System** for governed, auditable communication.

**Conversations:**
- Scoped to contexts: ORDER, TRADE, SERVICE, DISPUTE, SYSTEM, GOVERNANCE
- Bounded by participants (Users, Gardens, Priests, ROOT_AUTHORITY)
- Lifecycle states: OPEN, FROZEN, CLOSED

**Messages:**
- Types: TEXT, MEDIA, ACTION, SYSTEM
- States: ACTIVE, FORGIVEN, REDACTED
- **Never deleted** (only state changes)

**When to Use:**
- User asks about Eden → Create SYSTEM conversation
- User has questions about order/trade → Create ORDER/TRADE conversation
- User needs help with service → Create SERVICE conversation
- User reports issue → Create DISPUTE conversation

Messages are immutable and auditable, creating a complete communication history.`,
    category: 'messaging',
    keywords: ['messaging', 'message', 'conversation', 'chat', 'communication', 'universal messaging']
  },
  {
    id: 'workflows',
    title: 'Eden Workflows',
    content: `Eden workflows are structured processes that guide users through service transactions.

**How Workflows Work:**
1. User types natural language request (e.g., "I want to watch a movie")
2. System detects service type and loads appropriate workflow
3. Workflow executes steps automatically
4. User makes decisions at decision points
5. Transaction is processed and settled by GOD

**Workflow Steps:**
- Service discovery (query ROOT CA ServiceRegistry)
- Provider selection
- Option display
- User decision
- Payment processing
- Ledger entry creation
- Settlement by GOD

**Two Types of Chat:**
- **EDEN CHAT**: Service requests that trigger workflows
- **REGULAR TEXT CHAT**: Questions that get direct answers

Workflows make Eden services accessible through natural language.`,
    category: 'features',
    keywords: ['workflow', 'workflows', 'process', 'steps', 'execution', 'service', 'transaction']
  },
  {
    id: 'service-registry',
    title: 'ROOT CA Service Registry',
    content: `ROOT CA manages a centralized ServiceRegistry - the single source of truth for all services in Eden.

**What ServiceRegistry Does:**
- Stores all registered service providers
- Provides quick post-LLM in-memory service lookup
- Enables service discovery for Gardens
- Certifies service quality and trust

**How It Works:**
1. Service providers register with ROOT CA (not with Gardens)
2. ROOT CA maintains centralized registry
3. Gardens query ROOT CA for service discovery
4. ROOT CA returns matching providers based on query

**Benefits:**
- Single source of truth
- Fast lookup (in-memory)
- Certified providers only
- No fragmentation

This centralized approach ensures consistency and trust across the Eden ecosystem.`,
    category: 'architecture',
    keywords: ['service registry', 'serviceregistry', 'roca', 'root ca', 'service discovery', 'provider', 'providers']
  },
  {
    id: 'judgment-day',
    title: 'Judgment Day - Transaction Settlement',
    content: `Each Eden transaction is a "mini Judgment Day" where GOD (ROOT CA) verifies and settles the transaction.

**The Process:**
1. **Garden executes** → Emits ledger entry (pending status)
2. **GOD verifies** → Checks validity, capability boundaries, identity
3. **GOD decides**:
   - ✅ Valid → Settled (transaction finalized)
   - ❌ Invalid → Rejected/Slashed (transaction denied)

**Once Settled:**
- History is frozen (immutable)
- Balances are real (finalized)
- Authority is proven (certified)

**No Appeal:**
- No rewrite
- No fork
- No reversal (except through intelligence-based reasoning)

This separation of execution (Gardens) and settlement (GOD) ensures security and trust. Gardens can execute freely, but only GOD can finalize transactions.`,
    category: 'governance',
    keywords: ['judgment', 'judgment day', 'settlement', 'settle', 'transaction', 'ledger', 'finalize', 'verify']
  },
  {
    id: 'eden-vs-blockchain',
    title: 'Why Eden is Safer Than Blockchain',
    content: `Eden separates execution, consensus, and settlement - making it safer than traditional blockchains.

**Blockchain Problems:**
- Mixes execution, consensus, and settlement
- Consensus storms
- Gas wars
- MEV (Maximal Extractable Value)
- Chain splits
- 3rd-party dependencies

**Eden Solution:**
- **Many executors** (Gardens) - distributed execution
- **One judge** (GOD/ROOT CA) - centralized settlement
- **Clear law** - explicit rules and governance

**Key Differences:**
- Gardens execute but cannot settle
- GOD settles but does not execute
- Clear separation of concerns
- No consensus needed (GOD is authority)
- No gas wars (intelligence fees are minimal)
- No MEV (GOD prevents manipulation)
- No chain splits (single settlement authority)

This architecture provides the benefits of decentralization (many executors) with the security of centralization (one judge).`,
    category: 'concepts',
    keywords: ['blockchain', 'web3', 'decentralized', 'centralized', 'security', 'safe', 'safer', 'consensus']
  },
  {
    id: 'ui-garden-main-street',
    title: 'Garden of Eden Main Street UI',
    content: `The Garden of Eden Main Street is the user interface for Eden that eliminates LLM service type resolution.

**Key Features:**
- **Service Type Cards**: Visual selection of service types (Movie, DEX, Airline, etc.)
- **Unified Chat Input**: Context-aware input that detects service type
- **No LLM Type Resolution**: Service type is selected visually, not inferred

**How It Works:**
1. User sees service type cards (Movie, DEX, Pharmacy, etc.)
2. User can click a card OR type in chat
3. System detects service type from selection or chat context
4. Appropriate workflow loads automatically

**Two Types of Chat:**
- **EDEN CHAT**: Service requests (e.g., "book a movie", "buy TOKEN")
- **REGULAR TEXT CHAT**: Questions (e.g., "what is Eden", "how does GOD work")

The UI makes Eden services accessible and intuitive.`,
    category: 'ui',
    keywords: ['ui', 'interface', 'main street', 'garden of eden', 'service type', 'card', 'chat', 'input']
  }
];

/**
 * Search knowledge base for relevant documents
 */
export function searchEdenKnowledge(query: string, limit: number = 3): EdenKnowledgeDocument[] {
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
  
  // Score documents based on keyword matches
  const scoredDocs = EDEN_KNOWLEDGE_BASE.map(doc => {
    let score = 0;
    
    // Exact title match
    if (doc.title.toLowerCase().includes(queryLower)) {
      score += 10;
    }
    
    // Keyword matches
    doc.keywords.forEach(keyword => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 5;
      }
    });
    
    // Content word matches
    queryWords.forEach(word => {
      if (doc.content.toLowerCase().includes(word)) {
        score += 1;
      }
      if (doc.title.toLowerCase().includes(word)) {
        score += 2;
      }
    });
    
    return { ...doc, relevanceScore: score };
  });
  
  // Sort by relevance and return top results
  return scoredDocs
    .filter(doc => doc.relevanceScore! > 0)
    .sort((a, b) => b.relevanceScore! - a.relevanceScore!)
    .slice(0, limit);
}

/**
 * Get knowledge context for LLM prompt
 * Uses both manual knowledge base and LLM-generated knowledge from white paper
 */
export function getKnowledgeContext(query: string): string {
  console.log(`📚 [RAG] Searching knowledge base for query: "${query}"`);
  
  // Search manual knowledge base
  const manualDocs = searchEdenKnowledge(query, 3);
  console.log(`📚 [RAG] Found ${manualDocs.length} documents in manual knowledge base`);
  
  // Try to load LLM-generated knowledge base
  let generatedDocs: EdenKnowledgeDocument[] = [];
  try {
    const { EDEN_KNOWLEDGE_BASE_GENERATED } = require('./edenKnowledgeBase.generated');
    if (EDEN_KNOWLEDGE_BASE_GENERATED && Array.isArray(EDEN_KNOWLEDGE_BASE_GENERATED)) {
      console.log(`📚 [RAG] Loaded ${EDEN_KNOWLEDGE_BASE_GENERATED.length} documents from LLM-generated knowledge base`);
      
      // Search generated knowledge base
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      
      const scoredDocs = EDEN_KNOWLEDGE_BASE_GENERATED.map((doc: EdenKnowledgeDocument) => {
        let score = 0;
        if (doc.title.toLowerCase().includes(queryLower)) score += 10;
        doc.keywords.forEach(keyword => {
          if (queryLower.includes(keyword.toLowerCase())) score += 5;
        });
        queryWords.forEach(word => {
          if (doc.content.toLowerCase().includes(word)) score += 1;
          if (doc.title.toLowerCase().includes(word)) score += 2;
        });
        return { ...doc, relevanceScore: score };
      });
      
      generatedDocs = scoredDocs
        .filter((doc: any) => doc.relevanceScore! > 0)
        .sort((a: any, b: any) => b.relevanceScore! - a.relevanceScore!)
        .slice(0, 3);
      
      console.log(`📚 [RAG] Found ${generatedDocs.length} relevant documents in LLM-generated knowledge base`);
    }
  } catch (error) {
    // Generated knowledge base not available, use manual only
    console.log(`📚 [RAG] LLM-generated knowledge base not available (this is OK if not generated yet)`);
  }
  
  // Try to load Bible knowledge base
  let bibleDocs: EdenKnowledgeDocument[] = [];
  try {
    const { BIBLE_KNOWLEDGE_BASE } = require('./bibleKnowledgeBase');
    if (BIBLE_KNOWLEDGE_BASE && Array.isArray(BIBLE_KNOWLEDGE_BASE)) {
      console.log(`📖 [RAG] Loaded ${BIBLE_KNOWLEDGE_BASE.length} documents from Bible knowledge base`);
      
      // Search Bible knowledge base (especially for Bible-related queries)
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      
      // Check if query is Bible-related
      const isBibleQuery = /\b(bible|scripture|genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalm|proverb|ecclesiastes|song|isaiah|jeremiah|lamentation|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation|chapter|verse|gospel|epistle|testament)\b/i.test(query);
      
      if (isBibleQuery) {
        const scoredDocs = BIBLE_KNOWLEDGE_BASE.map((doc: EdenKnowledgeDocument) => {
          let score = 0;
          if (doc.title.toLowerCase().includes(queryLower)) score += 20; // Higher weight for Bible queries
          doc.keywords.forEach(keyword => {
            if (queryLower.includes(keyword.toLowerCase())) score += 10; // Higher weight for Bible keywords
          });
          queryWords.forEach(word => {
            if (doc.content.toLowerCase().includes(word)) score += 2;
            if (doc.title.toLowerCase().includes(word)) score += 5;
          });
          return { ...doc, relevanceScore: score };
        });
        
        bibleDocs = scoredDocs
          .filter((doc: any) => doc.relevanceScore! > 0)
          .sort((a: any, b: any) => b.relevanceScore! - a.relevanceScore!)
          .slice(0, 5); // Get top 5 Bible results
        
        console.log(`📖 [RAG] Found ${bibleDocs.length} relevant Bible documents`);
      }
    }
  } catch (error) {
    // Bible knowledge base not available, use other sources only
    console.log(`📖 [RAG] Bible knowledge base not available (this is OK if not generated yet)`);
  }
  
  // Combine and deduplicate
  const allDocs = [...manualDocs];
  generatedDocs.forEach(genDoc => {
    if (!allDocs.find(d => d.id === genDoc.id)) {
      allDocs.push(genDoc);
    }
  });
  bibleDocs.forEach(bibleDoc => {
    if (!allDocs.find(d => d.id === bibleDoc.id)) {
      allDocs.push(bibleDoc);
    }
  });
  
  // Sort by relevance and take top 5
  const relevantDocs = allDocs
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, 5);
  
  if (relevantDocs.length === 0) {
    console.log(`⚠️ [RAG] No relevant documents found for query: "${query}"`);
    return '';
  }
  
  console.log(`✅ [RAG] Returning ${relevantDocs.length} relevant documents for query: "${query}"`);
  relevantDocs.forEach((doc, index) => {
    console.log(`   ${index + 1}. ${doc.title} (score: ${doc.relevanceScore || 0})`);
  });
  
  let context = '\n\n## Relevant Eden Knowledge:\n\n';
  relevantDocs.forEach((doc, index) => {
    context += `### ${doc.title}\n\n${doc.content}\n\n`;
  });
  
  return context;
}

