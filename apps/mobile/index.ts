// Start the Keystore reads the startup gate needs before the app's modules load.
const secureStore = require("expo-secure-store");
require("./lib/prefetch").prefetchSecureValues(secureStore);
require("./lib/monitoring").installMobileEarlyErrorReporting(
  secureStore,
  require("expo-application"),
);
require("./lib/startup").startMobileStartupWatchdog();
require("./lib/monitoring-bootstrap").startMobileMonitoring();
// Expo's entry registers the root component after the early error handler exists.
require("expo-router/entry");
