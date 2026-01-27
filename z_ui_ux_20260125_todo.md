# 🌿 Eden Home Component - UI/UX Design Document
**Date:** January 25, 2025  
**Component:** Home Component (Cloned from App Component)  
**Theme:** Eden 2028 Utopian Design with Cursor Chat Interface

---

## 📋 Overview

This document outlines the design specifications for the new Eden Home Component, which merges all existing App Component functionality with a completely redesigned UI/UX featuring:

1. **Cursor-style chat interface** (100% clone)
2. **Eden 2028 utopian background** (from promotional poster)
3. **All existing functionality preserved** with enhanced visual presentation

---

## 🎨 Visual Design Specifications

### **Color Palette**

#### Primary Colors
- **Forest Green:** `#0B3D2C` (Main brand, headers, navigation)
- **Eden Green:** `#1A5C45` (Hero background, gradients)
- **Leaf Green:** `#2E8B57` (Accents, buttons, active states)
- **Sage:** `#8FBC8F` (Secondary elements, hover states)

#### UI Colors
- **Chat Bubble (User):** `#E8F5E9` (Light mint background)
- **Chat Bubble (Eden/Assistant):** `#F0F9F0` (Very light green background)
- **Input Field:** `#FFFFFF` (White with green border `#2E8B57`)
- **Cards/Backgrounds:** `#F5F7F6` (Off-white, subtle green tint)
- **Text Primary:** `#333333` (Dark gray for readability)
- **Text Secondary:** `#666666` (Medium gray)

#### Status Colors
- **Active/Connected:** `#4CAF50` (Bright green)
- **Warning:** `#FF9800` (Amber)
- **Error:** `#F44336` (Red)
- **Info:** `#2196F3` (Blue)

#### Context Badge Colors
- **ORDER:** `#FFEB3B` (Yellow)
- **TRADE:** `#2196F3` (Blue)
- **SERVICE:** `#9C27B0` (Purple)
- **DISPUTE:** `#FF9800` (Orange)
- **SYSTEM:** `#795548` (Brown)
- **GOVERNANCE:** `#F44336` (Red)

---

## 🏗️ Layout Structure

### **1. Header Section (Top Navigation Bar)**

```
┌─────────────────────────────────────────────────────────────┐
│ 🌳 EDEN  │  Docs  │  Gardens  │  Governance  │  [User]  │  ▢ │
├─────────────────────────────────────────────────────────────┤
```

**Specifications:**
- **Background:** `#0B3D2C` (Forest Green)
- **Height:** 64px
- **Text Color:** `#FFFFFF`
- **Font:** Inter Bold, 16px
- **Logo:** 🌳 EDEN (left-aligned)
- **Navigation Items:** Docs, Gardens, Governance (center)
- **User Menu:** Profile/Sign In button (right)
- **Theme Toggle:** Dark/Light mode switch (right)

**Responsive Behavior:**
- Mobile: Hamburger menu (☰) replaces navigation items
- Tablet: Condensed navigation with icons

---

### **2. Hero Section (Center-Aligned)**

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│            🌿 Welcome to Eden                               │
│                                                             │
│    Garden-First Intelligence Marketplace                   │
│                                                             │
│    [Start Chatting]  [Explore Whitepaper]                  │
│                                                             │
│    "Conversation as the native interface"                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Specifications:**
- **Background:** Gradient from `#0B3D2C` → `#1A5C45`
- **Height:** 300px (desktop), 250px (tablet), 200px (mobile)
- **Text Alignment:** Center
- **H1:** "🌿 Welcome to Eden" - Inter Bold, 48px, `#FFFFFF`
- **H2:** "Garden-First Intelligence Marketplace" - Inter Regular, 32px, `#F0F9F0`
- **Buttons:**
  - Primary: `#2E8B57` background, `#FFFFFF` text, 16px padding, 8px border-radius
  - Secondary: Transparent background, `#2E8B57` border, `#2E8B57` text
- **Tagline:** Inter Regular, 18px, `#8FBC8F`, italic

**Background Image Integration:**
- Use the Eden 2028 promotional poster as background
- Apply `background-size: cover` with `background-position: center`
- Overlay: `rgba(11, 61, 44, 0.7)` to maintain text readability
- Crop image to fit viewport dimensions (1920x1080 recommended)

---

### **3. Main Chat Interface (Cursor-Style Clone)**

