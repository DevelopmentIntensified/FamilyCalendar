plugins {
	alias(libs.plugins.android.application)
	alias(libs.plugins.kotlin.compose)
	alias(libs.plugins.kotlin.serialization)
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

	buildTypes {
		debug {
			buildConfigField("String", "API_BASE_URL", "\"https://test.familyplanz.com/\"")
		}
		release {
			isMinifyEnabled = true
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
