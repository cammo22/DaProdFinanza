/**
 * Prepara il progetto Android generato da Capacitor (`npx cap add android`)
 * per la demo: versione e firma. Lo usa .github/workflows/android-demo.yml.
 *
 *   node scripts/android-prepare.mjs
 *
 * - **Versione**: `versionName` è quella di package.json; `versionCode` ne è
 *   la traduzione in numero (1.2.0 → 10200), che Android usa per capire se
 *   un APK è più nuovo di quello installato.
 * - **Firma**: sempre la stessa chiave (build/android/demo.keystore), così
 *   l'APK di una versione nuova si installa sopra la vecchia senza dover
 *   disinstallare e perdere i dati di esempio modificati. È una chiave solo
 *   per la demo, con password pubblica: non protegge nulla e non deve firmare
 *   mai un'app con dati veri.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const [major, minor, patch] = pkg.version.split('.').map(Number)
const versionCode = major * 10000 + minor * 100 + patch

const gradleFile = resolve('android/app/build.gradle')
let gradle = readFileSync(gradleFile, 'utf8')

gradle = gradle
  .replace(/versionCode \d+/, `versionCode ${versionCode}`)
  .replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`)

const keystore = resolve('build/android/demo.keystore').replace(/\\/g, '/')
if (!gradle.includes('signingConfigs.demo')) {
  gradle += `
// Firma della demo (scripts/android-prepare.mjs).
android {
    signingConfigs {
        demo {
            storeFile file("${keystore}")
            storePassword "android"
            keyAlias "daprodfinanza-demo"
            keyPassword "android"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.demo
        }
    }
}
`
}

writeFileSync(gradleFile, gradle)
console.log(`Android pronto: versione ${pkg.version} (versionCode ${versionCode}), firma demo.`)
