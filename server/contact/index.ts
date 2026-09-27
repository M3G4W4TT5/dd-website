import { primaryContact, bookingContact, type Site } from "@dd/contracts";
import type { Mailer } from "@dd/mail";
import { personalAutoReply, bookingAutoReply } from "./templates";
export { personalAutoReply, bookingAutoReply } from "./templates";
export async function contact(
  site: Site,
  raw: unknown,
  send: Mailer,
  reserve: (email: string) => Promise<boolean>,
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
  await send("inquiry", {
    to: mailbox,
    replyTo: { name: input.name, address: input.email },
    subject: `[${name}] ${topic}`,
    text: `New ${name} inquiry\n\nName: ${input.name}\nEmail: ${input.email}\nTopic: ${topic}\n\nMessage:\n${input.message}`,
  });
  try {
    if (await reserve(input.email)) {
      await send(
        "acknowledgement",
        site === "primary"
          ? personalAutoReply(input.name, input.email)
          : bookingAutoReply(input.name, input.email),
      );
    }
  } catch {
    console.error("Contact acknowledgement failed; inquiry accepted");
  }
}