#### **3.1 Chat Window Layout**

```
┌─────────────────────────────────────────────────────────────┐
│ 🔐 Eden Chat • Certified Session                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ You: "Trade 2 SOL for USDC"                          │ │
│  │                                                       │ │
│  │ 🌿 Eden: [ORDER Context]                             │ │
│  │ "Found liquidity pool at 1 SOL = 142 USDC"          │ │
│  │ "Governance Rule 3.1 displayed..."                    │ │
│  │ "Confirm trade? [Yes] [No]"                         │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 💬 Type your workflow or question...                 │ │
│  │ [Send Button]                                        │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Specifications:**
- **Container:** Floating card design with subtle shadow
- **Width:** 90% max-width (1200px on desktop)
- **Border Radius:** 12px
- **Background:** `#FFFFFF` with `rgba(46, 139, 87, 0.05)` overlay
- **Border:** 1px solid `rgba(46, 139, 87, 0.2)`
- **Box Shadow:** `0 4px 16px rgba(0, 0, 0, 0.1)`

#### **3.2 Chat Header**

- **Background:** `#0B3D2C`
- **Text:** `#FFFFFF`, Inter Medium, 14px
- **Icon:** 🔐 (lock icon for certified session)
- **Padding:** 12px 16px
- **Border Radius:** 12px 12px 0 0

#### **3.3 Chat Messages Area**

- **Height:** 60vh (minimum 400px, maximum 800px)
- **Background:** `#F5F7F6`
- **Padding:** 20px
- **Overflow:** Auto (vertical scroll)
- **Scrollbar:** Custom styled (6px width, `#8FBC8F` thumb)

**Message Bubbles:**

**User Messages:**
- Background: `#E8F5E9`
- Border: 1px solid `#2E8B57`
- Border Radius: 18px 18px 4px 18px (rounded on left, sharp on right)
- Padding: 12px 16px
- Max Width: 70%
- Alignment: Right
- Font: Inter Regular, 14px, `#333333`

**Eden/Assistant Messages:**
- Background: `#F0F9F0`
- Border: 1px solid `#8FBC8F`
- Border Radius: 18px 18px 18px 4px (rounded on right, sharp on left)
- Padding: 12px 16px
- Max Width: 70%
- Alignment: Left
- Font: Inter Regular, 14px, `#333333`
- Icon: 🌿 (Eden icon prefix)

**System Messages:**
- Background: `rgba(46, 139, 87, 0.1)`
- Border: 1px solid `rgba(46, 139, 87, 0.3)`
- Border Radius: 8px
- Padding: 10px 14px
- Max Width: 80%
- Alignment: Center
- Font: Inter Medium, 13px, `#666666`

**Context Badges:**
- Small colored pills next to messages
- Height: 20px
- Padding: 4px 8px
- Border Radius: 10px
- Font: Inter Medium, 11px
- Colors as defined in Context Badge Colors section

#### **3.4 Chat Input Area**

- **Background:** `#FFFFFF`
- **Border:** 2px solid `#2E8B57` (focus state)
- **Border Radius:** 24px
- **Padding:** 12px 20px
- **Font:** Inter Regular, 14px
- **Placeholder:** "💬 Type your workflow or question..."
- **Min Height:** 48px
- **Max Height:** 120px (auto-expanding textarea)

**Send Button:**
- Background: `#2E8B57`
- Text: `#FFFFFF`
- Border Radius: 24px
- Padding: 12px 24px
- Icon: 📤 (send icon)
- Hover: `#1A5C45` background
- Disabled: `#8FBC8F` background, `rgba(255, 255, 255, 0.6)` text

**Input Container:**
- Flexbox layout: Input (flex: 1) + Button (fixed width)
- Gap: 12px
- Padding: 16px
- Border Top: 1px solid `rgba(46, 139, 87, 0.2)`

---

### **4. Chat History Panel (Right Sidebar)**

```
┌─────────────────────────────────────┐
│ 📜 Chat History                     │
├─────────────────────────────────────┤
│ 🔍 Search conversations...          │
│                                     │
│ Today                               │
│   • ORDER: Ticket purchase ✓        │
│   • TRADE: SOL→USDC ✓              │
│   • SYSTEM: iGas explanation        │
│                                     │
│ Yesterday                           │
│   • DISPUTE: Resolution #42         │
│   • GOVERNANCE: Rule 4.2 query      │
│                                     │
│ [Active] [Forgiven] [Redacted]      │
└─────────────────────────────────────┘
```

