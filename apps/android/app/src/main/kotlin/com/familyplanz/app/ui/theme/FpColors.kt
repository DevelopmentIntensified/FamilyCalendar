package com.familyplanz.app.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color

/*
 * The role table the Material scheme has no slots for. Split out of Color.kt
 * to stay under the 300-line file cap; the raw ramps themselves live there.
 */

/**
 * Roles the Material scheme has no slot for: the web chip vocabulary
 * (TaskRow.svelte meta slots), due/overdue tones (priorityTone.ts dueTone),
 * the priority dots, and the calendar chip rail (chipVocabulary.ts).
 */
@Immutable
data class FpColors(
	val category: ChipTone = ChipTone(Accent.Teal100, Accent.Teal800),
	val tag: ChipTone = ChipTone(Accent.Sky100, Accent.Sky700),
	val family: ChipTone = ChipTone(Accent.Indigo100, Accent.Indigo700),
	val late: ChipTone = ChipTone(Accent.Red100, Accent.Red700),
	val dueToday: ChipTone = ChipTone(Accent.Amber100, Accent.Amber700),
	val due: ChipTone = ChipTone(Slate.S100, Slate.S600),
	val pending: ChipTone = ChipTone(Accent.Amber100, Accent.Amber700),
	val assignee: ChipTone = ChipTone(Slate.S100, Slate.S600),
	val recurring: ChipTone = ChipTone(Accent.Purple100, Accent.Purple500),
	val focus: ChipTone = ChipTone(Primary.P50, Primary.P700),
	val accept: ChipTone = ChipTone(Accent.Emerald100, Accent.Emerald700),
	val decline: ChipTone = ChipTone(Accent.Red100, Accent.Red700),
	val priorityHigh: Color = Accent.Red500,
	val priorityNormal: Color = Slate.S300,
	val priorityLow: Color = Slate.S200,
	/** Row surface: `border-slate-100 bg-slate-50/60`; late rows `border-red-200 bg-red-50`. */
	val rowSurface: Color = Slate.S50,
	val rowBorder: Color = Slate.S100,
	val lateRowSurface: Color = Accent.Red50,
	val lateRowBorder: Color = Accent.Red200,
	val lateText: Color = Accent.Red700,
	/** chipColor() fallback when an event has no calendar colour. */
	val chipRail: Color = Slate.S400,
	val taskChipBorder: Color = Slate.S300,
	val overdueChipBorder: Color = Accent.Red400,
	/** MonthDayCell: today = primary-300 border on primary-50 wash; weekend = paper wash. */
	val todayCellBorder: Color = Primary.P300,
	val todayCellSurface: Color = Primary.P50,
	val weekendCellSurface: Color = Brand.Paper,
	val otherMonthCellSurface: Color = Slate.S50,
	val otherMonthCellBorder: Color = Slate.S100,
	/** Text ramp: titles slate-900, body slate-600, meta slate-400, separators slate-300. */
	val textStrong: Color = Slate.S900,
	val textBody: Color = Slate.S600,
	val textMuted: Color = Slate.S400,
	val separator: Color = Slate.S300,
	/** Guest / info note: the login page's `bg-[#BEDAE3]/40` info card. */
	val infoSurface: Color = Brand.Blue.copy(alpha = 0.4f),
	val infoContent: Color = Slate.S700,
	/** Warning card (TasksHeader: amber-50 / amber-200 / amber-800). */
	val warnSurface: Color = Accent.Amber50,
	val warnBorder: Color = Accent.Amber200,
	val warnContent: Color = Accent.Amber800,
	/** Status bar = app.html theme-color. */
	val statusBar: Color = Primary.P600,
	// ---- #292 §1 additions ----
	/** White page canvas: Calendar, Dashboard, Groceries, Alerts (the body has no bg, `app.html:45`). */
	val canvasWhite: Color = Color.White,
	/** slate-50 page canvas: Tasks, Family, Account, Sign-in (`tasks/+page.svelte:364`). */
	val canvasSlate: Color = Slate.S50,
	/** Navbar wordmark `text-slate-800` (`Navbar.svelte:82`). */
	val wordmark: Color = Slate.S800,
	/** "Sent again ✓" pill `bg-[#C4E9DA]/60` (`theme.css:67`; `calendar/+layout.svelte:218`). */
	val mintPill: Color = Brand.Mint.copy(alpha = 0.6f),
	/** Account avatar: terracotta on blush (`AccountSidebar.svelte:120`). */
	val avatarAccount: ChipTone = ChipTone(Brand.Blush, Brand.Terracotta),
	/** OfflineBanner `border-amber-300 bg-amber-100 text-amber-900` (`OfflineBanner.svelte:63`). */
	val offline: BannerTone = BannerTone(Accent.Amber300, Accent.Amber100, Accent.Amber900),
	/** Guest / verify banner `border-amber-200 bg-amber-50 text-amber-800` (`calendar/+layout.svelte:167,251`). */
	val warnBanner: BannerTone = BannerTone(Accent.Amber200, Accent.Amber50, Accent.Amber800),
	/** Urgent guest / error banner `border-red-200 bg-red-50 text-red-800` (`calendar/+layout.svelte:250`). */
	val errorBanner: BannerTone = BannerTone(Accent.Red200, Accent.Red50, Accent.Red800),
	/** Claimed / merged banner `border-green-200 bg-green-50 text-green-800` (`calendar/+layout.svelte:151`). */
	val successBanner: BannerTone = BannerTone(Accent.Green200, Accent.Green50, Accent.Green800),
	/** Guest hint "(deleted after 90 days…)" `text-amber-600` (`calendar/+layout.svelte:259`). */
	val warnHint: Color = Accent.Amber600,
	/** Verify-banner error line `text-red-700` (`calendar/+layout.svelte:222`). */
	val errorText: Color = Accent.Red700,
	/** RSVP active fills (`EventRsvpRow.svelte`): green-600 / yellow-500 / red-600. */
	val rsvpGoing: Color = Accent.Green600,
	val rsvpMaybe: Color = Accent.Yellow500,
	val rsvpNo: Color = Accent.Red600,
	/** Dashboard Family source chip `bg-cyan-50 text-cyan-600` (`TodayGlanceCard.svelte`). */
	val familySource: ChipTone = ChipTone(Accent.Cyan50, Accent.Cyan600),
	/** "Filtered / Searching" kicker `text-slate-400` (`Calendar.svelte:566`). */
	val kicker: Color = Slate.S400,
	/** Selected filter chip `border-slate-900 bg-slate-900 text-white` (`TaskToolbar.svelte:117`). */
	val chipSelected: ChipTone = ChipTone(Slate.S900, Color.White),
	/** Unselected filter chip `border-slate-200 bg-white text-slate-600` (`TaskToolbar.svelte:118`). */
	val chipIdle: ChipTone = ChipTone(Color.White, Slate.S600),
	/** Tab badge `bg-primary-600` (`BottomNav.svelte:164`); bell badge `bg-red-500` (`NotificationBell.svelte:190`). */
	val tabBadge: Color = Primary.P600,
	val bellBadge: Color = Accent.Red500,
	/** Sheet / modal scrim `bg-black/40` (`DayActionSheet.svelte`); toolbar sheets `bg-slate-900/30`. */
	val scrim: Color = Color.Black.copy(alpha = 0.4f),
	val scrimSlate: Color = Slate.S900.copy(alpha = 0.3f),
	/** Sheet grab handle `bg-slate-200` (`DayActionSheet.svelte:97`). */
	val sheetHandle: Color = Slate.S200,
	/** Toast dismiss cross `text-slate-300`, toast text slate-800 (`Toaster.svelte`). */
	val toastDismiss: Color = Slate.S300,
	val toastText: Color = Slate.S800,
)
