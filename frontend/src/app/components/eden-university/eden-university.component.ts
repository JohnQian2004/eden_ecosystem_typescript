import { Component, OnInit, OnDestroy, ChangeDetectorRef, SecurityContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { WebSocketService } from '../../services/websocket.service';
import { getApiBaseUrl } from '../../services/api-base';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

interface Subject {
  id: string;
  name: string;
  description?: string;
  type: 'subject' | 'topic' | 'concept' | 'answer';
  parentId?: string;
  children?: Subject[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  subjectContext?: string;
}

@Component({
  selector: 'app-eden-university',
  templateUrl: './eden-university.component.html',
  styleUrls: ['./eden-university.component.scss']
})
export class EdenUniversityComponent implements OnInit, OnDestroy {
  subjects: Subject[] = [];
  currentPath: Subject[] = []; // Breadcrumb navigation
  currentSubjects: Subject[] = []; // Subjects/topics at current level
  chatMessages: ChatMessage[] = [];
  userInput: string = '';
  isProcessing: boolean = false;
  isLoadingSubjects: boolean = false;
  private apiUrl = getApiBaseUrl();
  private wsSubscription: any;

  constructor(
    private http: HttpClient,
    private wsService: WebSocketService,
    private cdr: ChangeDetectorRef,
    private sanitizer: DomSanitizer
  ) {}

  ngOnInit(): void {
    this.loadInitialSubjects();
    this.setupWebSocket();
  }

  ngOnDestroy(): void {
    if (this.wsSubscription) {
      this.wsSubscription.unsubscribe();
    }
  }

  setupWebSocket(): void {
    this.wsSubscription = this.wsService.events$.subscribe((event: any) => {
      if (event.type === 'llm_response') {
        this.handleLLMResponse(event);
      }
    });
  }

  async loadInitialSubjects(): Promise<void> {
    this.isLoadingSubjects = true;
    try {
      const response = await this.http.post<{success: boolean, subjects: Subject[]}>(`${this.apiUrl}/api/university/subjects`, {
        action: 'list_main_subjects'
      }).toPromise();

      if (response && response.success && response.subjects) {
        this.subjects = response.subjects;
        this.currentSubjects = response.subjects;
        this.currentPath = [];
        this.cdr.detectChanges();
      }
    } catch (error: any) {
      console.error('Error loading subjects:', error);
      this.addChatMessage('assistant', `Error loading subjects: ${error.message}`);
    } finally {
      this.isLoadingSubjects = false;
    }
  }

  async selectSubject(subject: Subject): Promise<void> {
    if (subject.type === 'answer') {
      // Final answer - show in chat
      this.addChatMessage('assistant', subject.description || subject.name);
      return;
    }

    // Add to path
    this.currentPath.push(subject);
    
    // Load children/subtopics
    this.isLoadingSubjects = true;
    try {
      const response = await this.http.post<{success: boolean, subjects: Subject[]}>(`${this.apiUrl}/api/university/subjects`, {
        action: 'drill_down',
        subjectId: subject.id,
        subjectName: subject.name,
        path: this.currentPath.map(s => s.name)
      }).toPromise();

      if (response && response.success && response.subjects) {
        this.currentSubjects = response.subjects;
        this.cdr.detectChanges();
      }
    } catch (error: any) {
      console.error('Error loading subtopics:', error);
      this.addChatMessage('assistant', `Error loading subtopics: ${error.message}`);
    } finally {
      this.isLoadingSubjects = false;
    }
  }

  navigateToPath(index: number): void {
    // Navigate back to a specific point in the path
    this.currentPath = this.currentPath.slice(0, index + 1);
    if (index === -1) {
      // Go back to root
      this.currentSubjects = this.subjects;
    } else {
      // Reload subjects for the selected path level
      this.selectSubject(this.currentPath[index]);
    }
  }

  async sendMessage(): Promise<void> {
    const input = this.userInput.trim();
    if (!input || this.isProcessing) return;

    this.addChatMessage('user', input);
    this.userInput = '';
    this.isProcessing = true;

    try {
      const response = await this.http.post<{success: boolean, message: string}>(`${this.apiUrl}/api/university/chat`, {
        message: input,
        context: {
          currentPath: this.currentPath.map(s => s.name),
          currentSubjects: this.currentSubjects.map(s => s.name)
        }
      }).toPromise();

      if (response && response.success && response.message) {
        this.addChatMessage('assistant', response.message);
      }
    } catch (error: any) {
      console.error('Error sending message:', error);
      this.addChatMessage('assistant', `Error: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  handleLLMResponse(event: any): void {
    const message = event.data?.response?.message || event.data?.message || event.message || '';
    if (message && typeof message === 'string' && message.trim()) {
      this.addChatMessage('assistant', message);
    }
  }

  addChatMessage(role: 'user' | 'assistant', content: string): void {
    this.chatMessages.push({
      id: `msg-${Date.now()}-${Math.random()}`,
      role,
      content,
      timestamp: Date.now()
    });
    this.cdr.detectChanges();
    // Scroll to bottom
    setTimeout(() => {
      const chatContainer = document.querySelector('.eden-university-chat-messages');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 100);
  }

  clearChat(): void {
    this.chatMessages = [];
    this.cdr.detectChanges();
  }

  // Convert markdown to HTML for better formatting (especially for quizzes)
  renderMarkdown(text: string): SafeHtml {
    if (!text) return '';
    
    let html = text;
    
    // Code blocks first (before other processing)
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Quiz sections (bold headers like "**Atomic Theory Quiz:**")
    html = html.replace(/\*\*(.*? Quiz:.*?)\*\*/g, '<h4 class="quiz-section">$1</h4>');
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Process lines for quiz formatting
    const lines = html.split('\n');
    let processedLines: string[] = [];
    let inQuestion = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Detect numbered questions (1. Question text)
      const questionMatch = line.match(/^(\d+)\.\s+\*\*(.*?)\*\*/);
      if (questionMatch) {
        if (inQuestion) processedLines.push('</div>');
        processedLines.push(`<div class="quiz-question"><strong>${questionMatch[1]}. ${questionMatch[2]}</strong>`);
        inQuestion = true;
        continue;
      }
      
      // Detect questions without bold (1. Question text)
      const questionMatch2 = line.match(/^(\d+)\.\s+(.*?)$/);
      if (questionMatch2 && !line.includes('Answer:')) {
        if (inQuestion) processedLines.push('</div>');
        processedLines.push(`<div class="quiz-question"><strong>${questionMatch2[1]}. ${questionMatch2[2]}</strong>`);
        inQuestion = true;
        continue;
      }
      
      // Detect multiple choice options (- A. Option)
      const optionMatch = line.match(/^-\s*([A-D])\.\s+(.*?)$/);
      if (optionMatch) {
        if (!inQuestion) processedLines.push('<div class="quiz-question">');
        processedLines.push(`<div class="quiz-option"><strong>${optionMatch[1]}.</strong> ${optionMatch[2]}</div>`);
        inQuestion = true;
        continue;
      }
      
      // Detect answers (- Answer: answer text)
      const answerMatch = line.match(/^-\s*Answer:\s*(.*?)$/);
      if (answerMatch) {
        if (inQuestion) {
          processedLines.push('</div>');
          inQuestion = false;
        }
        processedLines.push(`<div class="quiz-answer"><strong>Answer:</strong> ${answerMatch[1]}</div>`);
        continue;
      }
      
      // Regular line
      if (inQuestion && line.trim() && !line.match(/^(\d+)\./)) {
        // Continue question block
        processedLines.push(line);
      } else {
        if (inQuestion) {
          processedLines.push('</div>');
          inQuestion = false;
        }
        processedLines.push(line);
      }
    }
    if (inQuestion) processedLines.push('</div>');
    
    html = processedLines.join('\n');
    
    // Process regular lists (bullet and numbered) for non-quiz content
    const listLines = html.split('\n');
    let inList = false;
    let listType = '';
    let finalLines: string[] = [];
    
    for (let i = 0; i < listLines.length; i++) {
      const line = listLines[i];
      // Skip if already processed as quiz content
      if (line.includes('quiz-question') || line.includes('quiz-option') || line.includes('quiz-answer') || 
          line.includes('quiz-section') || line.startsWith('<pre') || line.startsWith('<h')) {
        if (inList) {
          finalLines.push(`</${listType}>`);
          inList = false;
        }
        finalLines.push(line);
        continue;
      }
      
      const bulletMatch = line.match(/^[\-\*] (.*)$/);
      const numberedMatch = line.match(/^(\d+)\. (.*)$/);
      
      if (bulletMatch || numberedMatch) {
        const itemText = bulletMatch ? bulletMatch[1] : numberedMatch![2];
        const currentListType = bulletMatch ? 'ul' : 'ol';
        
        if (!inList || listType !== currentListType) {
          if (inList) {
            finalLines.push(`</${listType}>`);
          }
          finalLines.push(`<${currentListType}>`);
          inList = true;
          listType = currentListType;
        }
        finalLines.push(`<li>${itemText}</li>`);
      } else {
        if (inList) {
          finalLines.push(`</${listType}>`);
          inList = false;
        }
        finalLines.push(line);
      }
    }
    if (inList) {
      finalLines.push(`</${listType}>`);
    }
    html = finalLines.join('\n');
    
    // Bold and italic (after lists to avoid conflicts)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // Line breaks - convert double newlines to paragraph breaks
    html = html.split('\n\n').map(para => {
      para = para.trim();
      if (!para) return '';
      if (para.startsWith('<h') || para.startsWith('<ul') || para.startsWith('<ol') || para.startsWith('<pre') || 
          para.includes('quiz-')) {
        return para;
      }
      return `<p>${para}</p>`;
    }).join('\n');
    
    // Single newlines to br (but not inside pre/code)
    html = html.replace(/\n/g, '<br>');
    
    const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, html) || '';
    return this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }
}

