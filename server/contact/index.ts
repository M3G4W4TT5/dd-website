import { primaryContact, bookingContact, type Site } from "@dd/contracts";
import { personalEmail, type Mailer } from "@dd/mail";
import { personalAutoReply, bookingAutoReply } from "./templates";
export { personalAutoReply, bookingAutoReply } from "./templates";
export async function contact(
  site: Site,
  raw: unknown,
  send: Mailer,
  admission: { inquiry: () => Promise<() => Promise<void>>; acknowledgement: (email:string) => Promise<(() => Promise<void>) | undefined> },
) {
  const input = (site === "primary" ? primaryContact : bookingContact).parse(
    raw,
  );
  if (input.website) return;
  const personalSubjects = {
    dance: "Dance / performance",
    choreography: "Choreography",
    modelling: "Modelling",
    brand_partnerships: "Brand partnerships",
    other: "Other",
  };
  const bookingTopics = { booking: "Booking", event: "Event", other: "Other" };
  const topic =
    "subject" in input
      ? personalSubjects[input.subject]
      : bookingTopics[input.topic];
  const name =
    site === "primary" ? "DD personal site" : "TTD Studio booking site";
  const mailbox =
    site === "primary" ? "contact@didde-mie.com" : "booking@didde-mie.com";
  const inquiryText = `New ${name} inquiry\n\nName: ${input.name}\nEmail: ${input.email}\nTopic: ${topic}\n\nMessage:\n${input.message}`;
  const releaseInquiry = await admission.inquiry();
  try { await send("inquiry", {
    to: mailbox,
    replyTo: { name: input.name, address: input.email },
    subject: `[${name}] ${topic}`,
    ...(site === "primary" ? personalEmail(inquiryText.replace(`New ${name} inquiry`, "I’ve received a new inquiry through my website.")) : { text: inquiryText }),
  }); } finally { await releaseInquiry(); }
  try {
    const releaseAcknowledgement = await admission.acknowledgement(input.email);
    if (releaseAcknowledgement) {
      try {
      await send(
        "acknowledgement",
        site === "primary"
          ? personalAutoReply(input.name, input.email)
          : bookingAutoReply(input.name, input.email),
      );
      } finally { await releaseAcknowledgement(); }
    }
  } catch {
    console.error("Contact acknowledgement failed; inquiry accepted");
  }
}
