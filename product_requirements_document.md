# Product Requirements Document (PRD): Real Life RPG (Gamified Life & Goal Manager)

## 1. Project Overview & Vision
**Product Name:** Real Life RPG (Working Title)
**Target User:** Creative professionals, developers, and gamers (specifically Gael) who struggle with execution friction, task tracking, and long-term goal abandonment ("the idea graveyard").
**Core Value Proposition:** Transform real-world self-improvement, tasks, and lifetime aspirations into an immersive, gamified RPG experience inspired by classic retro console interfaces (Xbox 360 / Xbox Classic). The app uses integrated AI (Gemini API) to dynamically generate structured campaigns, micro-tasks, and skill trees from natural language ideas or chat transcripts.

---

## 2. Platform & Deployment Requirements
*   **Initial Phase (Frontend & Prototype):** Web-based responsive application designed with a console dashboard aesthetic.
*   **Android Distribution (Crucial Requirement):** 
    *   The app must be buildable and packagable as a standalone Android application package (`.apk` or Android App Bundle) or distributed via a standalone PWA/Native wrapper (avoiding messy developer dependencies like running straight out of temporary repository clones/Git workflows for daily end-use). 
    *   It must live on the device independently so that updates to remote repositories do not break the local installation experience.

---

## 3. Core Features & Functional Requirements

### A. The Retro Dashboard (User Interface)
*   **Visual Aesthetic:** Inspired by the Xbox 360 blade interface or classic console menu system. Features nostalgic typography, smooth sliding transitions, sound effects (*chimes* on task completion), and a dark/neon cyberpunk or console-grey palette.
*   **HUD (Heads-Up Display):** 
    *   Global Level & XP Bar (Calculated from completed tasks).
    *   Current Streak counter.
    *   Quick-access menu tiles.

### B. AI-Powered Quest Generator (Gemini API Integration)
*   **Input Mechanism:** A quick-input text area or parsed transcript paste zone where the user types a raw idea or goal (e.g., *"I want to learn basic card magic"* or *"Build the alarm app"*).
*   **AI Processing & Structuring:** Sends a structured prompt to the Gemini API to parse the input into an RPG format containing:
    1.  **Main Quest (Campaign):** The overarching goal with a progress tracker percentage.
    2.  **Side Quests:** Supporting habits or sub-tasks.
    3.  **Bounties (Daily Tasks):** Atomic micro-actions required to advance.
    4.  **XP Rewards:** Assigned point values based on difficulty.

### C. Progression & Skill Trees
*   **Skill Trees:** Categorized branches (e.g., *Technical/Coding*, *Physical/Fitness*, *Creative/Multimedia*).
*   **Unlocks:** Spending skill points earned via leveling up to unlock advanced missions or complex project structures.
*   **Achievements (System Notifications):** Popup banners with audio cues when milestones are hit (e.g., unlocking *"Insomniac Code Hero"*).

---

## 4. Technical Architecture (Phased Approach)

### Phase 1: Frontend & UI Mockup (Current Priority)
*   **Tech Stack:** React / Vite or modern HTML/CSS/Tailwind with custom CSS animations mimicking console dashboards.
*   **Deliverable:** A fully interactive frontend prototype showcasing the Xbox-style menu navigation, sample quests, inventory/skill tree views, and mock API response handling.

### Phase 2: AI Integration & Local Storage
*   **Tech Stack:** LocalStorage / IndexedDB for persistence. Secure client-side input for the Gemini API Key.
*   **Deliverable:** Dynamic quest generation where typing a goal hits the Gemini API and populates the dashboard with custom RPG quests.

### Phase 3: Android Packaging
*   **Tech Stack:** Capacitor or Cordova wrapper to compile the web application into a standalone `.apk` file for seamless native installation on Android devices without relying on active cloud development repository connections.