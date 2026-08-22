# Natural Language Event Creation

## Approach: Regex-based Parser (No AI Required)

Simple pattern matching to extract event details from natural language.
Toggle feature on/off in settings or full form.

### Supported Patterns

| Input | Parsed |
|-------|-------|
| "Lunch tomorrow at noon" | title: "Lunch", date: tomorrow, time: 12:00 |
| "Meeting Friday 2pm" | title: "meeting", date: friday, time: 14:00 |
| "Grocery shopping Saturday" | title: "grocery shopping", date: saturday, allDay: true |
| "Dad's birthday Dec 15" | title: "dad's birthday", date: 12-15, allDay: true |
| "Call doctor 3pm for 15 min" | title: "call doctor", time: 15:00, duration: 15min |
| "Team sync every monday 10am" | title: "team sync", day: monday, time: 10:00, recurring |