**Specifications:**
- **Width:** 300px (desktop), hidden on mobile (drawer)
- **Background:** `#F5F7F6`
- **Border:** 1px solid `rgba(46, 139, 87, 0.2)` (left border)
- **Height:** 100vh (fixed)
- **Position:** Fixed right side
- **Padding:** 16px

**Search Bar:**
- Background: `#FFFFFF`
- Border: 1px solid `rgba(46, 139, 87, 0.2)`
- Border Radius: 8px
- Padding: 8px 12px
- Font: Inter Regular, 13px
- Icon: 🔍 (search icon, left)

**History Items:**
- Padding: 12px
- Border Radius: 8px
- Hover: `rgba(46, 139, 87, 0.1)` background
- Active: `rgba(46, 139, 87, 0.2)` background, `#2E8B57` border-left (4px)
- Font: Inter Regular, 13px
- Context badge: Small colored pill (as defined)

**Date Headers:**
- Font: Inter Medium, 12px, `#666666`
- Text Transform: Uppercase
- Margin: 16px 0 8px 0

**Status Filters:**
- Buttons: `#FFFFFF` background, `#2E8B57` border
- Active: `#2E8B57` background, `#FFFFFF` text
- Border Radius: 6px
- Padding: 6px 12px
- Font: Inter Medium, 12px

---

### **5. Dual-Mode Chat Explanation**

```
┌───────────────┬───────────────┬───────────────┐
│   Workflow    │   Unified     │   Information │
│     Mode      │   Interface   │     Mode      │
├───────────────┼───────────────┼───────────────┤
│ "Buy tickets" │ One input box │ "Explain iGas"│
│ "Trade SOL"   │               │ "How gardens" │
│ "Send funds"  │ ┌─────────┐   │ "Governance?" │
│               │ │ Type... │   │               │
│               │ └─────────┘   │               │
│ Triggers      │ Routes to     │ Direct LLM    │
│ workflows     │ appropriate   │ responses     │
│               │ handler       │               │
└───────────────┴───────────────┴───────────────┘
```

**Specifications:**
- **Layout:** Three-column grid (responsive: stacks on mobile)
- **Card Background:** `#FFFFFF`
- **Border:** 1px solid `rgba(46, 139, 87, 0.2)`
- **Border Radius:** 12px
- **Padding:** 24px
- **Box Shadow:** `0 2px 8px rgba(0, 0, 0, 0.05)`

**Column Headers:**
- Font: Inter Bold, 18px, `#0B3D2C`
- Margin Bottom: 16px

**Content:**
- Font: Inter Regular, 14px, `#333333`
- Line Height: 1.6

---

### **6. Key Features Grid**

```
┌─────────────────────────────────────────────────────────────┐
│ 🛡️ Safe by Design    🌱 Garden-Powered                     │
├─────────────────────────────────────────────────────────────┤
│ • ROOT CA settlement  • Federated nodes                     │
│ • Rule-based governance • LLM reasoning                      │
│ • No double-spending  • Fair iGas pricing                   │
│                                                             │
│ 🔐 Certified Chat     📜 Immutable History                  │
├─────────────────────────────────────────────────────────────┤
│ • Understandable     • Never deleted                        │
│ • Attributable       • State changes only                   │
│ • Reversible         • Context-organized                    │
└─────────────────────────────────────────────────────────────┘
```

**Specifications:**
- **Layout:** Two-column grid (responsive: stacks on mobile)
- **Card Background:** `#F5F7F6`
- **Border:** 1px solid `rgba(46, 139, 87, 0.2)`
- **Border Radius:** 12px
- **Padding:** 24px
- **Margin:** 16px between cards

**Feature Icons:**
- Font Size: 24px
- Margin Right: 12px

**Feature Titles:**
- Font: Inter Bold, 20px, `#0B3D2C`
- Margin Bottom: 16px

**Feature Lists:**
- Font: Inter Regular, 14px, `#333333`
- List Style: None (custom bullet: `•`)
- Line Height: 1.8
- Margin: 8px 0

---

### **7. Status Bar (Fixed Bottom)**

```
┌─────────────────────────────────────────────────────────────┐
│ Status: ● Connected to Garden Network                       │
│ Certified Identity: ● Active  •  iGas: 100.0                │
│ Version: Eden v1.28 • Last Sync: Just now                  │
└─────────────────────────────────────────────────────────────┘
```

