allprojects {
    repositories {
        google()
        mavenCentral()
        // Store billing SDKs: Cafe Bazaar's Poolakey (JitPack) and Myket's billing client.
        maven("https://jitpack.io") {
            content { includeGroupByRegex("com\\.github\\.cafebazaar.*") }
        }
        maven("https://maven.myket.ir") {
            content { includeGroup("ir.myket") }
        }
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
