# Family Planz - Native Android App & AI Integration Plan

## Overview
Build a native Android app with AI-powered event creation from text, Gemini assistant integration, and a browser extension for seamless event capture.

---

## 1. Architecture Overview

### Tech Stack
- **App Framework**: Native Android (Kotlin) via Capacitor
- **AI Engine**: Google ML Kit + TensorFlow Lite (local, on-device)
- **UI**: Jetpack Compose with Material Design 3
- **Local Storage**: Room Database
- **Sync**: WorkManager for background sync
- **Gemini Integration**: Android Intent system + Gemini Extensions API

### Project Structure
```
family-planz-android/
├── app/                    # Main Android app
│   ├── src/main/
│   │   ├── kotlin/com/familyplanz/
│   │   │   ├── ai/         # Local AI event parser
│   │   │   ├── gemini/     # Gemini integration
│   │   │   ├── ui/         # Jetpack Compose screens
│   │   │   ├── data/       # Room DB, API client
│   │   │   └── workers/    # Background sync
│   │   └── AndroidManifest.xml
├── extension/              # Browser extension (Chrome/Firefox)
│   ├── manifest.json
│   ├── popup/
│   └── content-script/
└── shared/                 # Shared models/utils
```

---

## 2. AI Event Parser

### Requirements
- **Runs locally** on device (no cloud API calls for privacy/speed)
- **Fast**: <500ms parsing time
- **Accurate**: Extract title, date, time, location, description

### Technical Approach

#### Option A: ML Kit + Custom Model (Recommended)
```
1. Use ML Kit Smart Reply/Language ID for text understanding
2. Train a custom TFLite model for event entity extraction
3. Combine with regex patterns for common date/time formats
```

**Pros**: Fast, private, works offline
**Cons**: Requires model training data

#### Option B: Rule-Based + Heuristics
```
1. Comprehensive regex for dates/times (RFC 3339, natural language)
2. NLP library (Apache OpenNLP or Stanford CoreNLP on-device)
3. Keyword detection for locations
```

**Pros**: No training needed, fully controllable
**Cons**: May miss edge cases

#### Option C: On-Device LLM (Future)
```
1. DistilBERT or smaller quantized model
2. Gemma Nano (Google's on-device model)
3. ~1GB model size, very accurate
```

**Pros**: Best accuracy for natural language
**Cons**: Larger download, higher compute

### Implementation (Option B - Fastest to Build)

```kotlin
// EventParser.kt
data class ParsedEvent(
    val title: String?,
    val startTime: LocalDateTime?,
    val endTime: LocalDateTime?,
    val location: String?,
    val description: String?
)

class LocalEventParser {
    // Date patterns
    private val datePatterns = listOf(
        Pattern.compile("(\\d{1,2}/\\d{1,2}/\\d{2,4})"),
        Pattern.compile("(\\w+ \\d{1,2},? \\d{4})"),
        Pattern.compile("tomorrow", Pattern.CASE_INSENSITIVE),
        Pattern.compile("next (\\w+day)", Pattern.CASE_INSENSITIVE)
    )
    
    // Time patterns  
    private val timePatterns = listOf(
        Pattern.compile("(\\d{1,2}:\\d{2})\\s*(am|pm)?", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(\\d{1,2})\\s*(am|pm)", Pattern.CASE_INSENSITIVE)
    )
    
    // Location indicators
    private val locationIndicators = listOf(
        "at", "location:", "place:", "venue:", "in"
    )
    
    fun parse(text: String): ParsedEvent { /* ... */ }
}
```

### Accuracy Boost: Shared Pre-trained Patterns
Use common date/time expression library (ICU4J) for robust parsing.

---

## 3. Gemini Assistant Integration (Android)

### How It Works
1. User activates Gemini (long press power button, or "Hey Google")
2. Says/types: "Add to Family Planz: Dinner with family at Olive Garden tomorrow at 7pm"
3. Gemini Extension intercepts, parses, creates event

### Implementation

