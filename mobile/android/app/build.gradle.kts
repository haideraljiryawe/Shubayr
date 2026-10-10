import java.util.Properties

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Optional at configuration time: debug and unsigned manifest/compile checks
// must work without production secrets. Packaging release is fail-closed below.
val releaseKeys = Properties()
val releaseKeysFile = rootProject.file("key.properties")
if (releaseKeysFile.isFile) {
    releaseKeysFile.inputStream().use { releaseKeys.load(it) }
}
val signingFields = listOf("storeFile", "storePassword", "keyAlias", "keyPassword")
val hasReleaseSigning = signingFields.all { !releaseKeys.getProperty(it).isNullOrBlank() }
val validateProductionSigning = tasks.register("validateProductionSigning") {
    doLast {
        check(hasReleaseSigning) {
            "Release signing is required. Supply android/key.properties outside Git; see README.md. Debug signing is never used for release."
        }
        check(file(releaseKeys.getProperty("storeFile")).isFile) {
            "The production signing storeFile does not exist."
        }
    }
}
// Guard the packaging/signing tasks, not manifest processing or compilation.
tasks.configureEach {
    if (name in listOf("validateSigningRelease", "packageRelease", "packageReleaseBundle", "signReleaseBundle", "assembleRelease", "bundleRelease")) {
        dependsOn(validateProductionSigning)
    }
}

android {
    namespace = "com.shubayr.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.shubayr.app"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("production") {
                storeFile = file(releaseKeys.getProperty("storeFile"))
                storePassword = releaseKeys.getProperty("storePassword")
                keyAlias = releaseKeys.getProperty("keyAlias")
                keyPassword = releaseKeys.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasReleaseSigning) signingConfigs.getByName("production") else null
        }
    }
}

flutter {
    source = "../.."
}
