#pragma once
#include <taph_core.hpp>
// Host-test fixture only: no physical records, GPIO or network are used by this build.
namespace bench {
inline taph::Config makeConfig(){taph::Config c;c.hardwareEnabled=true;c.localBenchReviewConfirmed=true;
 c.flowCalibrationReviewed=true;c.faultPolicyReviewed=true;c.localReviewId="mock-local-review";
 c.flowCalibrationRecordId="mock-flow-record";c.mappingCalibrationRecordId="mock-mapping-record";
 c.serverDeploymentReviewId="mock-server-review";c.controllerId="mock-controller";c.mappingId="mock-mapping";
 c.pulseHzPerLMin=10;c.minPitchDeg=10;c.maxPitchDeg=75;c.minServoDeg=10;c.maxServoDeg=75;
 c.servoDegreesPerPitchDegree=1;c.faultAction=taph::FaultAction::RemovePwm;return c;}
inline constexpr int flowPin=19,currentAdcPin=34,servoPin=5,pumpRelayPin=26,pumpInactiveLevel=HIGH;
inline constexpr int servoMinPulseUs=500,servoMaxPulseUs=2400;
inline constexpr uint32_t minimumPulseIntervalUs=100;
inline constexpr bool electricalConfigurationReviewed=true,externalShutdownReviewed=true,networkIsolationReviewed=true,inputPullupReviewed=true,servoAttachTransientReviewed=true;
inline constexpr char wifiSsid[]="mock",wifiPassword[]="mock-not-a-credential",commandBaseUrl[]="http://mock.invalid";
inline constexpr bool currentCalibrationReviewed=false;
inline constexpr double currentZeroAdcCounts=0,currentAmpsPerAdcCount=0;
inline constexpr char currentCalibrationRecordId[]="";
}