#### Gemini Extensions API (Android 14+)
```kotlin
// AndroidManifest.xml
<activity>
    <intent-filter>
        <action android:name="android.intent.action.PROCESS_TEXT"/>
        <category android:name="android.intent.category.DEFAULT"/>
        <data android:mimeType="text/plain"/>
    </intent-filter>
</intent-filter>
```

#### Approach 1: App Link Handler (Recommended)
```
1. Register app to handle: https://familyplanz.app/gemini
2. Gemini can invoke via App Actions / Slices
3. User says "Talk to Family Planz"
4. Parse text via Gemini's built-in understanding, send to our API
```

#### Approach 2: Share Intent Receiver
```
1. User selects text in any app
2. Shares to "Family Planz" via Android Share Sheet
3. Our app receives, parses with local AI, creates event
```

#### Approach 3: Gemini Extensions (B2B)
```
1. Build Gemini Extension package
2. Requires Google partnership/approval
3. Would appear in Gemini's available extensions
```

### Recommended Implementation: Share Intent + Deep Link
```kotlin
// MainActivity.kt
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        when (intent?.action) {
            Intent.ACTION_SEND -> {
                if (intent.type == "text/plain") {
                    handleSendText(intent)
                }
            }
        }
    }
    
    private fun handleSendText(intent: Intent) {
        val sharedText = intent.getStringExtra(Intent.EXTRA_TEXT)
        if (sharedText != null) {
            // Launch AI parser, show confirmation, create event
            parseAndCreateEvent(sharedText)
        }
    }
}
```

---

## 4. Text Selection Event Creation

### Android: Selection Action
```kotlin
// Custom text selection action
class EventSelectionAction : ActionProvider {
    override fun onCreateActionView(): View {
        return ImageButton(context).apply {
            setImageResource(R.drawable.ic_add_event)
            setOnClickListener { 
                // Get selected text, parse, create
            }
        }
    }
}
```

### Flow
1. User long-presses text containing event info
2. Selection handles appear
3. User taps "Add to Family Planz" action
4. App receives text, AI parses, shows confirmation
5. One tap to create event

---

## 5. Browser Extension

### Overview
Chrome/Firefox extension for capturing events from web pages.

### Features

#### 1. Text Selection to Event
```javascript
// content-script.js
document.addEventListener('mouseup', (e) => {
    const selection = window.getSelection().toString().trim();
    if (selection.length > 10) {
        chrome.runtime.sendMessage({
            type: 'TEXT_SELECTED',
            text: selection,
            url: window.location.href
        });
    }
});
```

#### 2. AI Parsing (Server-Side for Extension)
- Extension sends selected text to our API
- API runs ML model, returns parsed event
- User confirms, event created

#### 3. One-Click Event Creation
```javascript
// popup.js
async function createEventFromText(text) {
    const response = await fetch('https://api.familyplanz.com/ai/parse', {
        method: 'POST',
        body: JSON.stringify({ text }),
        headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    const event = await response.json();
    // Show confirmation UI
    // User clicks "Create" -> POST to /api/events
}
```

### Extension Manifest
```json
{
    "manifest_version": 3,
    "name": "Family Planz",
    "permissions": ["storage", "activeTab", "contextMenus"],
    "host_permissions": ["https://*.familyplanz.com/*"],
    "background": {
        "service_worker": "background.js"
    },
    "content_scripts": [{
        "matches": ["<all_urls>"],
        "js": ["content-script.js"]
    }]
}
```

---

## 6. API Endpoints

