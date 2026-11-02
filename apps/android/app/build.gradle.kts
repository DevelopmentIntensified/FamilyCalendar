import java.util.Properties

plugins {
	alias(libs.plugins.android.application)
	alias(libs.plugins.kotlin.compose)
	alias(libs.plugins.kotlin.serialization)
	alias(libs.plugins.detekt)
}

// Local CI gate (issue 210 slice 7): no hosted CI for this repo by owner
// decree (#184), so the merge gate runs from the command line in one task.
tasks.register("mobileGate") {
	group = "verification"
	description = "Detekt + unit tests + debug APK build"
	dependsOn("detekt", "testDebugUnitTest", "assembleDebug")
}

detekt {
	buildUponDefaultConfig = true
	parallel = true
	// Kotlin 2.4 sources get parsed fine by detekt 1.23.8; source root follows
	// the built-in-Kotlin source set (src/main/kotlin, tests included).
	// config/detekt.yml only relaxes platform tropes (compose naming, dp
	// values, long callback signatures) — the slop rules stay on.
	config.setFrom("config/detekt.yml")
	source.setFrom(
		"src/main/kotlin",
		"src/test/kotlin"
	)
	reports {
		html.required.set(true)
		xml.required.set(true)
	}
}

// Upload-key signing (issue #267): secrets live in the uncommitted
// apps/android/keystore.properties; absent → release builds unsigned.
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
	if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}

android {
	namespace = "com.familyplanz.app"
	compileSdk = 37

	defaultConfig {
		applicationId = "com.familyplanz.app"
		minSdk = 26
		targetSdk = 36
		versionCode = 1
		versionName = "0.1.0"
		buildConfigField("String", "API_BASE_URL", "\"https://familyplanz.com/\"")
	}

	signingConfigs {
		if (keystorePropsFile.exists()) {
			create("release") {
				storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
				storePassword = keystoreProps.getProperty("storePassword")
				keyAlias = keystoreProps.getProperty("keyAlias")
				keyPassword = keystoreProps.getProperty("keyPassword")
			}
		}
	}

	buildTypes {
		debug {
			buildConfigField("String", "API_BASE_URL", "\"https://test.familyplanz.com/\"")
		}
		release {
			isMinifyEnabled = true
			signingConfigs.findByName("release")?.let { signingConfig = it }
			proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
		}
	}

	compileOptions {
		sourceCompatibility = JavaVersion.VERSION_17
		targetCompatibility = JavaVersion.VERSION_17
	}

	buildFeatures {
		compose = true
		buildConfig = true
	}
}

kotlin {
	compilerOptions {
		jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
	}
}

dependencies {
	implementation(libs.androidx.core.ktx)
	implementation(libs.androidx.lifecycle.runtime.compose)
	implementation(libs.androidx.lifecycle.viewmodel.compose)
	implementation(libs.androidx.datastore.preferences)
	implementation(libs.androidx.activity.compose)
	implementation(libs.retrofit.core)
	implementation(libs.retrofit.converter.kotlinx.serialization)
	implementation(libs.okhttp.core)
	implementation(libs.okhttp.logging.interceptor)
	implementation(libs.kotlinx.serialization.json)
	implementation(platform(libs.androidx.compose.bom))
	implementation(libs.androidx.compose.ui)
	implementation(libs.androidx.compose.ui.tooling.preview)
	implementation(libs.androidx.compose.material3)
	implementation(libs.androidx.compose.material.icons.core)
	debugImplementation(libs.androidx.compose.ui.tooling)
	testImplementation(libs.okhttp.mockwebserver)
	testImplementation(libs.junit.core)
}