**Specifications:**
- **Background:** `#0B3D2C`
- **Height:** 48px
- **Text:** `#FFFFFF`, Inter Regular, 12px
- **Padding:** 12px 24px
- **Position:** Fixed bottom
- **Z-Index:** 1000
- **Border Top:** 1px solid `rgba(255, 255, 255, 0.1)`

**Status Indicators:**
- **Connected:** Green dot (`#4CAF50`)
- **Disconnected:** Red dot (`#F44336`)
- **Active:** Green dot (`#4CAF50`)
- **Inactive:** Gray dot (`#8FBC8F`)

**Layout:**
- Flexbox: Space-between
- Left: Status indicators
- Right: Version and sync info

---

## 🎯 Cursor Chat Interface Clone Specifications

### **Exact Cursor Chat Features to Replicate:**

1. **Message Threading:**
   - Messages grouped by conversation
   - Collapsible thread headers
   - Thread indicators (unread count, active state)

2. **Input Behavior:**
   - Auto-focus on input field
   - Enter to send, Shift+Enter for new line
   - Auto-resize textarea (min 1 line, max 5 lines)
   - Placeholder text that changes based on context

3. **Message Rendering:**
   - Markdown support (bold, italic, code blocks, links)
   - Syntax highlighting for code blocks
   - Inline code formatting
   - Image rendering (if applicable)

4. **Typing Indicators:**
   - Animated dots when Eden is "typing"
   - Smooth fade-in/fade-out

5. **Message Actions:**
   - Copy button (hover on message)
   - Edit button (for user messages)
   - Delete button (for user messages)
   - Regenerate button (for assistant messages)

6. **Scroll Behavior:**
   - Auto-scroll to bottom on new message
   - Smooth scrolling
   - Scroll lock toggle (prevent auto-scroll when user scrolls up)

7. **Keyboard Shortcuts:**
   - `Ctrl/Cmd + K`: Focus search
   - `Ctrl/Cmd + L`: New chat
   - `Esc`: Close modals/panels
   - `↑`: Edit last message
   - `Ctrl/Cmd + Enter`: Send message

8. **Visual Details:**
   - Subtle message hover effects
   - Message timestamps (on hover)
   - Message status indicators (sent, delivered, read)
   - Smooth animations (fade-in, slide-in)

---

## 🖼️ Background Image Integration

### **Eden 2028 Poster Background:**

1. **Image Source:**
   - Use the provided Eden 2028 promotional poster
   - Recommended dimensions: 1920x1080px (16:9 aspect ratio)

2. **Cropping Strategy:**
   - Crop to fit viewport dimensions
   - Maintain aspect ratio
   - Focus on central elements (Bill Draper figure, garden landscape)
   - Remove excessive whitespace

3. **CSS Implementation:**
   ```css
   .eden-background {
     background-image: url('/assets/images/eden-2028-background.jpg');
     background-size: cover;
     background-position: center;
     background-repeat: no-repeat;
     background-attachment: fixed; /* Optional: parallax effect */
   }
   ```

4. **Overlay:**
   - Dark overlay: `rgba(11, 61, 44, 0.7)` for text readability
   - Gradient overlay: `linear-gradient(to bottom, rgba(11, 61, 44, 0.8), rgba(26, 92, 69, 0.6))`

5. **Responsive Behavior:**
   - Desktop: Full background
   - Tablet: Cropped to center
   - Mobile: Focused on central figure

---

## 📱 Responsive Design

### **Breakpoints:**

- **Mobile:** < 768px
- **Tablet:** 768px - 1024px
- **Desktop:** > 1024px

### **Mobile Adaptations:**

1. **Header:**
   - Hamburger menu replaces navigation
   - Logo and user menu remain visible

2. **Hero Section:**
   - Reduced height (200px)
   - Smaller font sizes (H1: 32px, H2: 24px)
   - Stacked buttons

3. **Chat Interface:**
   - Full-width (100%)
   - Reduced padding (12px)
   - Smaller message bubbles (max-width: 85%)

4. **Chat History:**
   - Hidden by default (drawer)
   - Toggle button in header
   - Slide-in from right

5. **Features Grid:**
   - Single column layout
   - Reduced padding (16px)

---

## 🎨 Typography

### **Font Stack:**

