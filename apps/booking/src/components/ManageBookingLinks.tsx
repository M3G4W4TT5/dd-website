import { bookingSummaryLabels, type ManagedBookingSummary } from "../lib/managed-booking-summary";

export function ManageBookingLinks({ bookings, language }: {
  bookings: ManagedBookingSummary[];
  language: "da" | "en";
}) {
  return <ul className="manage-access-links">{bookings.map((booking) => {
    const labels = bookingSummaryLabels(booking, language);
    return <li key={booking.reference}>
      <a href={`/manage/booking?code=${encodeURIComponent(booking.reference)}&lang=${language}`} rel="noreferrer">
        <span>{labels.date}</span><span>{labels.time}</span><span>{labels.duration}</span>
      </a>
    </li>;
  })}</ul>;
}
