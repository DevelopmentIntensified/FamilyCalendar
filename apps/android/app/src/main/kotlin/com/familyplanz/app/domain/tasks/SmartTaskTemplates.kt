package com.familyplanz.app.domain.tasks

/*
 * Port of src/lib/data/smartEventTemplates.ts (the Smart tasks list the web
 * AddTaskCard imports), generated from the TS table in the same order. The
 * web's category icons are emoji, which the app's content rule leaves out.
 */

enum class SmartTaskCategory(val label: String) {
	CAR("Car"),
	HOME("Home"),
	CLEANING("Cleaning"),
}

data class SmartTaskTemplate(
	val id: String,
	val name: String,
	val category: SmartTaskCategory,
	val recurrenceFrequency: String,
	val recurrenceInterval: Int,
	val description: String?,
) {
	/** AddTaskCard cadenceNote: the description, else "Every N units" / "Every unit". */
	val cadenceNote: String
		get() = description ?: run {
			val unit = frequencyNoun(recurrenceFrequency)
			if (recurrenceInterval > 1) "Every $recurrenceInterval ${unit}s" else "Every $unit"
		}
}

/** taskDisplay.ts freqNoun: `daily` → `day`; unknown words pass through. */
fun frequencyNoun(frequency: String?): String = when (frequency) {
	CadenceFrequency.DAILY -> "day"
	CadenceFrequency.WEEKLY -> "week"
	CadenceFrequency.MONTHLY -> "month"
	CadenceFrequency.YEARLY -> "year"
	null -> "occurrence"
	else -> frequency
}

@Suppress("MaxLineLength")
val SMART_TASK_TEMPLATES: List<SmartTaskTemplate> = listOf(
	SmartTaskTemplate("car-oil", "Oil change", SmartTaskCategory.CAR, "monthly", 3, "Typically every 3 months or 5,000 miles, whichever comes first."),
	SmartTaskTemplate("car-tire-rotation", "Tire rotation", SmartTaskCategory.CAR, "monthly", 6, "Every other oil change, roughly every 6 months or 7,500 miles."),
	SmartTaskTemplate("car-tire-pressure", "Tire pressure check", SmartTaskCategory.CAR, "monthly", 1, null),
	SmartTaskTemplate("car-wipers", "Replace wiper blades", SmartTaskCategory.CAR, "monthly", 6, null),
	SmartTaskTemplate("car-engine-air-filter", "Engine air filter", SmartTaskCategory.CAR, "yearly", 1, null),
	SmartTaskTemplate("car-cabin-filter", "Cabin air filter", SmartTaskCategory.CAR, "yearly", 1, null),
	SmartTaskTemplate("car-brake-inspection", "Brake inspection", SmartTaskCategory.CAR, "yearly", 1, null),
	SmartTaskTemplate("car-battery-check", "Battery check", SmartTaskCategory.CAR, "yearly", 1, null),
	SmartTaskTemplate("car-registration", "Registration renewal", SmartTaskCategory.CAR, "yearly", 1, null),
	SmartTaskTemplate("car-insurance-review", "Insurance review / shop quotes", SmartTaskCategory.CAR, "yearly", 1, null),
	SmartTaskTemplate("car-wash", "Car wash (exterior + interior)", SmartTaskCategory.CAR, "monthly", 1, null),
	SmartTaskTemplate("home-hvac-filter", "Replace HVAC filter", SmartTaskCategory.HOME, "monthly", 3, "90 days is the standard for 1-inch filters."),
	SmartTaskTemplate("home-smoke-test", "Test smoke & CO detectors", SmartTaskCategory.HOME, "monthly", 1, null),
	SmartTaskTemplate("home-smoke-batteries", "Smoke detector batteries", SmartTaskCategory.HOME, "yearly", 1, "Common rule of thumb: every year at daylight saving time changes."),
	SmartTaskTemplate("home-gutters", "Clean gutters", SmartTaskCategory.HOME, "monthly", 6, null),
	SmartTaskTemplate("home-dryer-vent", "Dryer vent cleaning", SmartTaskCategory.HOME, "monthly", 3, "Lint buildup is a leading cause of house fires."),
	SmartTaskTemplate("home-water-heater", "Water heater flush", SmartTaskCategory.HOME, "yearly", 1, null),
	SmartTaskTemplate("home-fridge-coils", "Vacuum refrigerator coils", SmartTaskCategory.HOME, "monthly", 6, null),
	SmartTaskTemplate("home-sump-pump", "Test sump pump", SmartTaskCategory.HOME, "monthly", 3, null),
	SmartTaskTemplate("home-furnace-service", "Furnace service", SmartTaskCategory.HOME, "yearly", 1, "Schedule before heating season."),
	SmartTaskTemplate("home-ac-service", "A/C service", SmartTaskCategory.HOME, "yearly", 1, "Schedule before cooling season."),
	SmartTaskTemplate("home-pest-control", "Pest control treatment", SmartTaskCategory.HOME, "monthly", 3, null),
	SmartTaskTemplate("clean-vacuum", "Vacuum", SmartTaskCategory.CLEANING, "weekly", 1, null),
	SmartTaskTemplate("clean-dust", "Dust surfaces", SmartTaskCategory.CLEANING, "weekly", 1, null),
	SmartTaskTemplate("clean-bathrooms", "Bathrooms", SmartTaskCategory.CLEANING, "weekly", 1, null),
	SmartTaskTemplate("clean-kitchen-deep", "Kitchen deep clean", SmartTaskCategory.CLEANING, "weekly", 1, null),
	SmartTaskTemplate("clean-mop", "Mop floors", SmartTaskCategory.CLEANING, "weekly", 1, null),
	SmartTaskTemplate("clean-bedding", "Change bed sheets", SmartTaskCategory.CLEANING, "weekly", 2, null),
	SmartTaskTemplate("clean-fridge-out", "Fridge clean-out", SmartTaskCategory.CLEANING, "weekly", 1, null),
	SmartTaskTemplate("clean-mattress-rotate", "Rotate mattress", SmartTaskCategory.CLEANING, "monthly", 6, null),
	SmartTaskTemplate("clean-windows", "Windows & mirrors", SmartTaskCategory.CLEANING, "monthly", 3, null),
	SmartTaskTemplate("clean-baseboards", "Baseboards & door frames", SmartTaskCategory.CLEANING, "monthly", 3, null),
	SmartTaskTemplate("clean-oven", "Oven deep clean", SmartTaskCategory.CLEANING, "monthly", 3, null),
	SmartTaskTemplate("clean-carpet", "Deep clean carpets", SmartTaskCategory.CLEANING, "monthly", 6, null),
)