### New Endpoints Needed

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ai/parse` | POST | AI parse event text (optional cloud fallback) |
| `/api/ai/parse-model` | GET | Download latest TFLite model |
| `/api/extension/events` | GET/POST | Extension event CRUD |
| `/api/mobile/sync` | POST | Delta sync for mobile |
| `/api/share/create` | POST | Create event from share intent token |

### Share Token System
For Share Sheet (no auth required):
```
1. User shares to Family Planz
2. App generates short-lived token: /share/abc123
3. App opens: familyplanz.com/share/abc123
4. Web view parses, shows confirmation
5. Creates event on user's account
```

---

## 7. UI/UX Design

### Design Principles
- **Minimal**: Single-purpose screens
- **Fast**: < 100ms interactions
- **Beautiful**: Material Design 3 with family-friendly colors

### Screens

#### 1. AI Event Confirmation
```
┌─────────────────────────────┐
│  📅 Create Event?          │
├─────────────────────────────┤
│  📌 Dinner with Family     │
│  🕐 Tomorrow, 7:00 PM       │
│  📍 Olive Garden            │
│                             │
│  [Edit]        [Create ✓]  │
└─────────────────────────────┘
```

#### 2. Quick Add from Share
- Full-screen modal on share intent
- Shows parsed event with edit capability
- One "Create" button
- Auto-dismiss after creation with success toast

#### 3. Calendar View
- Day/Week/Month views
- Color-coded by family member
- Pull-to-refresh
- Offline indicator

### Performance Targets
- App cold start: < 2 seconds
- AI parse: < 500ms
- Event creation: < 1 second
- Smooth 60fps scrolling

---

## 8. What CANNOT Be Done (Alternatives)

### ❌ Gemini Assistant Native Integration
**Cannot Do**: Gemini Extensions require Google partnership and B2B agreement.

**Alternatives**:
1. ✅ Share Intent (works with any text)
2. ✅ App Actions for Google Assistant
3. ✅ Deep links from any assistant

### ❌ iOS Similar Features
**Cannot Do**: iOS restricts text selection actions and background processing.

**Alternatives**:
1. ✅ Share Sheet integration (works like Android)
2. ✅ WidgetKit for home screen (Apple allows)
3. ✅ Siri Shortcuts integration

### ❌ True On-Device LLM (Gemma/Llama)
**Cannot Do**: Too large (~1-4GB) for most devices.

**Alternatives**:
1. ✅ Rule-based + regex (fast, works offline)
2. ✅ Small TFLite model (~10MB)
3. ✅ Server-side parsing as fallback (fast API)

### ❌ Background AI Processing
**Cannot Do**: Android 14+ restricts background processing.

**Alternatives**:
1. ✅ Process on app open / share receive
2. ✅ WorkManager for sync only
3. ✅ Foreground service for active sessions

---

## 9. Implementation Phases

### Phase 1: Core App (2 weeks)
1. Set up Kotlin Android project with Jetpack Compose
2. Implement Room database for local storage
3. Build basic calendar views (day/week/month)
4. Implement event creation/edit UI
5. Add authentication flow

### Phase 2: AI Parser (1 week)
1. Build LocalEventParser with regex patterns
2. Integrate date/time parsing library
3. Test accuracy on common formats
4. Build confirmation UI

### Phase 3: Share Integration (3 days)
1. Implement Share Intent receiver
2. AI parse on receive
3. Confirmation + create flow
4. Deep link handling

### Phase 4: Browser Extension (1 week)
1. Set up Chrome extension project
2. Content script for text selection
3. Popup UI for event confirmation
4. API integration

### Phase 5: Polish (1 week)
1. Performance optimization
2. Offline support
3. Push notifications
4. Widget (Android)

---

## 10. Dependencies

### Android
```gradle
// build.gradle
dependencies {
    implementation 'androidx.compose.ui:ui:1.5.0'
    implementation 'androidx.compose.material3:material3:1.1.0'
    implementation 'androidx.room:room-ktx:2.6.0'
    implementation 'androidx.work:work-runtime-ktx:2.8.0'
    implementation 'androidx.mlkit:smart-reply:17.0.0'
    implementation 'com.google.android.gms:play-services-mlkit-text-recognition:16.0.0'
}
```

### Shared
```json
{
    "tflite": "^2.11.0",
    "icu4j": "73.2"
}
```

---

## Summary

| Feature | Status | Alternative |
|---------|--------|-------------|
| Gemini Integration | ❌ Requires partnership | ✅ Share Intent |
| iOS Similar | ❌ iOS restrictions | ✅ Share Sheet works |
| On-Device LLM | ❌ Too large | ✅ Regex + ML Kit |
| Text Selection Event | ✅ Feasible | - |
| Browser Extension | ✅ Feasible | - |
| Local AI Parsing | ✅ Feasible | - |
| One-Click Create | ✅ Feasible | - |

**Total Estimated Time**: 5-6 weeks for MVP