```css
font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

### **Font Sizes:**

- **H1:** 48px (desktop), 32px (tablet), 28px (mobile)
- **H2:** 32px (desktop), 24px (tablet), 20px (mobile)
- **H3:** 24px (desktop), 20px (tablet), 18px (mobile)
- **Body:** 16px (desktop), 14px (tablet/mobile)
- **Chat:** 14px (monospaced for code)
- **Labels:** 12px (Inter Medium)

### **Font Weights:**

- **Headlines:** 700 (Bold)
- **Subheadings:** 600 (Semi-Bold)
- **Body:** 400 (Regular)
- **Labels:** 500 (Medium)

---

## ✨ Animations & Transitions

### **Micro-Interactions:**

1. **Button Hover:**
   - Scale: `transform: scale(1.02)`
   - Duration: 0.2s
   - Easing: `ease-out`

2. **Message Appearance:**
   - Fade-in: `opacity: 0 → 1`
   - Slide-up: `transform: translateY(10px) → translateY(0)`
   - Duration: 0.3s
   - Easing: `ease-out`

3. **Typing Indicator:**
   - Pulsing dots animation
   - Duration: 1.5s (infinite)

4. **Panel Transitions:**
   - Slide-in/out: `transform: translateX(100%) → translateX(0)`
   - Duration: 0.3s
   - Easing: `ease-in-out`

5. **Loading States:**
   - Spinner rotation: `transform: rotate(0deg) → rotate(360deg)`
   - Duration: 1s (infinite)
   - Easing: `linear`

---

## 🔧 Implementation Checklist

### **Phase 1: Component Setup**
- [ ] Clone `app.component.ts` to `home.component.ts`
- [ ] Clone `app.component.html` to `home.component.html`
- [ ] Clone `app.component.scss` to `home.component.scss`
- [ ] Register `HomeComponent` in `app.module.ts`
- [ ] Add route for home component

### **Phase 2: Background Integration**
- [ ] Add Eden 2028 background image to assets
- [ ] Implement background CSS with overlay
- [ ] Test responsive cropping
- [ ] Verify text readability with overlay

### **Phase 3: Cursor Chat Interface**
- [ ] Implement chat message bubbles (user/assistant/system)
- [ ] Add markdown rendering support
- [ ] Implement auto-scroll behavior
- [ ] Add typing indicators
- [ ] Implement message actions (copy, edit, delete)
- [ ] Add keyboard shortcuts
- [ ] Implement thread grouping

### **Phase 4: UI Components**
- [ ] Build header navigation
- [ ] Create hero section
- [ ] Implement chat history sidebar
- [ ] Build features grid
- [ ] Create status bar
- [ ] Add dual-mode explanation section

### **Phase 5: Functionality Integration**
- [ ] Merge all app component methods
- [ ] Connect WebSocket service
- [ ] Integrate chat service
- [ ] Connect all existing services
- [ ] Preserve all existing features

### **Phase 6: Styling & Polish**
- [ ] Apply Eden color palette
- [ ] Implement responsive breakpoints
- [ ] Add animations and transitions
- [ ] Test dark/light theme toggle
- [ ] Verify accessibility (WCAG 2.1 AA)

### **Phase 7: Testing**
- [ ] Unit tests for component logic
- [ ] Integration tests for services
- [ ] E2E tests for user flows
- [ ] Cross-browser testing
- [ ] Performance testing

---

## 📝 Notes

1. **Backward Compatibility:**
   - Keep original `app.component` intact
   - Home component is an alternative route
   - Users can switch between old and new UI

2. **Performance:**
   - Lazy load background image
   - Virtual scrolling for long chat histories
   - Debounce search inputs
   - Optimize re-renders with OnPush change detection

3. **Accessibility:**
   - ARIA labels for all interactive elements
   - Keyboard navigation support
   - Screen reader compatibility
   - Focus management

4. **Future Enhancements:**
   - Dark mode variant
   - Customizable themes
   - Export chat history
   - Voice input support
   - Multi-language support

---

## 🎯 Success Criteria

1. ✅ All existing app component functionality preserved
2. ✅ Cursor chat interface 100% cloned
3. ✅ Eden 2028 background properly integrated
4. ✅ Responsive design works on all devices
5. ✅ Performance meets or exceeds original app component
6. ✅ Accessibility standards met (WCAG 2.1 AA)
7. ✅ User testing feedback positive

---

**End of Design Document**

