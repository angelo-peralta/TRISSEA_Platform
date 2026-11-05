import { AppButton, AppScreen, InfoSection } from '@trissea/mobile-ui';

export function HomeScreen() {
  return <AppScreen title="Driver home">
    <InfoSection title="Offline ? Development preview">No shift is active. This app is not collecting or transmitting location.</InfoSection>
    <InfoSection title="Verification required">Sign-in, city/TODA authorization and driver/vehicle verification will be added in a later milestone. No affiliation or vehicle is assumed.</InfoSection>
    <AppButton label="Go online unavailable in M1" disabled />
    <InfoSection title="No offers available">Dispatch, trip actions and cash collection are disabled in this preview.</InfoSection>
  </AppScreen>;
}
