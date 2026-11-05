import { AppScreen, InfoSection } from '@trissea/mobile-ui';

const services = [
  { title: 'Regular · Unavailable', description: 'Private A to B travel. Booking requires approved fares, service areas and verified operators.' },
  { title: 'Shared · OFF', description: 'Per-seat travel requires approved corridors, seating rules and tested capacity controls.' },
  { title: 'Special · OFF', description: 'Exclusive vehicle hire requires an approved whole-vehicle fare policy.' },
  { title: 'Reservation · Coming later', description: 'Passenger pickup windows at approved TODA terminals are deferred from the pilot launch.' },
];

export function HomeScreen() {
  return <AppScreen title="Where are you going?">
    <InfoSection title="Ride services are not enabled">This preview does not request your location, quote a fare or create a booking.</InfoSection>
    {services.map(service => <InfoSection key={service.title} title={service.title}>{service.description}</InfoSection>)}
  </AppScreen>;
}
