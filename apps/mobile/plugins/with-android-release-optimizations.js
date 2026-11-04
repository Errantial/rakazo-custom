// Shrinks Android release builds: R8 + resource shrinking and keep rules for classes
// reached by reflection or JNI. The sideload APK (EAS profile android-apk) is also
// arm64-only; Play AABs already split per ABI, so dropping ABIs there only loses devices.
const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod, withGradleProperties } = require("expo/config-plugins");

const GRADLE_PROPERTIES = {
  "android.enableMinifyInReleaseBuilds": "true",
  "android.enableShrinkResourcesInReleaseBuilds": "true",
};

const MARKER = "# rakazo release keep rules";
const KEEP_RULES = [
  "-keep class com.rakazo.** { *; }",
  "-keep class expo.modules.** { *; }",
  "-keep class com.swmansion.reanimated.** { *; }",
  "-keep class com.swmansion.worklets.** { *; }",
];

function applyGradleProperties(props) {
  const wanted = { ...GRADLE_PROPERTIES };
  if (process.env.EAS_BUILD_PROFILE === "android-apk")
    wanted.reactNativeArchitectures = "arm64-v8a";
  const rest = props.filter((p) => !(p.type === "property" && p.key in wanted));
  const set = Object.entries(wanted).map(([key, value]) => ({
    type: "property",
    key,
    value,
  }));
  return [...rest, ...set];
}

function appendKeepRules(text) {
  if (text.includes(MARKER)) return text;
  const sep = text === "" || text.endsWith("\n") ? "" : "\n";
  return `${text}${sep}\n${MARKER}\n${KEEP_RULES.join("\n")}\n`;
}

function withAndroidReleaseOptimizations(config) {
  config = withGradleProperties(config, (cfg) => {
    cfg.modResults = applyGradleProperties(cfg.modResults);
    return cfg;
  });
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, "app", "proguard-rules.pro");
      const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      fs.writeFileSync(file, appendKeepRules(current));
      return cfg;
    },
  ]);
}

module.exports = withAndroidReleaseOptimizations;
module.exports.KEEP_RULES = KEEP_RULES;
module.exports.applyGradleProperties = applyGradleProperties;
module.exports.appendKeepRules = appendKeepRules;
