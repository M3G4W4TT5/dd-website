import { notFound } from "next/navigation";

// Keep unknown URLs inside the normal route tree so PageTransition survives
// navigation and can finish its loader/colour/reveal sequence.
export default function MissingPage() {
  notFound();
}
