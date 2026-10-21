#pragma once
// Copy OUTSIDE version control to local_config.hpp only after supervised review.
// Deliberately incomplete: this example cannot enable hardware.
// Do not paste credentials into a committed file.
#include <taph_core.hpp>
namespace bench {
inline taph::Config makeConfig() {
  taph::Config c;
  c.hardwareEnabled = false; // requires explicit local change and TAPH_ENABLE_HARDWARE=1
  // Supply localBenchReviewConfirmed, flowCalibrationReviewed, faultPolicyReviewed,
  // localReviewId, flowCalibrationRecordId, mappingCalibrationRecordId,
  // serverDeploymentReviewId, controllerId, mappingId,
  // measured pulseHzPerLMin, allowed flow/pitch/servo limits, reviewed affine mapping,
  // sample/freshness/deadline settings and reviewed fault action.
  // No identity mapping or 7.5 pulse calibration is silently supplied here.
  return c;
}
inline constexpr int flowPin = -1, currentAdcPin = -1, servoPin = -1, pumpRelayPin = -1;
inline constexpr int pumpInactiveLevel = -1; // actual verified HIGH/LOW, not assumed
inline constexpr int servoMinPulseUs = 0, servoMaxPulseUs = 0;
inline constexpr uint32_t minimumPulseIntervalUs = 0; // measured/justified filter
inline constexpr bool electricalConfigurationReviewed = false;
inline constexpr bool externalShutdownReviewed = false;
inline constexpr bool servoAttachTransientReviewed = false;
inline constexpr bool networkIsolationReviewed = false;
inline constexpr bool inputPullupReviewed = false;
inline constexpr char wifiSsid[] = "";
inline constexpr char wifiPassword[] = "";
inline constexpr char commandBaseUrl[] = ""; // e.g. http://reviewed-host:3000 (isolated bench)
// Raw ADC is always logged; calibrated current is optional and never inferred.
inline constexpr bool currentCalibrationReviewed = false;
inline constexpr double currentZeroAdcCounts = 0, currentAmpsPerAdcCount = 0;
inline constexpr char currentCalibrationRecordId[] = "";
}
